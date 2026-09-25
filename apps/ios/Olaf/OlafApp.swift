import SwiftUI

@main
struct OlafApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            Group {
                if session.isPaired {
                    ChatView()
                } else {
                    PairView()
                }
            }
            .environment(session)
            .tint(.carrot)
        }
    }
}

extension Color {
    /// The only warm colour in the Olaf design system (design/olaf-ds/tokens.css).
    static let carrot = Color(red: 1, green: 0x6B / 255, blue: 0x1A / 255)
}
