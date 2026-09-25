import SwiftUI

struct PairView: View {
    @Environment(Session.self) private var session
    @AppStorage("lastServer") private var server = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("olaf.ruubbie.nl", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Pairing code", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                } footer: {
                    Text("Get a pairing code on the server (see the README).")
                }
                Section {
                    Button(busy ? "Pairing…" : "Pair") { Task { await pair() } }
                        .disabled(busy || server.isEmpty || code.count != 6)
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("olaf")
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
