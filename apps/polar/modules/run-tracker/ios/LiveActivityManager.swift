import ActivityKit
import Foundation

/// Thin wrapper around ActivityKit for the run Live Activity / Dynamic
/// Island. All failures are swallowed - a Live Activity is a nice-to-have,
/// never something that should crash or interrupt a run.
final class LiveActivityManager {
  private var activity: Activity<PolarRunAttributes>?
  private var lastUpdateAt = Date.distantPast
  private let minUpdateInterval: TimeInterval = 10

  private var isAvailable: Bool {
    if #available(iOS 16.1, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    return false
  }

  func start(
    segmentKind: String,
    segmentIndex: Int,
    segmentEndsAt: Date?,
    distanceM: Double,
    paceSPerKm: Double?
  ) {
    guard activity == nil, isAvailable else { return }
    let state = PolarRunAttributes.ContentState(
      segmentKind: segmentKind,
      segmentIndex: segmentIndex,
      segmentEndsAt: segmentEndsAt,
      distanceM: distanceM,
      paceSPerKm: paceSPerKm,
      isPaused: false
    )
    do {
      activity = try Activity<PolarRunAttributes>.request(
        attributes: PolarRunAttributes(),
        content: ActivityContent(state: state, staleDate: nil)
      )
      lastUpdateAt = Date()
    } catch {
      activity = nil
    }
  }

  /// Update the Live Activity. Rate-limited to once every ~10s unless
  /// `force` is set (segment change, pause, resume).
  func update(
    segmentKind: String,
    segmentIndex: Int,
    segmentEndsAt: Date?,
    distanceM: Double,
    paceSPerKm: Double?,
    isPaused: Bool,
    force: Bool = false
  ) {
    guard let activity else { return }
    guard force || Date().timeIntervalSince(lastUpdateAt) >= minUpdateInterval else { return }
    lastUpdateAt = Date()
    let state = PolarRunAttributes.ContentState(
      segmentKind: segmentKind,
      segmentIndex: segmentIndex,
      segmentEndsAt: segmentEndsAt,
      distanceM: distanceM,
      paceSPerKm: paceSPerKm,
      isPaused: isPaused
    )
    Task {
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
  }

  func end(distanceM: Double, paceSPerKm: Double?) {
    guard let activity else { return }
    let state = PolarRunAttributes.ContentState(
      segmentKind: "finished",
      segmentIndex: -1,
      segmentEndsAt: nil,
      distanceM: distanceM,
      paceSPerKm: paceSPerKm,
      isPaused: false
    )
    let dismissAt = Date().addingTimeInterval(60)
    Task {
      await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(dismissAt))
    }
    self.activity = nil
  }
}
