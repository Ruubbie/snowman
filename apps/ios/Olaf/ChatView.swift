import SwiftUI

struct ChatMessage: Identifiable {
    let id = UUID()
    let fromOlaf: Bool
    let text: String
}

struct ChatView: View {
    @Environment(Session.self) private var session
    @State private var messages: [ChatMessage] = []
    @State private var conversationId: String?
    @State private var draft = ""
    @State private var thinking = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(messages) { bubble($0).id($0.id) }
                        if thinking {
                            ProgressView().padding(.horizontal)
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding()
                }
                .onChange(of: messages.count) {
                    withAnimation { proxy.scrollTo("bottom") }
                }
            }
            .safeAreaInset(edge: .bottom) { composer }
            .navigationTitle("olaf")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Menu {
                    Button("New conversation") {
                        messages = []
                        conversationId = nil
                    }
                    Button("Unpair", role: .destructive) { session.unpair() }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    private func bubble(_ message: ChatMessage) -> some View {
        Text(message.text)
            .padding(12)
            .background(message.fromOlaf ? Color(.secondarySystemBackground) : Color.carrot.opacity(0.15))
            .frame(maxWidth: .infinity, alignment: message.fromOlaf ? .leading : .trailing)
    }

    private var composer: some View {
        HStack {
            TextField("Talk to Olaf", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2)
            }
            .disabled(thinking || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding()
        .background(.bar)
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
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
