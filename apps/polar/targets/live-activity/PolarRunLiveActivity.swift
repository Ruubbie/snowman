import ActivityKit
import SwiftUI
import WidgetKit

// DESIGN: palette is locked in - accent #F64B29 (orange), navy #1B212C,
// slate #3C4657, peach #FFD6AE. Lock screen: light background, navy text.
// Dynamic Island: system black background, white/peach text, orange accent
// for the current-segment indicator and the countdown. Geometric system
// sans, uppercase letter-spaced small labels, bold tabular (monospacedDigit)
// numbers for time/distance/pace, almost-square corners, minimal. Layout
// itself (spacing, sizing, real iconography) is still a placeholder - final
// pass comes later.
private extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255
    )
  }

  static let polarAccent = Color(hex: 0xF6_4B29)
  static let polarNavy = Color(hex: 0x1B_212C)
  static let polarSlate = Color(hex: 0x3C_4657)
  static let polarPeach = Color(hex: 0xFF_D6AE)
  static let polarLockBackground = Color(hex: 0xF5_F7FA)
}

struct PolarRunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PolarRunAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color.polarLockBackground)
        .activitySystemActionForegroundColor(Color.polarNavy)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          SegmentIndicator(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          CountdownText(state: context.state)
            .font(.title3.bold())
            .monospacedDigit()
            .foregroundStyle(Color.polarAccent)
        }
        DynamicIslandExpandedRegion(.bottom) {
          StatsRow(state: context.state, labelColor: .polarPeach, valueColor: .white)
        }
      } compactLeading: {
        SquareDot()
      } compactTrailing: {
        CountdownText(state: context.state)
          .font(.caption2)
          .monospacedDigit()
          .foregroundStyle(.white)
      } minimal: {
        SquareDot()
      }
      .widgetLabel {
        SegmentIndicator(state: context.state)
      }
    }
  }
}

// MARK: - Shared pieces

/// "Almost square" (minimal corner radius) accent indicator for the
/// Dynamic Island's compact/minimal presentations.
private struct SquareDot: View {
  var body: some View {
    RoundedRectangle(cornerRadius: 2)
      .fill(Color.polarAccent)
      .frame(width: 10, height: 10)
  }
}

private struct SegmentIndicator: View {
  let state: PolarRunAttributes.ContentState

  var body: some View {
    HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 2)
        .fill(Color.polarAccent)
        .frame(width: 4, height: 14)
      Text(state.segmentKind.uppercased())
        .font(.caption.weight(.semibold))
        .tracking(1.2)
        .foregroundStyle(Color.polarAccent)
    }
  }
}

private struct CountdownText: View {
  let state: PolarRunAttributes.ContentState

  var body: some View {
    if state.isPaused {
      Text("PAUSED")
    } else if let endsAt = state.segmentEndsAt {
      let end = max(endsAt, Date().addingTimeInterval(1))
      Text(timerInterval: Date()...end, countsDown: true)
    } else {
      Text("--:--")
    }
  }
}

private struct StatsRow: View {
  let state: PolarRunAttributes.ContentState
  let labelColor: Color
  let valueColor: Color

  var body: some View {
    HStack(spacing: 20) {
      Stat(label: "DISTANCE", value: distanceText, labelColor: labelColor, valueColor: valueColor)
      if let pace = state.paceSPerKm {
        Stat(label: "PACE", value: "\(paceText(pace))/km", labelColor: labelColor, valueColor: valueColor)
      }
    }
  }

  private var distanceText: String {
    String(format: "%.2f km", state.distanceM / 1000)
  }

  private func paceText(_ secondsPerKm: Double) -> String {
    let total = Int(secondsPerKm.rounded())
    return String(format: "%d:%02d", total / 60, total % 60)
  }
}

private struct Stat: View {
  let label: String
  let value: String
  let labelColor: Color
  let valueColor: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption2.weight(.semibold))
        .tracking(1.0)
        .foregroundStyle(labelColor)
      Text(value)
        .font(.body.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(valueColor)
    }
  }
}

// MARK: - Lock screen

private struct LockScreenView: View {
  let state: PolarRunAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      SegmentIndicator(state: state)
      CountdownText(state: state)
        .font(.system(size: 40, weight: .bold))
        .monospacedDigit()
        .foregroundStyle(Color.polarAccent)
      StatsRow(state: state, labelColor: .polarSlate, valueColor: .polarNavy)
    }
    .padding(16)
  }
}
