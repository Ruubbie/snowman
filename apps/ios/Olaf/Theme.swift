import SwiftUI

/// Soft, light UI: one grey surface, raised elements with a dark and a light
/// shadow, carrot orange as the only accent.
enum Theme {
    static let surface = Color(red: 0.937, green: 0.937, blue: 0.937)
    static let ink = Color(red: 0.13, green: 0.13, blue: 0.14)
    static let muted = Color(red: 0.47, green: 0.47, blue: 0.49)
}

extension Color {
    /// Olaf's nose. The only warm colour (design/olaf-ds/tokens.css).
    static let carrot = Color(red: 1, green: 0x6B / 255, blue: 0x1A / 255)
}

extension View {
    /// Raised off the surface.
    func soft(_ radius: CGFloat = 22) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Theme.surface)
                .shadow(color: .black.opacity(0.10), radius: 12, x: 7, y: 7)
                .shadow(color: .white.opacity(0.95), radius: 12, x: -7, y: -7)
        )
    }

    /// Pressed into the surface (text fields).
    func softInset(_ radius: CGFloat = 18) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Color.black.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(Color.white.opacity(0.9), lineWidth: 1)
                )
        )
    }
}

struct PillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 26)
            .padding(.vertical, 15)
            .soft(30)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct RoundIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Theme.ink)
            .frame(width: 44, height: 44)
            .soft(22)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

/// The carrot mark and the wordmark.
struct Brand: View {
    var body: some View {
        HStack(spacing: 10) {
            Image("Mark").resizable().scaledToFit().frame(width: 30, height: 30)
            Text("Olaf").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
        }
    }
}
