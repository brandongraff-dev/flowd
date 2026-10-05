# iOS feature contract (apps/ios/Flowd/App/FEATURE_CONTRACT.md)

The agreement between the app shell (`ios-core`, this folder) and the eight feature agents. The shell is real, compiled-by-CI code; the screens are not built yet, so every screen below currently exists as a **placeholder file** with the exact type name and initialiser the shell calls. Your job is to overwrite your placeholder files with the real screens, keeping the file path, the type name and the initialiser exactly as listed here. Everything else (view models, subviews, helpers) is yours to add inside your own folders.

Read in this order: `docs/CONVENTIONS.md` section 5, `docs/SCREENS.md` (your section), `apps/ios/Flowd/DesignSystem/README.md`, `apps/ios/Flowd/Core/README.md`, then this file. There is no Swift compiler on the Windows dev machines: CI (macos-26, real Xcode) compiles `apps/ios`, so write conservative Swift and re-read every file as the compiler would.

| Owner | Folders (all under `apps/ios/Flowd/Features/` unless noted) |
|---|---|
| `ios-core` | `Flowd/App/`, `DesignSystem/`, `Core/` |
| `ios-onboarding-profile` | `Onboarding`, `Profile`, `Settings`, `Safety` |
| `ios-home-bounties` | `Home`, `Bounties`, `RateCard`, `Inbox`, `Flo` |
| `ios-studio-capture` | `Studio/Capture` |
| `ios-studio-edit` | `Studio/Edit`, `Submissions` |
| `ios-wallet-widgets` | `Wallet`, `Earnings`, `Rights`, plus `FlowdWidgets/` and `Shared/` |
| `ios-compete-grow` | `Leaderboard`, `Crews`, `Tournaments`, `Academy`, `Tools`, `Referrals`, `Specs`, `Auctions`, `Remix` |
| `ios-brand-mode` | `BrandMode` |
| `ios-admin-mode` | `AdminMode` |

---

## 1. What the shell gives a screen

### 1.1 Environment (all injected by `FlowdApp`; `#Preview` gets them from `.flowdPreviewEnvironment()`)

```swift
@Environment(AppState.self) private var appState      // App/AppState.swift
@Environment(Router.self) private var router          // App/Router.swift
@Environment(\.flowdAPI) private var api              // any FlowdAPI (mock offline, live when configured)
@Environment(\.flowdToasts) private var toasts        // calm toasts (DesignSystem)
@Environment(StudioRouter.self) private var studio: StudioRouter?   // only inside the Studio cover; nil elsewhere
```

A screen takes **only value-type ids** in its initialiser (the table below) and loads everything else from `api` in `.task`. Never construct `MockFlowdAPI`/`LiveFlowdAPI`, never read fixture JSON (Brand and Admin mode excepted, section 5), never call `Date()` for product logic (use `FlowdClock.shared.now`).

### 1.2 Navigation: `Router` and `Route`

`Route` (App/RouteTypes.swift) is a value enum with one case per screen that has a name, an id or a deep link (82 cases; `Route.presentation` says tab root, push, sheet or cover). `ScreenRegistry.view(for:)` (generated; App/ScreenRegistry.swift) maps every case to the view type in the tables below. The `switch` is exhaustive on purpose: a new `Route` case does not compile until it has a view.

```swift
router.push(.bounty(id: item.id))                  // from inside a screen: pushes on the CURRENT tab's stack (a sheet or cover case presents itself)
router.open(.wallet)                               // from anywhere: select the tab, pop it to its root
router.open(.moneyClock)                           // switch to the route's own tab (Route.creatorTab), replace its stack with the route
router.present(.rightsCard(bountyID: id))          // a sheet over whatever is on screen (hosted by the Studio cover when the Studio is up)
router.open(.studio(.makeIt(bountyID: id, formatID: nil, hook: nil)))   // the Studio cover
router.dismissSheet()  router.dismissCover()  router.dismissStudio()  router.pop()  router.popToRoot()
NavigationLink(value: Route.moneyClock) { ... }    // also fine: every tab root registers `.navigationDestination(for: Route.self)`
```

- Tab roots are `Route.home`, `.bounties`, `.wallet`, `.profile` (Studio is the centre action, not a tab). They are shown inside a `NavigationStack` the shell owns: **do not add your own `NavigationStack` to a tab root or a pushed screen**; set `.flowdNavigationTitle(_, large:)` and add `.toolbar` items.
- **Sheets** are wrapped by the shell (`SheetHost`): a `NavigationStack`, a close button (`FlowdCloseToolbarItem`), `.flowdSheetChrome(detents:)` (detents from `Route.sheetSize`), a toast host, and a nested-sheet slot. Your sheet view sets `.flowdNavigationTitle("...", large: false)` and its own primary toolbar item ("Send", "Done"); it does not add a close button, a `NavigationStack` or its own detents. A sheet that must refresh its parent on close can observe `router.sheetDismissTick`.
- **Covers** (Studio, Wrapped) are full screen and draw their own chrome (`FlowdNavBar`, a close `FlowdIconButton`). Close with `router.dismissCover()` / `router.dismissStudio()`.
- `router.persona`, `router.selectedTab`, `router.nav(tab).path` exist for the shell; screens rarely touch them.
- The shared bounty-feed filter is `appState.feedQuery` (a `FeedQuery`): the feed reads it, `BountyFiltersSheet` writes it.

### 1.3 Deep links, notifications, widgets

`flowd://bounty/<id>`, `payout/<id>`, `submission/<id>`, `post/<id>`, `offer/<id>`, `dispute/<id>`, `tournament/<id>`, `lesson/<slug>`, `scorecard/<brandId>`, `drop`, `wallet`, `wallet/clock`, `inbox`, `studio`, `tiers`, `rights`, `streak`, `referrals`, `tax`, `safety`, `wellbeing`, `remix`, `crew`, `academy`, `leaderboard`, `settings/<section>`, `creator/<handle>`, `proof/<id>`, and `joinflowd.io/b/<id>`, `/c/<handle>`, `/p/<proof>` all parse in `Core/Utilities/DeepLink.swift` and map to a `Route` in `Route.from(_:)`. `AppState.open(_:)` queues links that need a session until the shell is ready and shows a calm toast for links with no screen. Home Screen widgets and the Live Activity open links through `widgetURL` / `Link` and arrive through `onOpenURL`; notification taps arrive through `NotificationRouter`.

**Every local notification you schedule must carry its destination:** `content.userInfo = ["deep_link": "flowd://drop"]`. Ask for permission only through `NotificationPermission` (App/NotificationPermission.swift), after the first submission ("Know the minute you're paid"), via `router.present(.permissionPrimer(.notifications))`.

### 1.4 `AppState` (read it, call these)

| Member | Use |
|---|---|
| `creator`, `session`, `isDemo` | the signed-in creator (nil until the session loads; never assume non-nil), `api.isDemo` for the subtle "Demo data" affordance |
| `numbersHidden`, `isPaused`, `wellbeing` | Wellbeing Mode: **every screen that shows live money or views must read `appState.numbersHidden` and show words instead of figures** (SCREENS section 9); `isPaused` for the Pause banner. After `api.updateWellbeing(_:)` set `appState.wellbeing = updated` |
| `unreadCount`, `adjustUnread(by:)` | Inbox badge on the Home tab (the shell shows it); adjust it right after reading or clearing items |
| `walletDot`, `dropIsLive` | read by the shell only; `markWalletSeen()` is called by the shell when the Wallet tab shows |
| `latestDraft`, `draftCount`, `draftStore`, `refreshDrafts()` | the Studio drafts behind "Continue draft"; the Studio calls `refreshDrafts()` after every save and delete |
| `uploadQueue`, `pendingUploads`, `retryPendingUploads()`, `connectivity` | the upload queue and the offline banner |
| `feedQuery` | shared bounty-feed filters |
| `reduceGlassPreference`, `hapticsPreference` | the in-app Reduce glass and haptics switches for non-view code (Settings writes them with `@AppStorage(FlowdPreferenceKey.*)`) |
| `celebrate(_:)` | earned outcomes only (below) |
| `persona`, `setPersona(_:)`, `identity(for:)` | the demo persona switch (Settings > Account, Brand and Admin settings); `identity(for:)` gives Jordan Ellis / Ops ids |
| `resetDemo()`, `signOut(keepDrafts:)`, `completeOnboarding(session:)`, `signedIn(_:)` | account flows; `signOut` ends Live Activities, clears the widget, cache and (by default) drafts |
| `refresh()` | re-pulls badges, Wellbeing, drop state, uploads and the widget snapshot; the shell calls it on foreground, call it after money-moving actions |

### 1.5 Toasts, haptics, celebrations

- Calm feedback: `toasts.success("Draft saved")`, `.info`, `.warning("You're offline", detail: ...)`, `.error("Upload stopped at 62%", detail: ..., actionTitle: "Retry") { retry() }`, `.money("$62.40 cleared to your Wallet")`. Autosave and offline-queue messages are calm toasts. Rejection is a calm card with the next step, never a toast alone.
- **Celebrations are for creator-earned outcomes only** (cleared money, approvals, tier-ups, streak milestones, a payout arriving): `appState.celebrate(.clearedMoney(cents:detail:))`, `.approval(title:)`, `.streakMilestone(weeks:)`, `.tierUp(to:from:)` (the `TierUpView` cover), `.payoutArrived(amountCents:methodTitle:arrivalNote:isInstant:)` (the `PayoutArriveView` cover). Funding, bidding, rejecting and spending get calm toasts, never confetti.
- Haptics: `FlowdHaptics.play(_:)` / `.flowdHaptic(_:trigger:)` from the design system; one per user action, on the causal frame. Toasts and celebrations already play theirs, so do not add another beside them. The in-app haptics switch is honoured by the wrappers.
- Accessibility settings for non-view code: `AccessibilitySettings.shared` (`reduceMotion`, `reduceGlass`, `voiceOver`, ...). In views keep using the environment values and `FlowdAppearance`.

### 1.6 Scroll chrome

`FlowdScreen` already wires two shell behaviours: re-tapping the selected tab scrolls to the top, and (iOS 26) scrolling down shrinks the tab bar to icons. A screen that uses its own `ScrollView` instead of `FlowdScreen` should wrap it in a `ScrollViewReader` and apply `.flowdScrollChrome(proxy:)` to the scroll view (DesignSystem/Glass/FlowdScrollChrome.swift). Give any list screen a "scroll to top" id with `FlowdScrollAnchor.top`.

### 1.7 Previews

Every view file ends with a `#Preview`; wrap it so the environment exists:

```swift
#Preview {
    NavigationStack { BountyDetailView(bountyID: "bnty_lumi_glowup") }
        .flowdPreviewEnvironment()                 // Maya, frozen clock 2026-10-03T14:00:00Z, in-memory drafts
}
#Preview("Brand mode") { BrandOverviewView().flowdPreviewEnvironment(persona: .brand) }
```

Use `PreviewData` (Core/Preview) for sample rows and `PreviewData.api()` for a fresh mock when a preview mutates. Previews of full-screen steps and covers do not need the `NavigationStack`.

### 1.8 Launch keys (screenshots and demos)

`-FlowdDemo YES -FlowdPersona creator|brand|admin -FlowdScreen <key> -FlowdAppearance dark|light -FlowdReduceGlass YES` (App/LaunchOptions.swift; `scripts/ci/ios-screenshots.sh` passes them). Each key opens a screen directly with demo ids from `DemoIDs`. The twenty screenshot keys: `design-gallery` (the `DesignGallery`), `creator-home`, `creator-bounties`, `creator-bounty-detail` (`bnty_lumi_glowup`), `creator-studio-capture` (the Studio cover on the capture step), `creator-hook-score` (`HookScoreToolView`), `creator-wallet`, `creator-earnings-card` (`EarningsCardSheet(.latest)`), `creator-leaderboard`, `creator-profile`, `brand-overview`, `brand-review`, `brand-bounty-detail`, `brand-insights`, `brand-wallet`, `admin-control`, `admin-queues`, `admin-fraud-case` (`flag_001`), `admin-payouts`, `admin-market`. Forty-six more keys exist for QA (`LaunchScreen.keys`): `creator-onboarding`, `creator-studio`, `creator-daily-drop`, `creator-inbox`, `creator-money-clock`, `creator-instant-cashout`, `creator-submission-detail`, `creator-tiers`, `creator-settings`, `creator-wrapped`, `brand-review-detail`, `admin-more`, `admin-ml` and so on. **Because the screenshots run with `-FlowdDemo`, a screen opened by key must render real, populated content from the mock with no extra setup** (and a sheet or cover key opens it about one second after launch).

---

## 2. Rules for replacing a placeholder

1. Overwrite the placeholder at its path. **Keep the type name, the file name and the initialiser labels and types exactly** (`BountyDetailView(bountyID: String)`). If you need more input, read it from the environment or the API; if you truly need a new initialiser parameter, add it with a default value and tell `ios-core` in your report (the registry call must keep compiling).
2. Add your own files freely inside your folders (view models, subviews, helpers, tests). New folders for your own screens are allowed (`Flo`, `Safety`, `Rights`, `Referrals`, `Specs`, `Auctions`, `Remix`, `Studio/Capture`, `Studio/Edit` already exist). Never edit another owner's folder or `App/`; if you need a shell change (a new `Route` case, a new `StudioRoute`), ask `ios-core` or make the smallest additive edit and list it under `touchedShared`.
3. A screen is **not done** until it has: a loading skeleton (`SkeletonRow`, `.flowdSkeleton`), an empty state (`EmptyStateView`), an error state (`ErrorStateView` with `error.userMessage` and retry when `isRetryable`), pull-to-refresh where a list loads, VoiceOver labels, Dynamic Type reflow, Reduce Motion and Reduce glass fallbacks (the wrappers do most of it), a `#Preview` (plus a dark or empty one where it matters), and honours `appState.numbersHidden` if it shows live money or views.
3a. Money and numbers: `Int` cents through `MoneyText` / `FlowdMoneyFormat` / `Fmt`; Cleared and Pending side by side, never summed, each with a glyph and a dated ETA ("Clears Sat 2:00 PM"); scores always a band with timecoded reasons and the "Checklist score" label (`FlowdConstants.checklistLabel`).
4. No `AnyView`, no `ObservableObject`, no `print`, no force unwraps, no `try!`, no hard-coded colours, fonts, spacings or URLs, no `glassEffect` (only the DesignSystem wrappers). View models are `@MainActor @Observable final class` taking `any FlowdAPI`.
5. Terminology is fixed (bounty, creator, payout, Wallet, Studio, Hook Score, Flow Score, Flo, Daily Drop, Crews, Tournaments, Tiers). Copy is plain, specific, no exclamation marks.

---

## 3. The Studio flow (ios-studio-capture and ios-studio-edit share this)

The Studio is one full-screen cover (`Route.studio(StudioEntry)`) hosted by `StudioHostView` (App/StudioHostView.swift): a `NavigationStack` whose root is `StudioLauncherView(entry:)` and whose pushed steps are `StudioRoute` values (the navigation bar is hidden: draw your own header with `FlowdNavBar(..., leading: { FlowdBackButton() })`). Inside the cover use `@Environment(StudioRouter.self) private var studio` (`push(_:)`, `pop()`, `popToRoot()`, `replaceTop(with:)`, `replacePath(_:)`, `chosenHook`) and `@Environment(Router.self)` (`router.dismissStudio()`, `router.open(.floSheet(...))`, sheets).

```
launcher ─► formatPicker ─► script ─► capture ─► hookCoach ─► takeReview ─► edit ─► (captions | silenceCut | screenOverlay) ─► score
         (makeIt/record)  (creates the draft)                                                                                  │
                                                                              submit ◄─ (variants) ◄─ preflight ◄──────────────┘
```

`StudioEntry` (how the cover opens): `.launcher` (centre action), `.makeIt(bountyID:formatID:hook:)` ("Make it", "Remix this": format picker, or the script step when a format or hook is given), `.record(bountyID:)` (fan "Record"), `.capture(bountyID:)` (capture screen itself), `.importVideo(bountyID:)` (fan "Upload": the launcher opens the import sheet at once), `.scriptWithFlo(bountyID:)` (fan "Script with Flo": the launcher opens Flo first), `.resume(draftID:)` ("Continue draft": the host looks the draft up and starts at its stage), `.revise(submissionID:)`. `StudioEntry.initialPath(draft:)` (App/RouteTypes.swift) decides the steps already pushed; the launcher reacts to `.importVideo` and `.scriptWithFlo` (`StudioLauncherView(entry:)` receives the entry).

**The draft is the state carrier between the two agents.** `DraftSnapshot` (Core/Persistence) holds `bountyId`, `formatId`, `script`, `hookText`, `caption`, `stage` (`script capture edit score submit`), `videoFileName` (a file in `FlowdDirectories.drafts`), `durationMs`, `hookBand/hookPoints`, `flowBand/flowPoints`, `qaPass/qaWarn/qaFail`, `checklist`. Rules:

1. The **capture agent creates the draft** in `StudioScriptView` (or on the first record when `draftID` is nil), saves it with `appState.draftStore?.save(_:)`, and on leaving `StudioTakeReviewView` pushes `StudioRoute.edit(draftID:)`.
2. Every step after the script is keyed by `draftID`, loads the draft with `draftStore.draft(id:)`, writes its changes and its `stage` back with `save`, and calls `appState.refreshDrafts()` so "Continue draft" stays right.
3. **Autosave on interruption** (backgrounding, a call, low battery): save the draft with the stage you are in; the file stays on disk. `StudioEntry.resume` reopens at that stage.
4. The **edit agent finishes the flow**: `StudioSubmitView` calls `api.beginUpload` / `api.submit` (with the draft's scores and QA counts and an `idempotencyKey`), enqueues the file in `appState.uploadQueue` (`UploadQueueStore`: resumable, offline queue, `markFailed` backoff), then closes the Studio with `router.dismissStudio()` and opens the result with `router.open(.submission(id:))`. The first submission also asks for notifications: `router.present(.permissionPrimer(.notifications))`.
5. **Hook pick**: `StudioHookLibrarySheet` (presented with `router.present(.hookLibrary(bountyID:formatID:))`) writes `studio.chosenHook`; `StudioScriptView` reads it, applies it and sets it back to nil.
6. **Flo in the Studio**: `router.present(.floSheet(FloLaunchContext(surface: .studio, bountyID:..., formatID:..., prompt: "Write 3 scripts")))`; Flo's "send to Studio" action writes `studio.chosenHook` or navigates the script.
7. **Permissions**: ask just in time with `AVCaptureDevice.requestAccess`, `SFSpeechRecognizer.requestAuthorization`, `PHPhotoLibrary`; show `router.present(.permissionPrimer(kind))` first when the status is not determined; when denied push `StudioRoute.permissionRecovery(kind)` (never a dead end: it offers the camera-roll import). Info.plist usage strings already exist in `project.yml`.
8. Scores are **checklist scores** (`ScoringEngine`, `HookTextEngine`, `ClipAnalyzer`, `QAEngine`, `PreflightBuilder` in Core/Engine): band, timecoded reasons, one-tap fixes, and `FlowdConstants.checklistLabel`.
9. The simulator has no camera: `StudioCaptureView` must handle `AVCaptureDevice.default(...) == nil` gracefully (a static viewfinder with the teleprompter and the import fallback) so the `creator-studio-capture` screenshot key shows a real screen.

`StudioImportSheet(bountyID:onImported:)` is shown through `Route.importVideo(bountyID:)`; the registry supplies `onImported` (it closes the sheet and pushes `.score(draftID:)` inside the Studio, or opens the Studio at the draft). Call `onImported(draft.id)` after the draft is saved.

---

## 4. Screens

`File` paths are relative to `apps/ios/`. `Opened by` is the `Route` / `StudioRoute` / `BrandRoute` / `AdminRoute` case that shows the screen (the registry call is exactly `Type(label: value)` as written). `Use` lists the Core and DesignSystem APIs to build it with; open the source files named in `Core/README.md` for signatures.

### 4.1 ios-home-bounties: Home, bounties, offers, Inbox, Flo (docs/SCREENS.md section 4)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Home | `apps/ios/Flowd/Features/Home/HomeView.swift` | `HomeView()` | Route.home (Home tab root) | tab root (inside the shell's NavigationStack) | api.homeSummary() (one pull-to-refresh) -> HomeSummary; FlowdEarningsPair / MoneyText (Cleared Mint + check, Pending Lagoon + clock, Fmt.etaLine); DailyDropView read-model + CountdownLabel; StreakSummary; appState.latestDraft (Continue draft); appState.numbersHidden; FeedItem carousel -> router.push(.bounty(id:)); Trend cards -> router.open(.studio(.makeIt(...))); router.push(.flo(.home)), .inbox (appState.unreadCount), .activity, .dailyDrop, .streak, .whatToPostToday, .firstDollarTracker, .academy; EarningsActivityController for the Live Activity toggle |
| Daily Drop | `apps/ios/Flowd/Features/Home/DailyDropScreen.swift` | `DailyDropScreen()` | Route.dailyDrop | push | api.todayDrop() -> DailyDropView; api.claimDropSpot(dropId:bountyId:) -> BountySave; DropItemView.spotsLeft (true counts only); DailyDropView.headStartNote; CountdownLabel(to: releaseAt); FlowdTone.ember for the one hot element; claim success -> router.push(.bounty(id:)) or .studio(.makeIt) |
| Streak | `apps/ios/Flowd/Features/Home/StreakView.swift` | `StreakView()` | Route.streak | push | api.streak() -> StreakSummary (streak, copy, canDeclareRestWeek); api.declareRestWeek(); Streak.history [WeekRecord]; milestones -> appState.celebrate(.streakMilestone(weeks:)); StreakEngine.copy for calm wording |
| What to post today | `apps/ios/Flowd/Features/Home/WhatToPostTodayView.swift` | `WhatToPostTodayView()` | Route.whatToPostToday | push | api.remixLibrary() -> RemixLibrary (trends, formats, hooks); HomeSummary.trends; Trend.whyItWorks; Make it -> router.open(.studio(.makeIt(bountyID:formatID:hook:))); Remix this -> router.push(.remix) |
| Activity | `apps/ios/Flowd/Features/Home/ActivityView.swift` | `ActivityView()` | Route.activity | push | api.notifications(filter: ActivityFilter); api.markNotificationsRead(ids:) then appState.adjustUnread(by:); AppNotification.deepLink -> appState.open(DeepLink.parse(n.deepLink)); NotificationKind.category; AppNotification.batched |
| Bounties | `apps/ios/Flowd/Features/Bounties/BountiesView.swift` | `BountiesView()` | Route.bounties (Bounties tab root) | tab root (inside the shell's NavigationStack) | api.feed(appState.feedQuery) -> Page<FeedItem>; api.saveBounty/unsaveBounty; router.present(.bountyFilters); router.push(.bounty(id:)), .savedBounties, .offers; StatusPill(.funded); Fmt.cpm / FlowdMoneyFormat.rate; FeedItem.expectedPay.medianCents, .lockReasons, .decidesInLabel; .flowdZoomSource; FlowdScreen + SkeletonRow/EmptyStateView/ErrorStateView |
| Filters and sort | `apps/ios/Flowd/Features/Bounties/BountyFiltersSheet.swift` | `BountyFiltersSheet()` | Route.bountyFilters | sheet (SheetHost) | reads and writes appState.feedQuery (FeedQuery, FeedSort); BountyType, Platform, Niche, MatchGate; Chip + FlowdWrap + SegmentedPicker |
| Saved and claimed | `apps/ios/Flowd/Features/Bounties/SavedAndClaimedView.swift` | `SavedAndClaimedView()` | Route.savedBounties | push | api.savedBounties() -> [SavedBounty]; BountySave.claimedUntil with CountdownLabel; api.submissions(filter:) for active submissions; api.unsaveBounty(id:) |
| Bounty | `apps/ios/Flowd/Features/Bounties/BountyDetailView.swift` | `BountyDetailView(bountyID: String)` | Route.bounty(id:) | push | api.bountyDetail(id:) -> BountyDetail (item, app, scorecard, typicalEarnings, tldr: BriefTLDR, rightsLines, state: BountyCreatorState, examplePosts, scamCues); api.joinBounty(id:); sticky "Make it" via .flowdBottomBar -> router.open(.studio(.makeIt(bountyID:formatID:nil,hook:nil))); router.present(.rightsCard / .payMath / .brandScorecard / .scamReport / .floSheet); .flowdZoomDestination |
| Rights Card | `apps/ios/Flowd/Features/Bounties/RightsCardSheet.swift` | `RightsCardSheet(bountyID: String)` | Route.rightsCard(bountyID:) | sheet (SheetHost) | api.bountyDetail(id:).rightsLines (RightsEngine.lines) and item.bounty.rightsCard (RightsEngine.summary); the Rights Card is snapshotted at submit |
| Pay Math | `apps/ios/Flowd/Features/Bounties/PayMathSheet.swift` | `PayMathSheet(bountyID: String)` | Route.payMath(bountyID:) | sheet (SheetHost) | api.payMath(bountyId:) -> PayMathBreakdown (expected, typicalVsTopLine, assumptions, disclaimer); EarningsEngine.disclaimer; MoneyText |
| Brand Scorecard | `apps/ios/Flowd/Features/Bounties/BrandScorecardSheet.swift` | `BrandScorecardSheet(brandID: String)` | Route.brandScorecard(brandID:) | sheet (SheetHost) | api.brandScorecard(brandId:) -> BrandScorecardView (isNew, sampleLabel, components, recentBounties); ReputationEngine.brandBandLabel; router.present(.scamReport(kind: .brand, targetID:)) |
| Offers | `apps/ios/Flowd/Features/Bounties/OffersInboxView.swift` | `OffersInboxView()` | Route.offers | push | api.offers() -> [OfferSummary]; OfferSummary.awaitingMe, .expiresLabel; ScamShield.warning(for:) for inline warnings; empty state -> router.push(.rateCard) |
| Offer | `apps/ios/Flowd/Features/Bounties/OfferDetailView.swift` | `OfferDetailView(offerID: String)` | Route.offer(id:) | push | api.offerDetail(id:) -> OfferDetail; api.acceptOffer(id:) / declineOffer(id:); router.present(.counterOffer(offerID:), .rightsCard, .payMath, .brandScorecard); Offer.thread (OfferMessage) |
| Counter offer | `apps/ios/Flowd/Features/Bounties/CounterOfferSheet.swift` | `CounterOfferSheet(offerID: String)` | Route.counterOffer(offerID:) | sheet (SheetHost) | api.counterOffer(id:_ OfferCounterRequest); OfferDetail.marketBand (RateSuggestion), counterRoundsLeft; shows what changes before sending |
| Rate card | `apps/ios/Flowd/Features/RateCard/RateCardEditorView.swift` | `RateCardEditorView()` | Route.rateCard | push | api.rateCard() -> RateCardView; api.updateRateCard(_ RateCardUpdate); RateSuggestion (p25 to p75); RateCardView.lockText for the Silver gate |
| Report a problem | `apps/ios/Flowd/Features/Bounties/ScamReportSheet.swift` | `ScamReportSheet(kind: ReportTargetKind, targetID: String?)` | Route.scamReport(kind:targetID:) | sheet (SheetHost) | api.reportScam(_ ScamReportRequest) -> ScamReport (caseId, slaDueAt); ScamReason chips; ReportTargetKind |
| Inbox | `apps/ios/Flowd/Features/Inbox/InboxView.swift` | `InboxView()` | Route.inbox | push | api.notifications(filter:), api.threads() -> [InboxThread]; ActivityFilter tabs; api.markNotificationsRead; appState.adjustUnread(by:); AppNotification.batched ("batched to protect your quiet hours") |
| Thread | `apps/ios/Flowd/Features/Inbox/ThreadView.swift` | `ThreadView(threadID: String)` | Route.thread(id:) | push | api.thread(id:), api.sendMessage(threadId:body:); ScamShield.warning(for:) before send; ChatThread.rateLimited; MessageKind (text, system, warning) |
| Flo | `apps/ios/Flowd/Features/Flo/FloView.swift` | `FloView(context: FloLaunchContext)` | Route.flo(_:) (push) and Route.floSheet(_:) (sheet) | push | api.flo(_ FloRequest) -> FloSuggestion; api.floHistory(); api.rateFloSuggestion(id:helpful:); FloLaunchContext; FloAction -> router.open(.studio(...)) or studio.chosenHook; always the note "checklist-based, can be wrong" |

### 4.2 ios-onboarding-profile: Onboarding, Profile, Settings, Safety (sections 2 and 3)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Welcome to flowd | `apps/ios/Flowd/Features/Onboarding/OnboardingFlowView.swift` | `OnboardingFlowView()` | RootView phase `.onboarding` (not a Route) | launch gate (RootView) | api.earningsPreview(niche:), api.signIn(.apple(...)), api.updateProfile(ProfileUpdate(...)), api.linkSocialAccount, api.confirmAge(), api.acceptCreatorAgreement(version:), api.firstDollarPath(); finish with appState.completeOnboarding(session:); FlowdMarkView (App/SplashView.swift) for the intro; FlowdNavBar for the hidden-bar steps |
| Permission | `apps/ios/Flowd/Features/Onboarding/PermissionPrimerSheet.swift` | `PermissionPrimerSheet(kind: PermissionKind)` | Route.permissionPrimer(_:) | sheet (SheetHost) | NotificationPermission.status()/request()/openSystemSettings() (App/NotificationPermission.swift); camera, microphone, speech and photos are asked with AVFoundation, Speech and PhotosUI by the Studio |
| First-Dollar Path | `apps/ios/Flowd/Features/Onboarding/FirstDollarTrackerView.swift` | `FirstDollarTrackerView()` | Route.firstDollarTracker | push | api.firstDollarPath() -> FirstDollarPath (steps, clearedByEstimate, retired); appState.latestDraft to resume; router.open(.studio(.launcher)) |
| Profile | `apps/ios/Flowd/Features/Profile/ProfileView.swift` | `ProfileView()` | Route.profile (Profile tab root) | tab root (inside the shell's NavigationStack) | api.me(), api.tierStatus(), api.reputation(); TierBadge, ProgressRing; Creator.storefrontURL; router.push(.tiers, .editProfile, .linkedAccounts, .accountHealth, .settings(nil), .storefront(handle: nil), .leaderboard, .referrals, .drafts, .submissions) and .earningsCard(.latest) |
| Edit profile | `apps/ios/Flowd/Features/Profile/EditProfileView.swift` | `EditProfileView()` | Route.editProfile | push | api.updateProfile(_ ProfileUpdate); Creator.portfolio [PortfolioItem], .storefront; PhotosPicker; validation messages |
| Tiers | `apps/ios/Flowd/Features/Profile/TiersView.swift` | `TiersView()` | Route.tiers | push | api.tierStatus() -> TierStatus (progress, remaining, perks, ladder, history, graceNote); TierBadge/TierMedallion; a tier-up -> appState.celebrate(.tierUp(to:from:)) |
| Linked accounts | `apps/ios/Flowd/Features/Profile/LinkedAccountsView.swift` | `LinkedAccountsView()` | Route.linkedAccounts | push | api.socialAccounts(); reconnectSocialAccount(id:); disconnectSocialAccount(id:); LinkStatus; AccountHealth; "flowd never posts for you" |
| Account health | `apps/ios/Flowd/Features/Profile/AccountHealthView.swift` | `AccountHealthView()` | Route.accountHealth | push | api.socialAccounts() (AccountHealth per account), api.reputation(); the originality and burner-account rules in plain words |
| Verify your identity | `apps/ios/Flowd/Features/Profile/IDVerificationSheet.swift` | `IDVerificationSheet()` | Route.idVerification | sheet (SheetHost) | api.verifications(), api.startVerification(kind: .identity); VerificationStatus, VerificationReason; never blocks silently |
| Founding creator | `apps/ios/Flowd/Features/Profile/FoundingBadgeView.swift` | `FoundingBadgeView()` | Route.foundingBadge | push | Creator.founding, foundingPerksUntil, foundingFreeActive(now:); BadgeId.foundingCreator |
| Settings | `apps/ios/Flowd/Features/Settings/SettingsView.swift` | `SettingsView()` | Route.settings(nil) | push | hub of ListRow -> router.push(.settings(...), .payoutMethods, .wellbeing, .safety, .legal(nil)); appState.persona / setPersona(_:), appState.resetDemo(), appState.signOut(keepDrafts:), api.isDemo for the "Demo data" indicator; @AppStorage(FlowdPreferenceKey.*) |
| Account | `apps/ios/Flowd/Features/Settings/AccountSettingsView.swift` | `AccountSettingsView()` | Route.settings(.account) | push | api.me(), the persona switch (appState.setPersona), appState.resetDemo(), appState.signOut(keepDrafts:); sign out warns when appState.draftCount > 0 |
| Notifications | `apps/ios/Flowd/Features/Settings/NotificationPreferencesView.swift` | `NotificationPreferencesView()` | Route.settings(.notifications) | push | api.notificationPrefs()/updateNotificationPrefs; NotificationCategory; NotificationPermission.status() and openSystemSettings() |
| Appearance | `apps/ios/Flowd/Features/Settings/AppearanceSettingsView.swift` | `AppearanceSettingsView()` | Route.settings(.appearance) | push | @AppStorage(FlowdPreferenceKey.theme, .reduceGlass, .hapticsEnabled); FlowdThemePreference; AccessibilitySettings.shared for the system mirrors |
| Privacy and data | `apps/ios/Flowd/Features/Settings/PrivacyDataView.swift` | `PrivacyDataView()` | Route.settings(.privacy) | push | api.requestDataExport(), api.deleteAccount() then appState.signOut(); a confirmation sheet for deletion |
| Help and support | `apps/ios/Flowd/Features/Settings/HelpSupportView.swift` | `HelpSupportView()` | Route.settings(.help) | push | static, honest copy; FlowdConstants.WorldInfo.contactEmail; the named human-reply SLA |
| Wellbeing mode | `apps/ios/Flowd/Features/Settings/WellbeingView.swift` | `WellbeingView()` | Route.wellbeing | push | api.wellbeing()/updateWellbeing(_:) then set appState.wellbeing; WellbeingClock; appState.numbersHidden, appState.isPaused |
| Safety center | `apps/ios/Flowd/Features/Safety/SafetyCenterView.swift` | `SafetyCenterView()` | Route.safety | push | ScamShield.copy(for:), api.myReports() -> [ScamReport], router.present(.scamReport(kind:targetID:)) |
| Legal and disclosures | `apps/ios/Flowd/Features/Settings/LegalView.swift` | `LegalView(document: LegalDocument?)` | Route.legal(_:) | push | LegalDocument; api.acceptCreatorAgreement(version:); EarningsEngine.disclaimer for the earnings disclosure; "Draft, not legal advice" |

### 4.3 ios-studio-capture: Studio capture (section 5)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Studio | `apps/ios/Flowd/Features/Studio/Capture/StudioLauncherView.swift` | `StudioLauncherView(entry: StudioEntry)` | Studio cover root (StudioHostView); StudioEntry decides the first step | Studio step (hidden nav bar) | appState.draftStore.drafts(), api.savedBounties(), api.feed(...), api.remixLibrary() (formats); permission status chips; reacts to entry .importVideo (router.open(.importVideo)) and .scriptWithFlo (router.open(.floSheet(...))); close -> router.dismissStudio() |
| Brief | `apps/ios/Flowd/Features/Studio/Capture/StudioBriefPanelSheet.swift` | `StudioBriefPanelSheet(bountyID: String, draftID: String?)` | Route.briefPanel(bountyID:draftID:) | sheet (SheetHost) | api.bountyDetail(id:).tldr (BriefHelpers.tldr), Brief.beats; ticks stored in DraftSnapshot.checklist when draftID is given |
| Pick a format | `apps/ios/Flowd/Features/Studio/Capture/StudioFormatPickerView.swift` | `StudioFormatPickerView(bountyID: String, preselected: FormatId?)` | StudioRoute.formatPicker(bountyID:preselected:) | Studio step (hidden nav bar) | api.remixLibrary().formats ranked by Format.rank, bestForCategories and bestForNiches; FormatBeat for the beat preview; push StudioRoute.script via StudioRouter |
| Script | `apps/ios/Flowd/Features/Studio/Capture/StudioScriptView.swift` | `StudioScriptView(bountyID: String, formatID: FormatId?, hook: String?, draftID: String?)` | StudioRoute.script(bountyID:formatID:hook:draftID:) | Studio step (hidden nav bar) | api.flo(FloRequest(surface: .studio, kind: .script, ...)); HookTextEngine.scoreText/suggestRewrites; DraftStore.save (creates the draft: bountyId, formatId, script, hookText); reads and clears StudioRouter.chosenHook; router.present(.hookLibrary(...)); push StudioRoute.capture |
| Hook library | `apps/ios/Flowd/Features/Studio/Capture/StudioHookLibrarySheet.swift` | `StudioHookLibrarySheet(bountyID: String?, formatID: FormatId?)` | Route.hookLibrary(bountyID:formatID:) | sheet (SheetHost) | api.remixLibrary().hooks, HookTextEngine.fillHook(_:slots:) with HookSlots(app:category:feature:...); writes StudioRouter.chosenHook; Hook.favourite is local (@AppStorage) |
| Capture | `apps/ios/Flowd/Features/Studio/Capture/StudioCaptureView.swift` | `StudioCaptureView(bountyID: String, draftID: String?)` | StudioRoute.capture(bountyID:draftID:) | Studio step (hidden nav bar) | AVFoundation 1080x1920 (FlowdConstants.Studio); DraftStore.save as it records (stage .capture, videoFileName in FlowdDirectories.drafts); teleprompter via router.present(.teleprompterSettings); permission denied -> studio.push(.permissionRecovery(kind)); then studio.push(.hookCoach(draftID:)); FlowdHaptics for shot-checklist ticks |
| Teleprompter | `apps/ios/Flowd/Features/Studio/Capture/StudioTeleprompterSettingsSheet.swift` | `StudioTeleprompterSettingsSheet()` | Route.teleprompterSettings | sheet (SheetHost) | @AppStorage keys owned by the capture agent (wpm default 150, size, mirror, voice-paced, position, opacity); live preview |
| Hook coach | `apps/ios/Flowd/Features/Studio/Capture/StudioHookCoachView.swift` | `StudioHookCoachView(draftID: String)` | StudioRoute.hookCoach(draftID:) | Studio step (hidden nav bar) | ClipAnalyzer.analyze + ScoringEngine.scoreHook on Vision features (HookFeatures / HookObservations); ScoreRing + FlowdScoreBand; ScoredCard.items with atMs and fix; FlowdConstants.checklistLabel; DraftStore.save hookBand/hookPoints |
| Permission needed | `apps/ios/Flowd/Features/Studio/Capture/StudioPermissionRecoveryView.swift` | `StudioPermissionRecoveryView(kind: PermissionKind)` | StudioRoute.permissionRecovery(_:) | Studio step (hidden nav bar) | PermissionKind; Settings deep link via NotificationPermission.openSystemSettings() (it opens flowd's Settings page for any permission); alternative: router.open(.importVideo(bountyID:)) |
| Review your take | `apps/ios/Flowd/Features/Studio/Capture/StudioTakeReviewView.swift` | `StudioTakeReviewView(draftID: String)` | StudioRoute.takeReview(draftID:) | Studio step (hidden nav bar) | AVPlayer over DraftSnapshot.videoURL; DraftStore.save; studio.push(.edit(draftID:)) |

### 4.4 ios-studio-edit: Studio edit, submit and Submissions (section 6)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Edit | `apps/ios/Flowd/Features/Studio/Edit/StudioEditView.swift` | `StudioEditView(draftID: String)` | StudioRoute.edit(draftID:) | Studio step (hidden nav bar) | AVMutableComposition over DraftSnapshot.videoURL; DraftStore.save (stage .edit); studio.push(.captions / .silenceCut / .screenOverlay / .score) |
| Captions | `apps/ios/Flowd/Features/Studio/Edit/StudioCaptionsView.swift` | `StudioCaptionsView(draftID: String)` | StudioRoute.captions(draftID:) | Studio step (hidden nav bar) | Speech on-device captions; BriefHelpers.caption(disclosure:body:trackingLine:hashtags:) keeps the disclosure first; platform safe zones |
| Cut silences | `apps/ios/Flowd/Features/Studio/Edit/StudioSilenceCutView.swift` | `StudioSilenceCutView(draftID: String)` | StudioRoute.silenceCut(draftID:) | Studio step (hidden nav bar) | QAEngine.deadAirGaps(_:minMs:), TextTools for filler words; undo; amount removed via Fmt.secondsLabel |
| Screen overlay | `apps/ios/Flowd/Features/Studio/Edit/StudioScreenOverlayView.swift` | `StudioScreenOverlayView(draftID: String)` | StudioRoute.screenOverlay(draftID:) | Studio step (hidden nav bar) | PhotosUI import of a screen recording; AVMutableComposition overlay; brand assets from api.bountyDetail(id:) |
| Score | `apps/ios/Flowd/Features/Studio/Edit/StudioScoreView.swift` | `StudioScoreView(draftID: String)` | StudioRoute.score(draftID:) | Studio step (hidden nav bar) | ScoringEngine.scoreAnalysis(...) -> hook/flow ScoredCard, suggestHookFixes / suggestFlowFixes, apply(_:to:), explain(_:); ScoreRing, FlowdScoreBand; QaReport pass/warn/fail; "Checklist score" label; DraftStore.save (stage .score) |
| Pre-flight | `apps/ios/Flowd/Features/Studio/Edit/StudioPreflightView.swift` | `StudioPreflightView(draftID: String)` | StudioRoute.preflight(draftID:) | Studio step (hidden nav bar) | QAEngine.run(QaInput(bounty:brandName:durationMs:...)); PreflightBuilder.build(report:bounty:brandName:captionBody:trackingLine:) -> PreflightResult (canSubmit, blockingCount, captionDraft); blocking vs warning states with fix actions |
| Variants | `apps/ios/Flowd/Features/Studio/Edit/StudioVariantsView.swift` | `StudioVariantsView(draftID: String)` | StudioRoute.variants(draftID:) | Studio step (hidden nav bar) | DraftStore (several drafts per bounty); ScoringEngine per variant; the hook x body x CTA matrix; choose which to submit |
| Submit | `apps/ios/Flowd/Features/Studio/Edit/StudioSubmitView.swift` | `StudioSubmitView(draftID: String)` | StudioRoute.submit(draftID:) | Studio step (hidden nav bar) | api.beginUpload(_:), api.submit(_ SubmitRequest) with the draft's scores and qa counts, UploadQueueStore.enqueue / recordProgress / markFailed (resumable, offline queue), idempotencyKey; Rights Card accept; then router.dismissStudio() and router.open(.submission(id:)); first submission -> router.present(.permissionPrimer(.notifications)) |
| Revise | `apps/ios/Flowd/Features/Studio/Edit/StudioRevisionView.swift` | `StudioRevisionView(submissionID: String)` | StudioRoute.revision(submissionID:) | Studio step (hidden nav bar) | api.submissionDetail(id:) (notes, roundsLeft), api.revise(submissionId:_ ReviseRequest); replace -> studio.push(.capture(...)) or re-edit -> studio.push(.edit(...)) |
| Import a video | `apps/ios/Flowd/Features/Studio/Edit/StudioImportSheet.swift` | `StudioImportSheet(bountyID: String?, onImported: @escaping (String) -> Void)` | Route.importVideo(bountyID:) (the registry supplies onImported) | sheet (SheetHost) | PhotosPicker / PhotosUI; validate 9:16 and 15 to 60 s (FlowdConstants.Studio); DraftStore.save a new draft (stage .score); call onImported(draftID); "edit in CapCut, then import" |
| Drafts | `apps/ios/Flowd/Features/Submissions/DraftsView.swift` | `DraftsView()` | Route.drafts | push | appState.draftStore (drafts(), delete(id:)); appState.refreshDrafts(); resume -> router.open(.studio(.resume(draftID:))); storage warning from sizes |
| Submissions | `apps/ios/Flowd/Features/Submissions/SubmissionsListView.swift` | `SubmissionsListView()` | Route.submissions | push | api.submissions(filter: SubmissionFilter) -> [SubmissionListItem] (status pills via SubmissionStatus.flowdStatus, ReviewClock); pull-to-refresh |
| Submission | `apps/ios/Flowd/Features/Submissions/SubmissionDetailView.swift` | `SubmissionDetailView(submissionID: String)` | Route.submission(id:) | push | api.submissionDetail(id:) -> SubmissionDetail (notes [FeedbackNote], analysis, clock, canRevise / canAppeal / canWithdraw / canPost, captionDraft); api.videoAnalysis; api.resolveNote(id:); api.withdraw(submissionId:); router.push(.revise), router.present(.appeal), router.push(.postComposer) |
| Revise | `apps/ios/Flowd/Features/Submissions/ReviseView.swift` | `ReviseView(submissionID: String)` | Route.revise(submissionID:) | push | SubmissionDetail.notes (must-fix first), roundsLeft; api.resolveNote(id:); router.open(.studio(.revise(submissionID:))) |
| Appeal | `apps/ios/Flowd/Features/Submissions/AppealSheet.swift` | `AppealSheet(submissionID: String)` | Route.appeal(submissionID:) | sheet (SheetHost) | api.appeal(submissionId:_ AppealRequest) -> Dispute; Submission.canAppeal(now:); read-only after submit |
| Post it | `apps/ios/Flowd/Features/Submissions/PostComposerView.swift` | `PostComposerView(submissionID: String)` | Route.postComposer(submissionID:) | push | SubmissionDetail.captionDraft / trackingLine / offerCode / link; api.attachPost(submissionId:_ AttachPostRequest) -> Post; ShareLink; the 72-hour window via Post.windowEndsAt and CountdownLabel; Platform |

### 4.5 ios-wallet-widgets: Wallet, earnings, rights (section 7; the Live Activity and widgets live in FlowdWidgets/ and Shared/, they have no Route)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Wallet | `apps/ios/Flowd/Features/Wallet/WalletView.swift` | `WalletView()` | Route.wallet (Wallet tab root) | tab root (inside the shell's NavigationStack) | api.wallet() -> WalletSummary; FlowdEarningsPair; api.earnings(period:) with FlowdAreaChart; api.posts(filter:); Cash out -> router.present(.instantCashOut); WalletSummary.blockers -> .w9 / .idVerification / .payoutMethods; appState.markWalletSeen() is called by the shell; appState.numbersHidden |
| Money Clock | `apps/ios/Flowd/Features/Wallet/MoneyClockView.swift` | `MoneyClockView()` | Route.moneyClock | push | api.moneyClock() -> [MoneyClockRow]; MoneyClockEngine.describe, postTimeline; MoneyClockRow.reasonText + etaAt (never a bare "pending"); named reasons with the next action |
| Earnings | `apps/ios/Flowd/Features/Earnings/EarningsView.swift` | `EarningsView()` | Route.earnings | push | api.earnings(period:) -> EarningsReport (buckets, byBrand, byBounty, typical); FlowdAreaChart / FlowdBarChart with the table alternative; api.taxCSV(year:) via router.push(.tax) |
| Posts | `apps/ios/Flowd/Features/Earnings/PostsView.swift` | `PostsView()` | Route.posts | push | api.posts(filter: PostFilter) -> [PostListItem] (moneyState, clearsAt, reasonLabel); PostStatus.flowdStatus |
| Post | `apps/ios/Flowd/Features/Earnings/PostDetailView.swift` | `PostDetailView(postID: String)` | Route.post(id:) | push | api.postDetail(id:) -> PostDetail (moneyRows, conversions, timeline, rights, disputes, capProgress); FlowdRetentionChart; router.push(.viewLedger), router.present(.dispute(.post(id)), .earningsCard) |
| View Ledger | `apps/ios/Flowd/Features/Earnings/ViewLedgerView.swift` | `ViewLedgerView(postID: String)` | Route.viewLedger(postID:) | push | api.viewLedger(postId:) -> ViewLedger (snapshots, exclusions with cause, sourceSplit); ExclusionCause.meaning; router.present(.dispute(.post(postID))) |
| Dispute | `apps/ios/Flowd/Features/Earnings/DisputeSheet.swift` | `DisputeSheet(target: DisputeTarget)` | Route.dispute(_:) | sheet (SheetHost) | api.openDispute(_ DisputeRequest), api.dispute(id:), api.replyToDispute(id:text:evidence:); DisputeKind; the SLA from Dispute.replyDueAt |
| Payouts | `apps/ios/Flowd/Features/Wallet/PayoutsView.swift` | `PayoutsView()` | Route.payouts | push | api.payouts() -> [Payout], api.payoutMethods(); MoneyClockEngine.nextWeeklyPayout(after:); router.push(.payout(id:)), .payoutMethods |
| Payout | `apps/ios/Flowd/Features/Wallet/PayoutDetailView.swift` | `PayoutDetailView(payoutID: String)` | Route.payout(id:) | push | api.payoutDetail(id:) -> PayoutDetail (rows, proof, arrivesAt); Payout.status via PayoutStatus.flowdStatus |
| Cash out now | `apps/ios/Flowd/Features/Wallet/InstantCashOutSheet.swift` | `InstantCashOutSheet()` | Route.instantCashOut | sheet (SheetHost) | api.payoutPreview(amountCents:) -> PayoutPreview (fee, net, summary, refusal, blockers); api.instantPayout(_ InstantPayoutRequest); success -> appState.celebrate(.payoutArrived(...)); blocked -> .w9 / .idVerification / .payoutMethods |
| Payout methods | `apps/ios/Flowd/Features/Wallet/PayoutMethodsView.swift` | `PayoutMethodsView()` | Route.payoutMethods | push | api.payoutMethods(), addPayoutMethod(_ AddPayoutMethodRequest) (last 4 only), removePayoutMethod(id:) |
| Tax Desk | `apps/ios/Flowd/Features/Wallet/TaxDeskView.swift` | `TaxDeskView()` | Route.tax | push | api.taxSummary() -> TaxSummary (profile, numbers, w9Needed), api.setTaxSetAside(rate:), api.taxCSV(year:) + ShareLink; router.present(.w9); "Not tax advice." |
| W-9 | `apps/ios/Flowd/Features/Wallet/W9FlowSheet.swift` | `W9FlowSheet()` | Route.w9 | sheet (SheetHost) | api.submitW9(_ W9Request) (TIN last 4 only); TaxEntityType, Address; save progress locally |
| Rights and renewals | `apps/ios/Flowd/Features/Rights/RightsRenewalsView.swift` | `RightsRenewalsView()` | Route.rights | push | api.rights() -> RightsOverview (items, alertsDue, renewalExposureCents); respondToRenewal / respondToRightsPermission / revokeRights; RenewalQuote |
| Earnings Card | `apps/ios/Flowd/Features/Earnings/EarningsCardSheet.swift` | `EarningsCardSheet(source: EarningsCardSource)` | Route.earningsCard(_:) | sheet (SheetHost) | api.createProof(_ ProofRequest) / api.proofs() / api.revokeProof(id:); ImageRenderer 9:16 and 1:1; ShareLink; Proof.typicalMedianCents beside the amount; hide amounts |
| Wrapped | `apps/ios/Flowd/Features/Earnings/WrappedView.swift` | `WrappedView(period: WrappedPeriod)` | Route.wrapped(_:) | full-screen cover | api.wrapped() -> [Wrapped] (cards, WrappedCardKind); segmented stories; api.createProof for the share card |

### 4.6 ios-compete-grow: Compete and grow (section 8)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Leaderboard | `apps/ios/Flowd/Features/Leaderboard/LeaderboardView.swift` | `LeaderboardView()` | Route.leaderboard | push | api.leaderboard(scope:metric:niche:) -> LeaderboardStanding (rows, me, resetsAt, unranked, optedOut); FlowdCalendar.nextWeekStart; WellbeingSettings.leaderboardOptOut |
| Tournaments | `apps/ios/Flowd/Features/Tournaments/TournamentsView.swift` | `TournamentsView()` | Route.tournaments | push | api.tournaments() -> [TournamentView]; CountdownLabel; TournamentStatus |
| Tournament | `apps/ios/Flowd/Features/Tournaments/TournamentDetailView.swift` | `TournamentDetailView(tournamentID: String)` | Route.tournament(id:) | push | api.tournament(id:), api.joinTournament(id:_ TournamentEntryRequest); TournamentRound / Matchup bracket; Hook Score of the entry |
| Crew | `apps/ios/Flowd/Features/Crews/CrewScreen.swift` | `CrewScreen(crewID: String?)` | Route.crew(id:) | push | api.crews() -> CrewDirectory, api.crew(id:), joinCrew / leaveCrew; CrewView.goalProgress and bonusNote; nil id = CrewDirectory.mine |
| Crew leaderboard | `apps/ios/Flowd/Features/Crews/CrewLeaderboardView.swift` | `CrewLeaderboardView()` | Route.crewLeaderboard | push | api.crews() (CrewView.crew.weekRank), CrewMemberRow contribution |
| Find a crew | `apps/ios/Flowd/Features/Crews/CrewDiscoverView.swift` | `CrewDiscoverView()` | Route.crewDiscover | push | api.crews().discover, api.createCrew(_ CreateCrewRequest) (Gold and up: CrewDirectory.canCreate / createLockText) |
| Referrals | `apps/ios/Flowd/Features/Referrals/ReferralsView.swift` | `ReferralsView()` | Route.referrals | push | api.referrals() -> ReferralSummary (code, link, rules), api.createReferralInvite(channel:); ShareLink; FTC-safe copy |
| Academy | `apps/ios/Flowd/Features/Academy/AcademyView.swift` | `AcademyView()` | Route.academy | push | api.academy() -> AcademyOverview (lessons, badges, nextLesson); router.push(.lesson(slug:)) |
| Lesson | `apps/ios/Flowd/Features/Academy/LessonView.swift` | `LessonView(slug: String)` | Route.lesson(slug:) | push | api.lesson(slug:) -> LessonItem, api.completeLesson(slug:answers:) -> LessonResult (badgeAwarded); offline cache with DiskCache |
| Badges | `apps/ios/Flowd/Features/Academy/BadgesView.swift` | `BadgesView()` | Route.badges | push | api.academy().badges [BadgeItem] and Creator.badges; share |
| Remix library | `apps/ios/Flowd/Features/Remix/RemixLibraryView.swift` | `RemixLibraryView()` | Route.remix | push | api.remixLibrary() -> RemixLibrary (formats, hooks, trends); "Remix this" -> router.open(.studio(.makeIt(bountyID:formatID:hook:))) (ask for a bounty first) |
| Hook Score | `apps/ios/Flowd/Features/Tools/HookScoreToolView.swift` | `HookScoreToolView()` | Route.hookScoreTool | push | HookTextEngine.scoreText(_:) -> HookTextResult (offline, instant); ClipAnalyzer + ScoringEngine for a picked clip; ScoreRing, FlowdScoreBand; FlowdConstants.checklistLabel |
| Spec library | `apps/ios/Flowd/Features/Specs/SpecLibraryView.swift` | `SpecLibraryView()` | Route.specs | push | api.specs() -> [Spec] (status, band, licenses, priceCents); router.push(.specUpload), .spec(id:) |
| Upload a spec | `apps/ios/Flowd/Features/Specs/SpecUploadView.swift` | `SpecUploadView()` | Route.specUpload | push | api.createSpec(_ CreateSpecRequest), api.scoreSpec(id:); FlowdConstants.Specs (min score to list, price floor and cap); AI likeness off |
| Spec | `apps/ios/Flowd/Features/Specs/SpecDetailView.swift` | `SpecDetailView(specID: String)` | Route.spec(id:) | push | api.specs() filtered by id; api.withdrawSpec(id:); SpecLicense list |
| Auctions | `apps/ios/Flowd/Features/Auctions/AuctionsView.swift` | `AuctionsView()` | Route.auctions | push | api.auctions() -> [Auction]; api.createAuction(_ CreateAuctionRequest); Tier gate Platinum+ (FlowdConstants.Auctions); locked state with the unlock path |
| Auction | `apps/ios/Flowd/Features/Auctions/AuctionDetailView.swift` | `AuctionDetailView(auctionID: String)` | Route.auction(id:) | push | api.auctions() filtered by id; Bid (sealed until close), clearingPriceCents, api.cancelAuction(id:) |
| Storefront | `apps/ios/Flowd/Features/Tools/StorefrontView.swift` | `StorefrontView(handle: String?)` | Route.storefront(handle:) | push | api.creatorProfile(handleOrId:) -> CreatorProfile (nil handle: the creator's own via api.me()); Creator.storefront; ProfileUpdate(storefront:); ShareLink, QR |

### 4.7 ios-brand-mode: Brand mode (section 10)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Overview | `apps/ios/Flowd/Features/BrandMode/BrandOverviewView.swift` | `BrandOverviewView()` | BrandTab.overview (tab root) | tab root | FixtureLoader tables (apps, bounties, submissions, app_metrics_daily, fatigue_alerts, brands) through a BrandModeStore; FlowdFunnelChart + FlowdAttributionKey; StatTile(deltaStyle: .neutral); appState.identity(for: .brand) |
| Review | `apps/ios/Flowd/Features/BrandMode/BrandReviewQueueView.swift` | `BrandReviewQueueView()` | BrandTab.review (tab root) | tab root | submissions + video_analyses + fraud evidence from fixtures; ReputationEngine.reviewClock; ScoreRing/FlowdScoreBand; reason codes (ReasonCode), FeedbackNote timecodes; decisions mutate the BrandModeStore and write an audit entry; calm confirmations only |
| Bounties | `apps/ios/Flowd/Features/BrandMode/BrandBountiesView.swift` | `BrandBountiesView()` | BrandTab.bounties (tab root) | tab root | bounties of br_lumi from fixtures; StatusPill via BountyStatus.flowdStatus; FlowdProgressBar budget bar; router.push(.brand(.bountyDetail(bountyID:))) |
| Insights | `apps/ios/Flowd/Features/BrandMode/BrandInsightsView.swift` | `BrandInsightsView()` | BrandTab.insights (tab root) | tab root | FlowdFunnelChart (tracked vs estimated), FlowdBarChart, StatTile; follow docs/research/analytics-spec.md |
| Wallet | `apps/ios/Flowd/Features/BrandMode/BrandWalletView.swift` | `BrandWalletView()` | BrandTab.wallet (tab root) | tab root | brands.walletBalanceCents, invoices, ledger fixtures; router.present(.brand(.fundEscrow)); SettlementEngine.funding / allInCpm for the fee line |
| Review | `apps/ios/Flowd/Features/BrandMode/BrandReviewDetailView.swift` | `BrandReviewDetailView(submissionID: String)` | BrandRoute.reviewDetail(submissionID:) | push | submissions, video_analyses, fraud_flags fixtures; FlowdRetentionChart for the view curve; ThumbArt as the player stand-in; decision bar with mandatory reason code on reject |
| Bounty | `apps/ios/Flowd/Features/BrandMode/BrandBountyDetailView.swift` | `BrandBountyDetailView(bountyID: String)` | BrandRoute.bountyDetail(bountyID:) | push | bounty row + posts/metrics; FlowdAreaChart pace; RightsEngine.lines; edit caps; pause and extend |
| Creators | `apps/ios/Flowd/Features/BrandMode/BrandCreatorsView.swift` | `BrandCreatorsView()` | BrandRoute.creators | push | creators + creator_reputation + brand_lists fixtures; CreatorSummary; router.present(.brand(.sendOffer(creatorID:))) |
| Creator | `apps/ios/Flowd/Features/BrandMode/BrandCreatorProfileView.swift` | `BrandCreatorProfileView(creatorID: String)` | BrandRoute.creatorProfile(creatorID:) | push | creators, creator_reputation, posts fixtures; TierBadge; typical views from social_accounts |
| Auto-approve rules | `apps/ios/Flowd/Features/BrandMode/BrandAutoApproveRulesView.swift` | `BrandAutoApproveRulesView()` | BrandRoute.autoApproveRules | push | auto_approve_rules fixtures (AutoApproveRule, DryRun, RuleGuardrails); kill switch |
| Notifications and settings | `apps/ios/Flowd/Features/BrandMode/BrandNotificationsSettingsView.swift` | `BrandNotificationsSettingsView()` | BrandRoute.notificationsAndSettings | push | notification prefs for the brand; appState.setPersona(_:) for the persona switch |
| Fund escrow | `apps/ios/Flowd/Features/BrandMode/BrandFundSheet.swift` | `BrandFundSheet()` | BrandRoute.fundEscrow | sheet (SheetHost) | SettlementEngine.funding(budgetCents:takeRate:matchedCents:) and cardProcessing; calm confirmation, never confetti |
| Send an offer | `apps/ios/Flowd/Features/BrandMode/BrandOfferSheet.swift` | `BrandOfferSheet(creatorID: String)` | BrandRoute.sendOffer(creatorID:) | sheet (SheetHost) | Offer fixtures; RateSuggestion band; Rights Card add-ons |

### 4.8 ios-admin-mode: Admin mode (section 11)

| Screen | File | Type and initialiser | Opened by | Presented as | Use |
|---|---|---|---|---|---|
| Control tower | `apps/ios/Flowd/Features/AdminMode/AdminControlTowerView.swift` | `AdminControlTowerView()` | AdminTab.control (tab root) | tab root | admin_metrics fixture -> AdminMetrics (targets, marketHealth, queues, promiseMetrics, alerts); the demo clock via appState.api.advanceDemoClock(hours:) and resetDemo() |
| Queues | `apps/ios/Flowd/Features/AdminMode/AdminQueuesView.swift` | `AdminQueuesView()` | AdminTab.queues (tab root) | tab root | AdminMetrics.queues (QueueCounts), fraud_flags, disputes, verifications, payout_runs fixtures; SLA colour from SlaState |
| Money | `apps/ios/Flowd/Features/AdminMode/AdminPayoutApprovalsView.swift` | `AdminPayoutApprovalsView()` | AdminTab.money (tab root) | tab root | payout_runs fixtures (PayoutRun, HoldSummary), payouts; approve all or per item; writes the audit log |
| Market | `apps/ios/Flowd/Features/AdminMode/AdminMarketHealthView.swift` | `AdminMarketHealthView()` | AdminTab.market (tab root) | tab root | market_series fixtures (MarketSeriesPoint), AdminMetrics.marketHealth; MarketEngine.fillTime / priceCurve; FlowdAreaChart |
| More | `apps/ios/Flowd/Features/AdminMode/AdminMoreView.swift` | `AdminMoreView()` | AdminTab.more (tab root) | tab root | lookup, audit log (activity_log), ML calibration, settings, appState.setPersona(_:) |
| Fraud case | `apps/ios/Flowd/Features/AdminMode/AdminFraudCaseView.swift` | `AdminFraudCaseView(flagID: String)` | AdminRoute.fraudCase(flagID:) | push | fraud_flags fixture (FraudFlag, HourlyEnvelope, FraudSignalHit), MarketEngine.fraudScore; FlowdAreaChart with anomaly markers; hold / clear / ban behind a confirm sheet |
| Dispute | `apps/ios/Flowd/Features/AdminMode/AdminDisputeView.swift` | `AdminDisputeView(disputeID: String)` | AdminRoute.dispute(disputeID:) | push | disputes fixture (Dispute, DisputeEvent); reason code, reply composer, 48 h human-reply SLA |
| Verification | `apps/ios/Flowd/Features/AdminMode/AdminVerificationView.swift` | `AdminVerificationView(verificationID: String)` | AdminRoute.verification(verificationID:) | push | verifications fixture (Verification, VerificationReason); approve or request more |
| Payout run | `apps/ios/Flowd/Features/AdminMode/AdminPayoutRunView.swift` | `AdminPayoutRunView(runID: String)` | AdminRoute.payoutRun(runID:) | push | payout_runs fixture (PayoutRun); holds by HoldReason |
| ML calibration | `apps/ios/Flowd/Features/AdminMode/AdminMLCalibrationView.swift` | `AdminMLCalibrationView()` | AdminRoute.mlCalibration | push | ml_models fixture (MlModel, CalibrationBin, ModelMetric); FlowdBarChart band calibration |
| Audit log | `apps/ios/Flowd/Features/AdminMode/AdminAuditLogView.swift` | `AdminAuditLogView()` | AdminRoute.auditLog | push | activity_log fixture (ActivityEntry); every decision elsewhere writes one |
| Lookup | `apps/ios/Flowd/Features/AdminMode/AdminLookupView.swift` | `AdminLookupView(query: String?)` | AdminRoute.lookup(query:) | push | creators, brands, brand_scorecards fixtures; search |
| Creator | `apps/ios/Flowd/Features/AdminMode/AdminCreatorDetailView.swift` | `AdminCreatorDetailView(creatorID: String)` | AdminRoute.creatorDetail(creatorID:) | push | creators, creator_reputation, payouts, disputes fixtures |
| Brand | `apps/ios/Flowd/Features/AdminMode/AdminBrandDetailView.swift` | `AdminBrandDetailView(brandID: String)` | AdminRoute.brandDetail(brandID:) | push | brands, brand_scorecards, invoices, disputes fixtures |

### 4.9 Screens with no Route (flows and states the shell or another target owns)

| What | Where | Owner |
|---|---|---|
| Auth gate and splash (mark draw-on, session restore, fixture-load failure with retry), maintenance and forced-update gates | `App/RootView.swift`, `App/SplashView.swift` | ios-core |
| Tab shell, action fan, Continue draft accessory, scroll-minimise | `App/TabShell.swift`, `App/TabAccessories.swift` | ios-core |
| Deep-link router, notification taps, widget and Live Activity links | `App/Router.swift`, `App/RouteTypes.swift`, `App/FlowdAppDelegate.swift`, `AppState.open(_:)` | ios-core |
| Toast host, celebration layer (confetti or Mint wash), offline and upload banner, upload queue sheet (`Route.uploadQueue`) | `App/AppOverlays.swift`, `App/UploadQueueView.swift` | ios-core |
| Live Activity (Lock Screen, Dynamic Island) and Home Screen widgets | `FlowdWidgets/`, `Shared/`, `Core/Utilities/LiveActivityBridge.swift`, `WidgetSnapshotPublisher.swift` | ios-wallet-widgets |
| Onboarding steps (intro, earnings preview, Sign in with Apple, niches and style, link accounts, age and agreement, First-Dollar Path) | inside `OnboardingFlowView` | ios-onboarding-profile |
| Design-system catalogue | `DesignSystem/DesignGallery.swift` (launch key `design-gallery`) | ios-core |

---

## 5. Brand mode and Admin mode (ios-brand-mode, ios-admin-mode)

- The shells are `BrandShell` / `AdminShell` (App/PersonaShells.swift): the same floating glass tab bar, one `NavigationStack` per tab. Tab roots come from `ScreenRegistry.brandRoot(_:)` / `adminRoot(_:)`; pushed screens and sheets come from `BrandRoute` / `AdminRoute`, carried as `Route.brand(_:)` / `Route.admin(_:)`: `router.push(.brand(.reviewDetail(submissionID: id)))`, `router.present(.brand(.fundEscrow))`.
- `FlowdAPI` is creator-scoped. Brand and Admin mode read the **same fixture tables the web dashboard uses** through `FixtureLoader` (Core/Services/FixtureLoader.swift) inside their own stores (for example `BrandModeStore`, `AdminModeStore`, `@MainActor @Observable`, created once and held by an environment object you add in your own folder), decode them with the Core models (`Bounty`, `Submission`, `VideoAnalysis`, `FraudFlag`, `Dispute`, `Verification`, `PayoutRun`, `AdminMetrics`, `MlModel`, ...), derive numbers with the Core engines (`ReputationEngine`, `SettlementEngine`, `MarketEngine`, `EarningsEngine`), and keep mutations in memory (a decision on a submission updates the store and appends an `ActivityEntry`). `appState.identity(for: .brand)` / `.admin` gives the ids (`br_lumi`, `app_lumi`, `bm_lumi_jordan`, `usr_ops`). `DemoIDs` lists ids that exist in the fixtures.
- Brand mode: calm confirmations only (no confetti) for funding, approving and spending; neutral ink and arrows for deltas (`StatTile(..., deltaStyle: .neutral)`), tracked vs estimated chips on every attributed number (`FlowdAttributionKey`, `ConversionSource`: CPA pays only `link` and `code`). Admin mode: every destructive action (ban, clawback, hold) goes through a confirm sheet and writes the audit log.
- The persona switch is `appState.setPersona(_:)` (Brand "Notifications and settings", Admin "More", Creator Settings > Account); it resets navigation and the shell cross-fades.
- Brand and Admin screens appear in launch keys (`brand-*`, `admin-*`) so they need populated content with no setup.

---

## 6. Integration points between areas (who calls whom)

| From | To | How |
|---|---|---|
| Bounty detail "Make it", Daily Drop claim, Remix "Remix this", What to post today | Studio | `router.open(.studio(.makeIt(bountyID:formatID:hook:)))` (Remix needs a bounty first: offer the creator's claimed or saved bounties) |
| Home "Continue draft", Drafts list, Studio accessory | Studio at the draft's stage | `router.open(.studio(.resume(draftID:)))` |
| Studio submit | Submissions | `router.dismissStudio()` then `router.open(.submission(id:))` |
| Submission detail "Revise" | Studio | `router.open(.studio(.revise(submissionID:)))`; the Revise screen (checklist) is `Route.revise` |
| Submission detail "Post" | Post composer | `router.push(.postComposer(submissionID:))` |
| Post detail | View Ledger, Dispute, Earnings Card | `router.push(.viewLedger(postID:))`, `router.present(.dispute(.post(id)))`, `router.present(.earningsCard(.latest))` |
| Wallet "Cash out" | Instant cash-out, W-9, ID, payout methods | `router.present(.instantCashOut)`; blockers open `.w9`, `.idVerification`, `.payoutMethods` |
| Any money-moving success | Celebration | `appState.celebrate(.clearedMoney(...))` / `.payoutArrived(...)` / `.approval(...)` (earned outcomes only) |
| Profile "Switch persona", demo reset, sign out | AppState | `appState.setPersona(_:)`, `appState.resetDemo()`, `appState.signOut(keepDrafts:)` |
| Flo anywhere | Flo | `router.push(.flo(ctx))` from a screen, `router.present(.floSheet(ctx))` from the Studio or a sheet; `FloLaunchContext(surface:bountyID:formatID:hookText:prompt:)` |
| Scam Shield "Report" anywhere | Report sheet | `router.present(.scamReport(kind: .brand, targetID: brandID))` (`.message`, `.offer`, `.bounty`, `.creator` too) |
| Notification, widget, Live Activity, email link | Anything | `appState.open(DeepLink.parse(url))` |

---

## 7. Decisions and open items (ios-core)

- **Screen type names.** A screen is `<Name>View` unless Core or the DesignSystem already declares that name: `DailyDropView` and `CrewView` are Core read-models, so those screens are `DailyDropScreen` and `CrewScreen`. Studio screens are prefixed `Studio` (`StudioScoreView`, ...) to avoid generic names. Never declare a type named `Flowd` (module) or `FlowdKit` (a design-system enum).
- **Route cases cover every screen with an id, a deep link or a cross-area entry**, including sheets that need only ids (`.rightsCard`, `.counterOffer`, `.dispute`, `.earningsCard`, `.briefPanel`, `.hookLibrary`, `.teleprompterSettings`). Sheets that edit shared state use shared objects, not bindings: filters in `appState.feedQuery`, the chosen hook in `StudioRouter.chosenHook`, teleprompter settings in `@AppStorage`.
- **Launch arguments write the real preference keys** (`flowd.pref.theme`, `flowd.pref.reduceGlass`) so `flowdRoot()` has one source of truth; they persist in that simulator install until changed in Settings.
- **Session restore in demo mode.** A normal launch uses the mock signed in as Maya when onboarding finished on this install (`FlowdDefaultsKey.onboarded`), signed out otherwise; the mock is in-memory, so a creator who onboarded as a new Apple user returns as Maya on the next launch. With `-FlowdAPI live` the Keychain token decides.
- **Placeholders are visible.** Until a screen is built its placeholder shows a "To be built by <owner>" empty state so the app compiles and every route resolves. `OnboardingFlowView`'s placeholder offers "Continue as the demo creator" so a first run is not a dead end.
- **DesignSystem edits by ios-core (additive):** `Glass/FlowdScrollChrome.swift` (new: scroll-to-top tick, scroll-offset report, `FlowdScrollAnchor`), `Components/FlowdScreen.swift` (wraps its scroll view in a `ScrollViewReader` and applies the scroll chrome), `Components/FlowdTabBar.swift` (`FlowdTabItem.dot` and `FlowdTabDot` for status dots next to the numeric badge).
- The brand and admin tab bars hold five tabs in one cluster (no centre action).
- `Route.flo` pushes Flo as a screen; `Route.floSheet` presents the same view as a sheet (use it from the Studio and from sheets).
