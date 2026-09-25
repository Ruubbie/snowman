import SwiftUI

@main
struct OlafApp: App {
    @State private var session = Session()
    @State private var health = HealthSync()

    var body: some Scene {
        WindowGroup {
            ZStack {
                Theme.surface.ignoresSafeArea()
                if session.isPaired {
                    ChatView()
                } else {
                    PairView()
                }
            }
            .environment(session)
            .environment(health)
            .tint(.carrot)
            .preferredColorScheme(.light)
        }
    }
}
