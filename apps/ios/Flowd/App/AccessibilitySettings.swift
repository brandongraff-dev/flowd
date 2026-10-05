import Foundation
import Observation
import UIKit

/// The system accessibility settings and the in-app Reduce glass switch, readable from code that is not a view (view models, the shell's chrome, the
/// haptics host). Views should keep using the SwiftUI environment values and `FlowdAppearance`; this mirror exists for everything else, and it updates
/// when the user changes a setting while the app runs.
@MainActor
@Observable
final class AccessibilitySettings {
    static let shared: AccessibilitySettings = AccessibilitySettings()

    private(set) var reduceMotion: Bool = UIAccessibility.isReduceMotionEnabled
    private(set) var reduceTransparency: Bool = UIAccessibility.isReduceTransparencyEnabled
    private(set) var boldText: Bool = UIAccessibility.isBoldTextEnabled
    private(set) var voiceOver: Bool = UIAccessibility.isVoiceOverRunning
    private(set) var differentiateWithoutColor: Bool = UIAccessibility.shouldDifferentiateWithoutColor
    private(set) var prefersCrossFade: Bool = UIAccessibility.prefersCrossFadeTransitions
    private(set) var increaseContrast: Bool = UIAccessibility.isDarkerSystemColorsEnabled
    /// The in-app "Reduce glass" switch (Settings, Appearance).
    private(set) var inAppReduceGlass: Bool = UserDefaults.standard.bool(forKey: FlowdPreferenceKey.reduceGlass)
    /// The in-app haptics switch.
    private(set) var hapticsEnabled: Bool = AccessibilitySettings.readHapticsPreference()

    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    private init() {
    }

    /// Glass must become solid, opaque, tinted surfaces: the system setting or the in-app switch.
    var reduceGlass: Bool {
        return reduceTransparency || inAppReduceGlass
    }

    /// Springs, drift, sheen and parallax become short fades.
    var prefersReducedMotion: Bool {
        return reduceMotion || prefersCrossFade
    }

    /// Starts listening for changes. Calling it again is harmless.
    func start() {
        if !observers.isEmpty {
            return
        }
        let names: [Notification.Name] = [
            UIAccessibility.reduceMotionStatusDidChangeNotification,
            UIAccessibility.reduceTransparencyStatusDidChangeNotification,
            UIAccessibility.boldTextStatusDidChangeNotification,
            UIAccessibility.voiceOverStatusDidChangeNotification,
            UIAccessibility.differentiateWithoutColorDidChangeNotification,
            UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
            UserDefaults.didChangeNotification
        ]
        let center: NotificationCenter = NotificationCenter.default
        for name in names {
            let token: NSObjectProtocol = center.addObserver(forName: name, object: nil, queue: OperationQueue.main) { [weak self] (_: Notification) in
                guard let strongSelf = self else {
                    return
                }
                MainActor.assumeIsolated {
                    strongSelf.refresh()
                }
            }
            observers.append(token)
        }
        refresh()
    }

    /// Re-reads every setting.
    func refresh() {
        reduceMotion = UIAccessibility.isReduceMotionEnabled
        reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
        boldText = UIAccessibility.isBoldTextEnabled
        voiceOver = UIAccessibility.isVoiceOverRunning
        differentiateWithoutColor = UIAccessibility.shouldDifferentiateWithoutColor
        prefersCrossFade = UIAccessibility.prefersCrossFadeTransitions
        increaseContrast = UIAccessibility.isDarkerSystemColorsEnabled
        inAppReduceGlass = UserDefaults.standard.bool(forKey: FlowdPreferenceKey.reduceGlass)
        hapticsEnabled = AccessibilitySettings.readHapticsPreference()
    }

    /// The haptics switch defaults to on, so an unset key reads as true.
    private static func readHapticsPreference() -> Bool {
        let defaults: UserDefaults = UserDefaults.standard
        guard defaults.object(forKey: FlowdPreferenceKey.hapticsEnabled) != nil else {
            return true
        }
        return defaults.bool(forKey: FlowdPreferenceKey.hapticsEnabled)
    }
}
