import Foundation
import os
import UIKit
import UserNotifications

/// Where the system notification permission stands.
enum NotificationPermissionStatus: Equatable, Sendable {
    /// Never asked: show the primer, then call `NotificationPermission.request()`.
    case notDetermined
    /// The creator said no (or switched it off in Settings): explain, offer `openSystemSettings()`, and keep everything else working.
    case denied
    case authorized
    /// Delivered quietly (provisional) or for an App Clip (ephemeral): treated as allowed.
    case provisional
}

/// The one place the app asks for notification permission. The ask is contextual and comes after the first submission ("Know the minute you're
/// paid"), never at launch; a denial never blocks a flow. Tapping a notification arrives through `NotificationRouter` as a `DeepLink`.
@MainActor
enum NotificationPermission {
    /// The current status.
    static func status() async -> NotificationPermissionStatus {
        let settings: UNNotificationSettings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            return NotificationPermissionStatus.notDetermined
        case .denied:
            return NotificationPermissionStatus.denied
        case .authorized:
            return NotificationPermissionStatus.authorized
        case .provisional, .ephemeral:
            return NotificationPermissionStatus.provisional
        @unknown default:
            return NotificationPermissionStatus.notDetermined
        }
    }

    /// Shows the system prompt (alerts, badges, sounds). Returns true when notifications are allowed afterwards.
    @discardableResult
    static func request() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            FlowdLog.deepLink.error("Notification permission request failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Opens flowd's page in the Settings app (the recovery path after a denial).
    static func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            return
        }
        UIApplication.shared.open(url)
    }
}
