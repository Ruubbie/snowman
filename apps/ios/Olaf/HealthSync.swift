import Foundation
import HealthKit
import Observation

/// Apple Health -> Olaf. Reads what's new since the last sync (anchored
/// queries, first sync goes back 90 days) and sends it to /v1/health/import.
/// An anchor is only saved after the server accepted the data.
@MainActor
@Observable
final class HealthSync {
    private let store = HKHealthStore()
    private(set) var busy = false
    private(set) var status: String?

    private static let bpm = HKUnit.count().unitDivided(by: .minute())
    private static let quantities: [(id: HKQuantityTypeIdentifier, name: String, unit: HKUnit)] = [
        (.restingHeartRate, "resting_hr", bpm),
        (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli)),
        (.vo2Max, "vo2max", HKUnit(from: "ml/kg*min")),
        (.bodyMass, "body_mass", .gramUnit(with: .kilo)),
    ]

    func sync(session: Session) async {
        guard !busy, session.isPaired else { return }
        guard HKHealthStore.isHealthDataAvailable() else {
            status = "Apple Health isn't available on this device."
            return
        }
        busy = true
        defer { busy = false }
        do {
            var read: Set<HKObjectType> = [HKObjectType.workoutType(), HKCategoryType(.sleepAnalysis), HKQuantityType(.heartRate)]
            for q in Self.quantities { read.insert(HKQuantityType(q.id)) }
            try await store.requestAuthorization(toShare: [], read: read)

            var samples: [[String: Any]] = []
            var anchors: [String: HKQueryAnchor] = [:]
            let since = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-90 * 86400), end: nil)

            for q in Self.quantities {
                let query = HKAnchoredObjectQueryDescriptor(
                    predicates: [.quantitySample(type: HKQuantityType(q.id), predicate: since)],
                    anchor: Self.anchor(q.name)
                )
                let result = try await query.result(for: store)
                samples += result.addedSamples.map {
                    Self.row($0, type: q.name, value: $0.quantity.doubleValue(for: q.unit), unit: q.unit.unitString)
                }
                anchors[q.name] = result.newAnchor
            }

            let sleep = try await HKAnchoredObjectQueryDescriptor(
                predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: since)],
                anchor: Self.anchor("sleep")
            ).result(for: store)
            samples += sleep.addedSamples.map {
                Self.row($0, type: "sleep_" + Self.stage($0.value), value: $0.endDate.timeIntervalSince($0.startDate) / 60, unit: "min")
            }
            anchors["sleep"] = sleep.newAnchor

            let workouts = try await HKAnchoredObjectQueryDescriptor(
                predicates: [.workout(since)],
                anchor: Self.anchor("workouts")
            ).result(for: store)
            anchors["workouts"] = workouts.newAnchor

            let res = try await session.importHealth(samples: samples, workouts: workouts.addedSamples.map(Self.workoutRow))
            for (name, anchor) in anchors { Self.save(anchor, name) }
            status = res.samples + res.workouts == 0
                ? "Health is up to date"
                : "Sent \(res.workouts) workouts and \(res.samples) health samples to Olaf"
        } catch {
            status = error.localizedDescription
        }
    }

    // MARK: - rows

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func row(_ s: HKSample, type: String, value: Double, unit: String) -> [String: Any] {
        [
            "uuid": s.uuid.uuidString,
            "type": type,
            "start": iso.string(from: s.startDate),
            "end": iso.string(from: s.endDate),
            "value": value,
            "unit": unit,
            "source": String(s.sourceRevision.source.name.prefix(100)),
        ]
    }

    private static func workoutRow(_ w: HKWorkout) -> [String: Any] {
        var row: [String: Any] = [
            "uuid": w.uuid.uuidString,
            "activity": activity(w.workoutActivityType),
            "start": iso.string(from: w.startDate),
            "end": iso.string(from: w.endDate),
            "duration_s": w.duration,
            "source": String(w.sourceRevision.source.name.prefix(100)),
        ]
        let hr = w.statistics(for: HKQuantityType(.heartRate))
        if let v = w.totalDistance?.doubleValue(for: .meter()) { row["distance_m"] = v }
        if let v = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
            row["energy_kcal"] = v
        }
        if let v = hr?.averageQuantity()?.doubleValue(for: bpm) { row["avg_hr"] = v }
        if let v = hr?.maximumQuantity()?.doubleValue(for: bpm) { row["max_hr"] = v }
        return row
    }

    private static func stage(_ value: Int) -> String {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: return "in_bed"
        case .asleepUnspecified: return "asleep"
        case .awake: return "awake"
        case .asleepCore: return "core"
        case .asleepDeep: return "deep"
        case .asleepREM: return "rem"
        default: return "other"
        }
    }

    private static func activity(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .hiking: return "hiking"
        case .highIntensityIntervalTraining: return "hiit"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength"
        case .yoga: return "yoga"
        default: return "other_\(type.rawValue)"
        }
    }

    // MARK: - anchors

    private static func anchor(_ name: String) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: "hk.anchor.\(name)") else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private static func save(_ anchor: HKQueryAnchor, _ name: String) {
        if let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) {
            UserDefaults.standard.set(data, forKey: "hk.anchor.\(name)")
        }
    }
}
