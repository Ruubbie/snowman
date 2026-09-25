import SwiftUI

struct ChatMessage: Identifiable {
    let id = UUID()
    let fromOlaf: Bool
    let text: String
}

struct ChatView: View {
    @Environment(Session.self) private var session
    @Environment(HealthSync.self) private var health
    @Environment(\.scenePhase) private var scenePhase
    @State private var messages: [ChatMessage] = []
    @State private var conversationId: String?
    @State private var draft = ""
    @State private var thinking = false

    private let suggestions = ["How am I recovering?", "What should I train today?", "How did I sleep this week?"]

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if messages.isEmpty { welcome }
                        ForEach(messages) { bubble($0) }
                        if thinking {
                            ProgressView().padding(.leading, 8)
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(24)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.count) {
                    withAnimation { proxy.scrollTo("bottom") }
                }
            }
            composer
        }
        .task { await health.sync(session: session) }
        .onChange(of: scenePhase) {
            if scenePhase == .active { Task { await health.sync(session: session) } }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Brand()
                Spacer()
                Button {
                    Task { await health.sync(session: session) }
                } label: {
                    Image(systemName: health.busy ? "arrow.triangle.2.circlepath" : "heart")
                        .foregroundStyle(Color.carrot)
                }
                .buttonStyle(RoundIconButtonStyle())
                Menu {
                    Button("New conversation") {
                        messages = []
                        conversationId = nil
                    }
                    Button("Unpair", role: .destructive) { session.unpair() }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .soft(22)
                }
                .padding(.leading, 12)
            }
            if let status = health.status {
                Text(status).font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What's on\nyour mind?")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(Theme.ink)
                .padding(.top, 40)
            ForEach(suggestions, id: \.self) { text in
                Button {
                    draft = text
                    Task { await send() }
                } label: {
                    HStack(spacing: 12) {
                        Text(text)
                        Image(systemName: "arrow.right").foregroundStyle(Color.carrot)
                    }
                }
                .buttonStyle(PillButtonStyle())
            }
        }
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private func bubble(_ message: ChatMessage) -> some View {
        if message.fromOlaf {
            Text(message.text)
                .foregroundStyle(Theme.ink)
                .padding(16)
                .soft(20)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(message.text)
                .foregroundStyle(.white)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.carrot))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.leading, 40)
        }
    }

    private var composer: some View {
        HStack(spacing: 12) {
            TextField("Talk to Olaf", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(14)
                .softInset(22)
            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up").foregroundStyle(Color.carrot)
            }
            .buttonStyle(RoundIconButtonStyle())
            .disabled(thinking || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .background(Theme.surface)
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        thinking = true
        messages.append(ChatMessage(fromOlaf: false, text: text))
        do {
            let res = try await session.chat(text, conversationId: conversationId)
            conversationId = res.conversationId
            messages.append(ChatMessage(fromOlaf: true, text: res.reply))
        } catch {
            messages.append(ChatMessage(fromOlaf: true, text: "(\(error.localizedDescription))"))
        }
        thinking = false
    }
}
