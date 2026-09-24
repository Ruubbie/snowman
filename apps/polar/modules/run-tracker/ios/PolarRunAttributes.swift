import ActivityKit
import Foundation

/// Live Activity contract for a Polar run. This file is intentionally
/// duplicated byte-for-byte in the widget extension target
/// (apps/polar/targets/live-activity/PolarRunAttributes.swift) because the
/// app and the widget extension are separate compiled targets that don't
/// share Swift source automatically. If you change one, change both.
struct PolarRunAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// "warmup" | "run" | "walk" | "cooldown"
    var segmentKind: String
    var segmentIndex: Int
    /// Wall-clock time the current segment ends at, for Text(timerInterval:)
    /// countdowns that keep ticking without a Live Activity update. Nil when
    /// paused or when there is no planned segment (free run).
    var segmentEndsAt: Date?
    var distanceM: Double
    var paceSPerKm: Double?
    var isPaused: Bool
  }
}
