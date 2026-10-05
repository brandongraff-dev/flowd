import UIKit
import UserNotifications

/// Receives notification taps and hands them to the app as `DeepLink`s. Every notification the app schedules (and every push the server sends) carries
/// the destination in its `userInfo` under `"deep_link"` (a `flowd://...` string, the contract's `AppNotification.deepLink`).
///
/// Not main-actor: the delegate callbacks arrive on arbitrary queues, so each one extracts plain values and hops to the main actor.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    /// Set once by `FlowdApp`: opens a link through `AppState.open(_:)`.
    @MainActor static var deepLinkHandler: (@MainActor (DeepLink) -> Void)?

    /// A notification that arrives while the app is open still shows as a banner (money and review news is worth seeing now).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        return [.banner, .list, .sound]
    }

    /// The creator tapped a notification.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let raw: String? = response.notification.request.content.userInfo["deep_link"] as? String
        guard let text = raw else {
            return
        }
        let link: DeepLink = DeepLink.parse(text)
        await MainActor.run {
            if let handler = NotificationRouter.deepLinkHandler {
                handler(link)
            }
        }
    }
}

/// The app delegate behind `@UIApplicationDelegateAdaptor`: only the notification centre delegate lives here.
final class FlowdAppDelegate: NSObject, UIApplicationDelegate {
    private let notificationRouter: NotificationRouter = NotificationRouter()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = notificationRouter
        return true
    }
}
