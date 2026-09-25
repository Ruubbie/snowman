import Foundation
import Observation
import Security
import UIKit

/// The paired server and this device's token. The server URL lives in
/// UserDefaults, the token in the Keychain.
@MainActor
@Observable
final class Session {
    private(set) var serverURL: URL?
    private(set) var token: String?

    var isPaired: Bool { serverURL != nil && token != nil }

    init() {
        serverURL = UserDefaults.standard.url(forKey: "serverURL")
        token = Keychain.read("token")
    }

    func pair(server: String, code: String) async throws {
        let base = try OlafAPI.normalize(server)
        let body: [String: Any] = ["code": code.uppercased(), "deviceName": UIDevice.current.name]
        let res: PairResponse = try await OlafAPI.send(base: base, path: "/v1/pair", token: nil, body: body)
        Keychain.save("token", res.token)
        UserDefaults.standard.set(base, forKey: "serverURL")
        serverURL = base
        token = res.token
    }

    func unpair() {
        Keychain.delete("token")
        UserDefaults.standard.removeObject(forKey: "serverURL")
        serverURL = nil
        token = nil
    }

    /// One message to Olaf; pass the returned conversationId back to continue the conversation.
    func chat(_ message: String, conversationId: String?) async throws -> ChatResponse {
        guard let serverURL, let token else { throw OlafError.notPaired }
        let body: [String: Any] = ["message": message, "conversationId": conversationId ?? NSNull()]
        return try await OlafAPI.send(base: serverURL, path: "/v1/olaf/chat", token: token, body: body)
    }

    /// Apple Health rows built by HealthSync.
    func importHealth(samples: [[String: Any]], workouts: [[String: Any]]) async throws -> ImportResponse {
        guard let serverURL, let token else { throw OlafError.notPaired }
        let body: [String: Any] = ["samples": samples, "workouts": workouts]
        return try await OlafAPI.send(base: serverURL, path: "/v1/health/import", token: token, body: body)
    }
}

struct PairResponse: Decodable { let token: String }
struct ImportResponse: Decodable { let samples: Int; let workouts: Int }
struct ChatResponse: Decodable { let conversationId: String; let reply: String }

enum OlafError: LocalizedError {
    case badURL
    case notPaired
    case server(Int, String?)

    var errorDescription: String? {
        switch self {
        case .badURL: return "That server address doesn't look right."
        case .notPaired: return "Not paired with a server."
        case .server(503, _): return "Olaf is unavailable right now."
        case .server(401, _): return "The server doesn't know this phone any more. Pair again."
        case let .server(status, message): return message ?? "The server said \(status)."
        }
    }
}

enum OlafAPI {
    static func normalize(_ input: String) throws -> URL {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.contains("://") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.host != nil else { throw OlafError.badURL }
        return url
    }

    static func send<T: Decodable>(base: URL, path: String, token: String?, body: [String: Any]?) async throws -> T {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.timeoutInterval = 120 // Olaf can take a while when he uses tools
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw OlafError.server(status, json?["error"] as? String)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
    }

    static func save(_ key: String, _ value: String) {
        SecItemDelete(query(key) as CFDictionary)
        var add = query(key)
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
