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
    private static let mps = HKUnit.meter().unitDivided(by: .second())
    private static let pct = HKUnit.percent()

    /// Single readings, one row per sample. `scale` 100 turns a 0...1 percentage into 0...100.
    private static let quantities: [(id: HKQuantityTypeIdentifier, name: String, unit: HKUnit, scale: Double)] = [
        (.restingHeartRate, "resting_hr", bpm, 1),
        (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli), 1),
        (.vo2Max, "vo2max", HKUnit(from: "ml/kg*min"), 1),
        (.bodyMass, "body_mass", .gramUnit(with: .kilo), 1),
        (.bodyFatPercentage, "body_fat_pct", pct, 100),
        (.bodyMassIndex, "bmi", .count(), 1),
        (.leanBodyMass, "lean_mass_kg", .gramUnit(with: .kilo), 1),
        (.walkingHeartRateAverage, "walking_hr", bpm, 1),
        (.respiratoryRate, "respiratory_rate", bpm, 1),
        (.oxygenSaturation, "spo2_pct", pct, 100),
        (.appleSleepingWristTemperature, "wrist_temp", .degreeCelsius(), 1),
        (.bloodPressureSystolic, "bp_systolic", .millimeterOfMercury(), 1),
        (.bloodPressureDiastolic, "bp_diastolic", .millimeterOfMercury(), 1),
        (.bloodGlucose, "glucose", HKUnit(from: "mg/dL"), 1),
        (.walkingSpeed, "walking_speed", mps, 1),
        (.walkingStepLength, "step_length", .meterUnit(with: .centi), 1),
        (.walkingAsymmetryPercentage, "walk_asymmetry_pct", pct, 100),
        (.walkingDoubleSupportPercentage, "double_support_pct", pct, 100),
        (.appleWalkingSteadiness, "steadiness_pct", pct, 100),
        (.sixMinuteWalkTestDistance, "six_min_walk_m", .meter(), 1),
        (.stairAscentSpeed, "stair_up_speed", mps, 1),
        (.stairDescentSpeed, "stair_down_speed", mps, 1),
    ]

    /// One total (or average) per local day, from HealthKit's own statistics.
    private static let daily: [(id: HKQuantityTypeIdentifier, name: String, unit: HKUnit, option: HKStatisticsOptions)] = [
        (.stepCount, "steps", .count(), .cumulativeSum),
        (.distanceWalkingRunning, "walk_run_m", .meter(), .cumulativeSum),
        (.distanceCycling, "cycling_m", .meter(), .cumulativeSum),
        (.flightsClimbed, "flights", .count(), .cumulativeSum),
        (.activeEnergyBurned, "active_kcal", .kilocalorie(), .cumulativeSum),
        (.basalEnergyBurned, "basal_kcal", .kilocalorie(), .cumulativeSum),
        (.appleExerciseTime, "exercise_min", .minute(), .cumulativeSum),
        (.appleStandTime, "stand_min", .minute(), .cumulativeSum),
        (.timeInDaylight, "daylight_min", .minute(), .cumulativeSum),
        (.dietaryWater, "water_ml", .literUnit(with: .milli), .cumulativeSum),
        (.dietaryCaffeine, "caffeine_mg", .gramUnit(with: .milli), .cumulativeSum),
        (.dietaryEnergyConsumed, "food_kcal", .kilocalorie(), .cumulativeSum),
        (.dietaryProtein, "protein_g", .gram(), .cumulativeSum),
        (.headphoneAudioExposure, "headphone_db", .decibelAWeightedSoundPressureLevel(), .discreteAverage),
        (.environmentalAudioExposure, "noise_db", .decibelAWeightedSoundPressureLevel(), .discreteAverage),
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
            var read: Set<HKObjectType> = [
                HKObjectType.workoutType(), HKCategoryType(.sleepAnalysis), HKCategoryType(.mindfulSession), HKQuantityType(.heartRate),
            ]
            for q in Self.quantities { read.insert(HKQuantityType(q.id)) }
            for d in Self.daily { read.insert(HKQuantityType(d.id)) }
            if #available(iOS 18.0, *) { read.insert(HKSampleType.stateOfMindType()) }
            try await store.requestAuthorization(toShare: [], read: read)

            var samples: [[String: Any]] = []
            var anchors: [String: HKQueryAnchor] = [:]
            let since = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-90 * 86400), end: nil)

            // A type that fails (not on this device) is skipped; its anchor stays, so it's retried next time.
            for q in Self.quantities {
                let query = HKAnchoredObjectQueryDescriptor(
                    predicates: [.quantitySample(type: HKQuantityType(q.id), predicate: since)],
                    anchor: Self.anchor(q.name)
                )
                guard let result = try? await query.result(for: store) else { continue }
                let unit = q.scale == 100 ? "%" : q.unit.unitString
                samples += result.addedSamples.map {
                    Self.row($0, type: q.name, value: $0.quantity.doubleValue(for: q.unit) * q.scale, unit: unit)
                }
                anchors[q.name] = result.newAnchor
            }

            // Daily totals: re-sent from the day before the last sync, so today's growing total is kept current.
            let from = Self.dailyFrom()
            for d in Self.daily {
                for s in (try? await dailyStats(d.id, d.option, from: from)) ?? [] {
                    let q = d.option == .cumulativeSum ? s.sumQuantity() : s.averageQuantity()
                    if let q { samples.append(Self.dayRow(d.name, day: s.startDate, value: q.doubleValue(for: d.unit), unit: d.unit.unitString)) }
                }
            }
            for s in (try? await dailyStats(.heartRate, [.discreteAverage, .discreteMin, .discreteMax], from: from)) ?? [] {
                for (name, q) in [("heart_rate_avg", s.averageQuantity()), ("heart_rate_min", s.minimumQuantity()), ("heart_rate_max", s.maximumQuantity())] {
                    if let q { samples.append(Self.dayRow(name, day: s.startDate, value: q.doubleValue(for: Self.bpm), unit: "bpm")) }
                }
            }

            if let mindful = try? await HKAnchoredObjectQueryDescriptor(
                predicates: [.categorySample(type: HKCategoryType(.mindfulSession), predicate: since)],
                anchor: Self.anchor("mindful")
            ).result(for: store) {
                samples += mindful.addedSamples.map {
                    Self.row($0, type: "mindful_min", value: $0.endDate.timeIntervalSince($0.startDate) / 60, unit: "min")
                }
                anchors["mindful"] = mindful.newAnchor
            }

            // State of Mind (logged in the Health app or on a Watch): valence from -1 to 1.
            if #available(iOS 18.0, *), let mood = try? await HKAnchoredObjectQueryDescriptor(
                predicates: [.stateOfMind(since)],
                anchor: Self.anchor("mood")
            ).result(for: store) {
                samples += mood.addedSamples.map {
                    Self.row($0, type: $0.kind == .dailyMood ? "mood_day" : "mood_moment", value: $0.valence, unit: "valence")
                }
                anchors["mood"] = mood.newAnchor
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
            UserDefaults.standard.set(Calendar.current.startOfDay(for: Date()), forKey: "hk.daily.synced")
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

    // MARK: - daily totals

    private func dailyStats(_ id: HKQuantityTypeIdentifier, _ options: HKStatisticsOptions, from start: Date) async throws -> [HKStatistics] {
        let query = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(id), predicate: HKQuery.predicateForSamples(withStart: start, end: nil)),
            options: options,
            anchorDate: start,
            intervalComponents: DateComponents(day: 1)
        )
        return try await query.result(for: store).statistics()
    }

    /// Local midnight of the day before the last sync; 90 days back the first time.
    private static func dailyFrom() -> Date {
        let cal = Calendar.current
        let floor = cal.startOfDay(for: Date().addingTimeInterval(-90 * 86400))
        guard let last = UserDefaults.standard.object(forKey: "hk.daily.synced") as? Date,
              let from = cal.date(byAdding: .day, value: -1, to: last) else { return floor }
        return max(from, floor)
    }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// One row per type and local day. The id is fixed, so a re-sent day overwrites itself.
    /// Stamped at local noon, so the server files it under the right day in any time zone.
    private static func dayRow(_ name: String, day: Date, value: Double, unit: String) -> [String: Any] {
        let noon = iso.string(from: day.addingTimeInterval(12 * 3600))
        return [
            "uuid": "d:\(name):\(dayFormat.string(from: day))",
            "type": name,
            "start": noon,
            "end": noon,
            "value": value,
            "unit": unit,
            "source": "Apple Health",
        ]
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
