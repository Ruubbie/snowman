import SwiftUI

struct PairView: View {
    @Environment(Session.self) private var session
    @AppStorage("lastServer") private var server = "olaf.ruubbie.nl"
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    private var canPair: Bool { !busy && !server.isEmpty && code.count == 6 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Brand().padding(.top, 8)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Hi, I'm Olaf")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(Theme.ink)
                    Text("Pair this iPhone with your Snowman server and we can get going.")
                        .foregroundStyle(Theme.muted)
                }
                .padding(.top, 60)

                VStack(spacing: 14) {
                    TextField("Server", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(16)
                        .softInset()
                    TextField("Pairing code", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                        .padding(16)
                        .softInset()
                }

                Button {
                    Task { await pair() }
                } label: {
                    HStack(spacing: 14) {
                        Text(busy ? "Pairing…" : "Pair with Olaf")
                        Image(systemName: "arrow.right")
                    }
                }
                .buttonStyle(PillButtonStyle())
                .disabled(!canPair)
                .opacity(canPair ? 1 : 0.5)

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Color.carrot)
                }

                Text("Get a code on the server with scripts/pair.js (see the README).")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            .padding(24)
        }
    }

    private func pair() async {
        busy = true
        error = nil
        do {
            try await session.pair(server: server, code: code)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
