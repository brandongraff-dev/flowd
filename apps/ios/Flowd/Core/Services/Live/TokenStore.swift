import Foundation
import Security

/// Where the session token lives. Tokens never go into UserDefaults, the fixtures or the logs.
protocol TokenStore: Sendable {
    func token() -> String?
    func save(_ token: String?)
}

/// The Keychain: a generic password item readable after the first unlock, never synced to another device.
final class KeychainTokenStore: TokenStore, @unchecked Sendable {
    private let service: String
    private let account: String

    init(service: String = "app.flowd.creator", account: String = "session-token") {
        self.service = service
        self.account = account
    }

    private func baseQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    func token() -> String? {
        var query: [String: Any] = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status: OSStatus = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String?) {
        let query: [String: Any] = baseQuery()
        SecItemDelete(query as CFDictionary)
        guard let token = token, let data = token.data(using: .utf8) else {
            return
        }
        var add: [String: Any] = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status: OSStatus = SecItemAdd(add as CFDictionary, nil)
        if status != errSecSuccess {
            FlowdLog.api.error("Could not store the session token (status \(status, privacy: .public))")
        }
    }
}

/// An in-memory token (tests and previews).
final class MemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock: NSLock = NSLock()
    private var value: String?

    init(token: String? = nil) {
        self.value = token
    }

    func token() -> String? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func save(_ token: String?) {
        lock.lock()
        defer { lock.unlock() }
        value = token
    }
}
