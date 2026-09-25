import SwiftUI

/// Today's planned run from Olaf. Record it with the Fitness app (or anything
/// that writes to Apple Health); the next Health sync marks it done.
struct TodayCard: View {
    @Environment(Session.self) private var session
    @Environment(HealthSync.self) private var health
    @State private var today: PlanSession?
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TODAY").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            if let today {
                HStack(alignment: .firstTextBaseline) {
                    Text(today.title).font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
                    Spacer()
                    if today.status == "done" {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.carrot)
                    }
                }
                if today.kind != "rest" {
                    Text(Self.describe(today.segments)).font(.subheadline).foregroundStyle(Theme.ink)
                }
                if let line = today.brief?.opening_line, !line.isEmpty, today.status != "done" {
                    Text(line).font(.subheadline).italic().foregroundStyle(Theme.muted)
                }
                if today.kind != "rest", today.status == "planned" {
                    Text("Record it with the Fitness app; Olaf picks it up from Apple Health.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
            } else {
                Text(loaded ? "Nothing planned today." : "Loading…").foregroundStyle(Theme.muted)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .soft(24)
        // Reload after every Health sync: a synced run marks the session done.
        .task(id: health.busy) {
            guard !health.busy else { return }
            if let res = try? await session.upcoming() {
                today = res.sessions.first { $0.date == res.today }
            }
            loaded = true
        }
    }

    /// "5 min warm-up · 8 × run 1 min, walk 1.5 min · 5 min cool-down"
    static func describe(_ segments: [Segment]) -> String {
        func mins(_ s: Double) -> String {
            let m = s / 60
            return m == m.rounded() ? "\(Int(m)) min" : String(format: "%.1f min", m)
        }
        var parts: [String] = []
        var middle = segments.filter { $0.kind == "run" || $0.kind == "walk" }
        if let w = segments.first(where: { $0.kind == "warmup" }) { parts.append("\(mins(w.seconds)) warm-up") }
        if let run = middle.first(where: { $0.kind == "run" }) {
            let reps = middle.filter { $0.kind == "run" }.count
            let walk = middle.first(where: { $0.kind == "walk" })
            let same = middle.allSatisfy { $0.seconds == ($0.kind == "run" ? run.seconds : walk?.seconds) }
            if same, reps > 1 {
                parts.append("\(reps) × run \(mins(run.seconds))" + (walk.map { ", walk \(mins($0.seconds))" } ?? ""))
                middle = []
            }
        }
        parts += middle.map { "\($0.kind) \(mins($0.seconds))" }
        if let c = segments.first(where: { $0.kind == "cooldown" }) { parts.append("\(mins(c.seconds)) cool-down") }
        return parts.joined(separator: " · ")
    }
}

struct Upcoming: Decodable {
    let today: String
    let sessions: [PlanSession]
}

struct PlanSession: Decodable {
    let date: String
    let kind: String
    let title: String
    let segments: [Segment]
    let status: String
    let brief: Brief?
}

struct Segment: Decodable {
    let kind: String
    let seconds: Double
}

struct Brief: Decodable {
    let opening_line: String?
}
