import Foundation
import Observation
import os
import SwiftUI

// App-wide observable state, created once in `FlowdApp` and read through `@Environment(AppState.self)`. Keep it small: screen state belongs in feature
// view models, data belongs behind the `FlowdAPI` service. What lives here is what several screens (and the shell) must agree on:
//
//   - the gate: launching, onboarding, ready, or a calm failure state;
//   - which persona's shell is on screen (creator, brand, admin);
//   - the signed-in creator, unread count, Wallet and Daily Drop dots, Wellbeing Mode (numbers off, pause), the draft behind "Continue draft",
//     the shared bounty-feed filters and the upload queue;
//   - earned-outcome celebrations (`celebrate`) and deep links that arrive before there is a session.

/// An earned outcome worth celebrating. Funding, bidding, rejection and spending are never celebrated (calm toasts only).
enum Celebration: Equatable, Sendable {
    /// Money cleared: a Mint toast and a bloom.
    case clearedMoney(cents: Int, detail: String?)
    /// A brand approved a video.
    case approval(title: String)
    /// A weekly streak milestone.
    case streakMilestone(weeks: Int)
    /// A tier-up: the `TierUpView` cover (calm; Elite adds confetti).
    case tierUp(to: Tier, from: Tier?)
    /// A payout landed or is on its way: the `PayoutArriveView` cover.
    case payoutArrived(amountCents: Int, methodTitle: String, arrivalNote: String?, isInstant: Bool)
}

/// Keys of the few things the shell remembers between launches.
enum FlowdDefaultsKey {
    /// True once the first-run flow finished on this install.
    static let onboarded: String = "flowd.onboarded"
    /// The cleared amount the creator last saw on the Wallet tab; the tab shows a dot while the real figure is higher.
    static let walletSeenClearedCents: String = "flowd.wallet.seenClearedCents"
}

/// Who a persona is in the demo world (from `World.personas`, with fixed fallbacks).
struct PersonaIdentity: Equatable, Sendable {
    var persona: AppPersona
    var userID: String
    var displayName: String
    var title: String
    var brandID: String?
    var appID: String?
    var memberID: String?

    var initials: String {
        let parts: [Substring] = displayName.split(separator: " ")
        let letters: [String] = parts.prefix(2).compactMap { (part: Substring) -> String? in
            guard let first = part.first else {
                return nil
            }
            return String(first).uppercased()
        }
        return letters.joined()
    }
}

@MainActor
@Observable
final class AppState {
    /// The launch gate. `ready` shows the persona's shell.
    enum Phase: Equatable {
        /// Restoring the session; the splash is up.
        case launching
        /// First run (or signed out): the onboarding flow.
        case onboarding
        case ready
        /// The session or the demo world could not be loaded; the message is plain English.
        case failed(String)
        /// Planned maintenance, with an optional status link.
        case maintenance(String?)
        /// This build is too old to continue.
        case updateRequired
    }

    // MARK: Services

    let api: any FlowdAPI
    let launch: LaunchOptions
    let uploadQueue: UploadQueueStore
    let connectivity: ConnectivityMonitor
    /// Studio drafts (SwiftData). Created by `start()`; nil until then.
    @ObservationIgnored var draftStore: DraftStore?
    /// Set by `FlowdApp`; used for deep links, celebrations that present a cover and persona changes.
    @ObservationIgnored weak var router: Router?

    // MARK: Observable state

    var phase: Phase
    var persona: AppPersona
    var session: CreatorSession?
    var world: World?
    /// Delivered notifications not yet read; the Home tab's badge.
    var unreadCount: Int = 0
    /// True while cleared money sits above what the creator last saw on the Wallet tab.
    var walletDot: Bool = false
    /// True only while today's Daily Drop is live with real spots left (no fake scarcity).
    var dropIsLive: Bool = false
    var wellbeing: WellbeingSettings?
    /// The newest unfinished Studio draft ("Continue draft").
    var latestDraft: DraftSnapshot?
    var draftCount: Int = 0
    /// Uploads that are queued, paused or failed.
    var pendingUploads: Int = 0
    /// The bounty feed's filters and sort, shared by the feed and its filter sheet.
    var feedQuery: FeedQuery = FeedQuery()
    /// Bumped to play the Mint bloom (confetti, or a Mint wash under Reduce Motion).
    var confettiTrigger: Int = 0
    var lastRefreshedAt: Date?
    /// A sheet or cover from `-FlowdScreen`, presented once the first frame is up.
    var deferredLaunchRoute: Route?
    /// A deep link that arrived before the creator was signed in; opened when the shell is ready.
    var pendingDeepLink: DeepLink?

    @ObservationIgnored private var lastWallet: WalletSummary?
    @ObservationIgnored private var lastStreak: StreakSummary?
    @ObservationIgnored private var lastDrop: DailyDropView?
    @ObservationIgnored private var lastClearedCents: Int = 0
    @ObservationIgnored private var isRefreshing: Bool = false

    // MARK: Init

    /// `api` defaults to a signed-out, frozen-clock mock (tests and previews); `FlowdApp` passes the real client via `live(api:launch:)`.
    convenience init(api: (any FlowdAPI)? = nil, launch: LaunchOptions = LaunchOptions.none) {
        let resolved: any FlowdAPI
        if let provided = api {
            resolved = provided
        } else {
            resolved = APIClientFactory.makePreviewMock(signedIn: false)
        }
        self.init(api: resolved, launch: launch, uploadQueue: UploadQueueStore(fileURL: nil))
    }

    /// An `AppState` whose upload queue is the on-disk one (the app).
    static func live(api: any FlowdAPI, launch: LaunchOptions) -> AppState {
        return AppState(api: api, launch: launch, uploadQueue: UploadQueueStore.makeDefault())
    }

    private init(api: any FlowdAPI, launch: LaunchOptions, uploadQueue: UploadQueueStore) {
        self.api = api
        self.launch = launch
        self.uploadQueue = uploadQueue
        self.connectivity = ConnectivityMonitor()
        self.persona = launch.persona
        if launch.forcesOnboarding {
            self.phase = Phase.onboarding
        } else if launch.isDemo {
            self.phase = Phase.ready
        } else {
            self.phase = Phase.launching
        }
    }

    // MARK: Derived

    /// True once the shell is showing (the first-run flow is finished or skipped).
    var hasCompletedOnboarding: Bool {
        return phase == Phase.ready
    }

    var creator: Creator? {
        return session?.creator
    }

    var isDemo: Bool {
        return api.isDemo
    }

    /// The app's "now": the demo world's clock in demo mode, the device clock live.
    var now: Date {
        return FlowdClock.shared.now
    }

    /// Wellbeing Mode "numbers off": every screen that shows live money or views reads this and shows words instead of figures.
    var numbersHidden: Bool {
        return WidgetSnapshotBuilder.numbersHidden(wellbeing, at: now)
    }

    /// The in-app "Reduce glass" switch, for code that is not a view (Settings, Appearance writes it with `@AppStorage(FlowdPreferenceKey.reduceGlass)`;
    /// views read `\.flowdReduceGlass` / `FlowdAppearance.reduceGlass`, which also fold in the system setting).
    var reduceGlassPreference: Bool {
        get {
            return UserDefaults.standard.bool(forKey: FlowdPreferenceKey.reduceGlass)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: FlowdPreferenceKey.reduceGlass)
        }
    }

    /// The in-app haptics switch (defaults to on).
    var hapticsPreference: Bool {
        get {
            let defaults: UserDefaults = UserDefaults.standard
            guard defaults.object(forKey: FlowdPreferenceKey.hapticsEnabled) != nil else {
                return true
            }
            return defaults.bool(forKey: FlowdPreferenceKey.hapticsEnabled)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: FlowdPreferenceKey.hapticsEnabled)
        }
    }

    /// Wellbeing Mode pause (tier and streak are preserved while paused).
    var isPaused: Bool {
        guard let until = wellbeing?.pausedUntil else {
            return false
        }
        return until > now
    }

    /// Who the demo is for `persona` (Maya, Jordan Ellis at Lumi, Ops).
    func identity(for persona: AppPersona) -> PersonaIdentity {
        switch persona {
        case .creator:
            let name: String = session?.creator.displayName ?? "Maya Reyes"
            return PersonaIdentity(
                persona: AppPersona.creator,
                userID: world?.personas.creator.userId ?? DemoIDs.creatorUser,
                displayName: name,
                title: "Creator",
                brandID: nil,
                appID: nil,
                memberID: nil
            )
        case .brand:
            return PersonaIdentity(
                persona: AppPersona.brand,
                userID: world?.personas.brand.userId ?? DemoIDs.brandUser,
                displayName: "Jordan Ellis",
                title: "Growth lead, Lumi",
                brandID: world?.personas.brand.brandId ?? DemoIDs.brand,
                appID: world?.personas.brand.appId ?? DemoIDs.brandApp,
                memberID: world?.personas.brand.memberId ?? DemoIDs.brandMember
            )
        case .admin:
            return PersonaIdentity(
                persona: AppPersona.admin,
                userID: world?.personas.admin.userId ?? DemoIDs.adminUser,
                displayName: "Ops",
                title: "flowd Ops",
                brandID: nil,
                appID: nil,
                memberID: nil
            )
        }
    }

    // MARK: Launch

    /// How long the splash shows the mark at least (the draw-on takes 600 ms), so a fast session restore does not flash it.
    static let minimumSplashSeconds: TimeInterval = 0.8

    /// Called once from the root: starts the monitors, opens the draft store, restores the session and loads the shell's badges. A demo launch
    /// (`-FlowdDemo YES`) is already `ready` and skips the splash.
    func start() async {
        connectivity.start()
        AccessibilitySettings.shared.start()
        if draftStore == nil {
            draftStore = DraftStore.makeResilient()
        }
        refreshDrafts()
        let began: Date = Date()
        let decided: Phase = await decidePhase()
        if phase == Phase.launching {
            let remaining: TimeInterval = AppState.minimumSplashSeconds - Date().timeIntervalSince(began)
            if remaining > 0 {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
        }
        phase = decided
        if decided == Phase.ready {
            await afterReady()
        }
    }

    /// Restores the session and decides the gate (without showing it): a returning creator goes straight to the shell (no flash of the wrong tab), a
    /// first run goes to onboarding, a failure shows the retry state.
    private func decidePhase() async -> Phase {
        if launch.forcesOnboarding {
            world = try? await api.world()
            return Phase.onboarding
        }
        do {
            var current: CreatorSession? = try await api.currentSession()
            if current == nil && launch.isDemo {
                current = try await api.signIn(SignInCredential.demo)
            }
            world = try? await api.world()
            guard let restored = current else {
                return Phase.onboarding
            }
            session = restored
            if AppState.needsOnboarding(restored.creator) && !launch.isDemo {
                return Phase.onboarding
            }
            return Phase.ready
        } catch let error as FlowdAPIError {
            if error.requiresSignIn {
                return Phase.onboarding
            }
            if case .server(let status, let code, _) = error {
                if status == 426 || code == "upgrade_required" {
                    return Phase.updateRequired
                }
                if status == 503 || code == "maintenance" {
                    return Phase.maintenance(nil)
                }
            }
            return Phase.failed(error.userMessage)
        } catch {
            return Phase.failed("We couldn't open flowd. Try again.")
        }
    }

    /// A creator who has only just signed up (stage `signed_up`) finishes the first-run flow; anyone further along goes to the shell.
    static func needsOnboarding(_ creator: Creator) -> Bool {
        return creator.onboardingStage == OnboardingStage.signedUp
    }

    /// The first-run flow calls this when its last step is done (with the session it created, if it has one).
    func completeOnboarding(session newSession: CreatorSession? = nil) {
        if let provided = newSession {
            session = provided
        }
        UserDefaults.standard.set(true, forKey: FlowdDefaultsKey.onboarded)
        phase = Phase.ready
        Task {
            await self.afterReady()
        }
    }

    /// Everything that runs once the shell is on screen: session and world (when missing), badges, deep links that were waiting.
    private func afterReady() async {
        if session == nil {
            session = try? await api.currentSession()
        }
        if world == nil {
            world = try? await api.world()
        }
        await refresh()
        consumePendingDeepLink()
    }

    /// Retry from the failure state.
    func retryLaunch() async {
        phase = Phase.launching
        let decided: Phase = await decidePhase()
        phase = decided
        if decided == Phase.ready {
            await afterReady()
        }
    }

    // MARK: Session

    /// Called after a sign-in elsewhere in the app (a session was created).
    func signedIn(_ newSession: CreatorSession) {
        session = newSession
        UserDefaults.standard.set(true, forKey: FlowdDefaultsKey.onboarded)
        if phase != Phase.ready {
            phase = Phase.ready
        }
        Task {
            await self.refresh()
        }
    }

    /// Signs out: ends Live Activities, clears the widget, the disk cache and (unless asked to keep them) the drafts, and returns to onboarding.
    func signOut(keepDrafts: Bool = false) async {
        do {
            try await api.signOut()
        } catch {
            FlowdLog.api.error("Sign out failed on the server: \(error.localizedDescription, privacy: .public)")
        }
        EarningsActivityController.shared.endAll()
        WidgetSnapshotPublisher.clear()
        await DiskCache().clear()
        if !keepDrafts {
            do {
                try draftStore?.deleteAll()
            } catch {
                FlowdLog.persistence.error("Could not clear drafts at sign-out: \(error.localizedDescription, privacy: .public)")
            }
        }
        UserDefaults.standard.set(false, forKey: FlowdDefaultsKey.onboarded)
        UserDefaults.standard.removeObject(forKey: FlowdDefaultsKey.walletSeenClearedCents)
        session = nil
        unreadCount = 0
        walletDot = false
        dropIsLive = false
        wellbeing = nil
        lastWallet = nil
        lastStreak = nil
        lastDrop = nil
        lastClearedCents = 0
        refreshDrafts()
        persona = AppPersona.creator
        router?.reset(for: AppPersona.creator)
        phase = Phase.onboarding
    }

    /// Restores the demo world (the mock's seed and clock) and returns to the persona's home.
    func resetDemo() async {
        do {
            try await api.resetDemo()
            session = try? await api.currentSession()
            world = try? await api.world()
            router?.reset(for: persona)
            await refresh()
            ToastCenter.shared.info("Demo data restored")
        } catch let error as FlowdAPIError {
            ToastCenter.shared.error("Couldn't reset the demo", detail: error.userMessage)
        } catch {
            ToastCenter.shared.error("Couldn't reset the demo")
        }
    }

    /// Switches the shell (Profile, Account, "Switch persona"; Brand and Admin settings). Navigation state resets.
    func setPersona(_ newPersona: AppPersona) {
        if newPersona == persona {
            return
        }
        persona = newPersona
        router?.reset(for: newPersona)
    }

    // MARK: Refresh

    /// Reloads the shell's badges: unread count, Wallet dot, Daily Drop dot, Wellbeing Mode, uploads and the widget snapshot. Safe to call often; a
    /// call while one is running is ignored. Each piece fails on its own (a failed call keeps the last good value).
    func refresh() async {
        guard phase == Phase.ready, persona == AppPersona.creator, !isRefreshing else {
            return
        }
        isRefreshing = true
        defer {
            isRefreshing = false
        }
        let client: any FlowdAPI = api
        async let walletCall: WalletSummary = client.wallet()
        async let dropCall: DailyDropView = client.todayDrop()
        async let notificationsCall: [AppNotification] = client.notifications(filter: ActivityFilter.all)
        async let wellbeingCall: WellbeingSettings = client.wellbeing()
        async let streakCall: StreakSummary = client.streak()
        let wallet: WalletSummary? = try? await walletCall
        let drop: DailyDropView? = try? await dropCall
        let notifications: [AppNotification]? = try? await notificationsCall
        let settings: WellbeingSettings? = try? await wellbeingCall
        let streak: StreakSummary? = try? await streakCall

        if let wallet = wallet {
            lastWallet = wallet
            lastClearedCents = wallet.clearedCents
            updateWalletDot(clearedCents: wallet.clearedCents)
        }
        if let drop = drop {
            lastDrop = drop
            dropIsLive = AppState.dropHasRealSpots(drop)
        }
        if let notifications = notifications {
            unreadCount = notifications.filter { (n: AppNotification) -> Bool in
                return n.readAt == nil && n.deliveredAt != nil
            }.count
        }
        if let settings = settings {
            wellbeing = settings
        }
        if let streak = streak {
            lastStreak = streak
        }
        await refreshPendingUploads()
        refreshDrafts()
        lastRefreshedAt = now
        publishWidgetSnapshot()
    }

    /// The Daily Drop dot is only honest while the drop is live and at least one bounty still has a real spot.
    static func dropHasRealSpots(_ drop: DailyDropView) -> Bool {
        guard drop.state == DropStatus.live else {
            return false
        }
        return drop.items.contains(where: { (item: DropItemView) -> Bool in
            return item.spotsLeft > 0
        })
    }

    private func updateWalletDot(clearedCents: Int) {
        let defaults: UserDefaults = UserDefaults.standard
        guard let seen = defaults.object(forKey: FlowdDefaultsKey.walletSeenClearedCents) as? Int else {
            // First launch: whatever is cleared now counts as seen.
            defaults.set(clearedCents, forKey: FlowdDefaultsKey.walletSeenClearedCents)
            walletDot = false
            return
        }
        walletDot = clearedCents > seen
    }

    /// Call when the Wallet tab is shown: what is cleared right now is seen.
    func markWalletSeen() {
        walletDot = false
        UserDefaults.standard.set(lastClearedCents, forKey: FlowdDefaultsKey.walletSeenClearedCents)
    }

    /// Adjust the unread badge right after the creator reads or clears items, without waiting for the next refresh.
    func adjustUnread(by delta: Int) {
        unreadCount = max(0, unreadCount + delta)
    }

    // MARK: Drafts and uploads

    /// Re-reads the Studio drafts (call after the Studio closes or a draft changes).
    func refreshDrafts() {
        guard let store = draftStore else {
            latestDraft = nil
            draftCount = 0
            return
        }
        let drafts: [DraftSnapshot] = store.drafts()
        latestDraft = drafts.first
        draftCount = drafts.count
    }

    func refreshPendingUploads() async {
        let pending: [UploadJob] = await uploadQueue.pending()
        pendingUploads = pending.count
    }

    /// "Retry" on the offline banner: resumes every paused or stopped upload and re-checks the connection.
    func retryPendingUploads() async {
        let jobs: [UploadJob] = await uploadQueue.all()
        for job in jobs where job.state == UploadState.failed || job.state == UploadState.paused {
            _ = await uploadQueue.resume(id: job.id)
        }
        await refreshPendingUploads()
    }

    // MARK: Widget

    private func publishWidgetSnapshot() {
        guard let creator = session?.creator, let wallet = lastWallet else {
            return
        }
        let snapshot: FlowdWidgetSnapshot = WidgetSnapshotBuilder.snapshot(
            creator: creator,
            wallet: wallet,
            streak: lastStreak,
            drop: lastDrop,
            wellbeing: wellbeing,
            isDemo: isDemo,
            now: now
        )
        WidgetSnapshotPublisher.publish(snapshot)
    }

    // MARK: Scene

    func scenePhaseChanged(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            connectivity.start()
            Task {
                await self.refresh()
            }
        case .background:
            publishWidgetSnapshot()
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    // MARK: Deep links

    /// A URL from `onOpenURL`, a universal link, a widget or a Live Activity tap.
    func open(url: URL) {
        open(DeepLink.parse(url))
    }

    /// A parsed link. Links that need a session wait until the shell is ready.
    func open(_ link: DeepLink) {
        if link.requiresSession && phase != Phase.ready {
            pendingDeepLink = link
            return
        }
        router?.handle(link)
    }

    private func consumePendingDeepLink() {
        guard phase == Phase.ready, let link = pendingDeepLink else {
            return
        }
        pendingDeepLink = nil
        router?.handle(link)
    }

    // MARK: Celebrations

    /// Celebrates an earned outcome. Haptic and announcement come with the toast; the bloom is the confetti (or a Mint wash under Reduce Motion).
    func celebrate(_ celebration: Celebration) {
        switch celebration {
        case .clearedMoney(let cents, let detail):
            ToastCenter.shared.money(Fmt.money(cents) + " cleared to your Wallet", detail: detail)
            confettiTrigger &+= 1
        case .approval(let title):
            ToastCenter.shared.success(title)
            confettiTrigger &+= 1
        case .streakMilestone(let weeks):
            ToastCenter.shared.success(String(weeks) + " weeks in a row", detail: "Freezes and rest weeks keep it safe.")
            confettiTrigger &+= 1
        case .tierUp(let to, let from):
            router?.presentCover(CoverRoute.tierUp(to: to, from: from))
        case .payoutArrived(let amountCents, let methodTitle, let arrivalNote, let isInstant):
            router?.presentCover(
                CoverRoute.payoutArrived(amountCents: amountCents, methodTitle: methodTitle, arrivalNote: arrivalNote, isInstant: isInstant)
            )
        }
    }
}
