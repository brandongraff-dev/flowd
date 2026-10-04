# FlowdKit (apps/ios/Flowd/DesignSystem)

The SwiftUI Liquid Glass design system for the flowd creator app. It is the only place raw colours, fonts, spacing, motion, haptics and glass live. Feature code (`Features/**`) consumes it and never reaches around it. Theme "Lagoon Glass", iOS 17+, Liquid Glass on iOS 26 with a Material fallback on 17 to 25, Swift 5 language mode, no packages.

There is no Swift compiler on the Windows dev machines. Everything here was written conservatively and audited by script (token references, call-site labels, bracket balance) but **not compiled**; the macOS CI job is the compiler of record. If a feature file fails to build because of a DesignSystem signature, fix the call site to match this README, and only touch the DesignSystem with a small additive edit.

"FlowdKit" is the name of this design system as a whole, not a Swift type: `Tokens.swift` already declares `enum FlowdKit` (its generated colour and gradient helpers), so never declare another type with that name. Types here are prefixed `Flowd…` except the headline components (`MoneyText`, `StatTile`, `Pill`, `Chip`, `StatusPill`, `TierBadge`, `AvatarView`, `ThumbArt`, `ScoreRing`, `ProgressRing`, `ListRow`, `SectionHeader`, `SegmentedPicker`, `EmptyStateView`, `ErrorStateView`, `SkeletonView`, `CountdownLabel`, `ToastCenter`, `ToastHost`, `AuroraBackground`, `ConfettiView`, `PayoutArriveView`, `TierUpView`, `ArtSeed`).

Review everything visually in `DesignGallery.swift` (`#Preview("Design gallery")`): every component on the aurora, with live switches for dark, light and Reduce glass.

---

## 0. The rules (read these, then the API)

1. **Semantic tokens only.** No hex, no `Color(red:)`, no `.font(.system(size:))` and no `.font(.title)` in `Features/**`. Use `FlowdColor`, `FlowdSpacing`, `FlowdRadius`, `FlowdLayout`, `FlowdGradient`, `FlowdTone`, and the type modifiers `flowdDisplay / flowdFigure / flowdBody / flowdCaption`. Never read `FlowdPrimitive` (raw ramps) or `FlowdGlassSpec`.
2. **Glass only through the wrappers.** Never call `glassEffect`, `GlassEffectContainer`, `.buttonStyle(.glass)` or `glassEffectID` in a feature. Every `#available(iOS 26, *)` (and the iOS 18 zoom helpers) lives in `DesignSystem/Glass`.
3. **Layers.** L0 aurora. **L1 = content = `FlowdCard` / `.flowdSurface()`** (quiet glass, same on every OS). **L2 = floating controls** (tab bar, pills, icon buttons, toasts, the selected segment). **L3 = sheets and panels** (`.flowdGlass(.l3)`). Glass never sits on glass: no L2 inside an L2 control, no glass button inside a system toolbar item. Inside glass use fills (`FlowdColor.surfaceField`, `FlowdWell`), not more glass. Max two glass layers in a stack.
4. **Text lives on L1.** Put copy on `FlowdCard`, not directly on the aurora, so it always passes AA. The fill carries contrast; never lower the blur or use `fgSubtle` to "fix" legibility.
5. **Numbers are heroes.** Money is integer cents in data and formatted only through `MoneyText` / `FlowdMoneyFormat`. Cleared (Mint, check), pending (Lagoon, clock, with its clear date, never a bare "pending"), paid, escrowed (lock), down (Rose, minus), bonus (Mint, plus) are always visually distinct.
6. **Colour is never the only cue.** Every status and money state carries a glyph and a word; selected states carry a check or a filled symbol plus the `isSelected` trait.
7. **One primary gradient button per view.** Peers are `.secondary` glass or `.ghost`. Ember is the single most urgent action (Daily Drop, Submit). Mint means earned money only.
8. **Celebrate earned outcomes only** (cleared money, approvals, tier-up). Funding, bidding and spending get calm confirmations (`ToastCenter.success`). Real inventory only: `CountdownLabel` binds to a true deadline.
9. **Respect the user's settings.** Reduce Transparency, the in-app Reduce glass switch, Reduce Motion, Increase Contrast, Differentiate Without Color and Dynamic Type are handled inside the wrappers; do not special-case them in features. Do not suppress them.
10. **Every view file ends with a `#Preview`**, wrapped in `FlowdPreviewCanvas { ... }` so it is judged on the aurora. Copy is plain, specific, no exclamation marks, "bounty / creator / payout / pending to cleared" vocabulary.

---

## 1. Wire-up (done once, in `RootView`)

```swift
RootView()
    .flowdRoot()               // reads the 3 in-app prefs (Reduce glass, haptics, theme), applies the accent tint
    .flowdToastHost()          // draws ToastCenter toasts as L2 glass capsules (top). bottomInset lifts bottom toasts above the tab bar
    .flowdClock { demoNow }    // OPTIONAL: pin "now" for countdowns (demo world is 2026-10-03T14:00:00Z)
```

Settings screen writes the preferences with `@AppStorage`:

```swift
@AppStorage(FlowdPreferenceKey.reduceGlass) private var reduceGlass = false
@AppStorage(FlowdPreferenceKey.hapticsEnabled) private var haptics = true
@AppStorage(FlowdPreferenceKey.theme) private var themeRaw = FlowdThemePreference.system.rawValue
```

Raise toasts from anywhere on the main actor:

```swift
@Environment(\.flowdToasts) private var toasts
toasts.success("Draft saved")
toasts.money("$62.40 cleared to your Wallet")
toasts.warning("You're offline", detail: "Everything you made is saved.")
toasts.error("Upload stopped at 62%", detail: "Your take is saved on this phone.", actionTitle: "Retry") { retry() }
```

---

## 2. Screen recipes

### A scrolling screen (most screens)

```swift
struct WalletView: View {
    var body: some View {
        FlowdScreen {                                           // aurora + ScrollView + 16 pt gutter + 20 pt rhythm
            FlowdCard {
                FlowdEarningsPair(clearedCents: 128_460, pendingCents: 18_620, pendingNote: "clears Sat 2:00 PM")
            }
            SectionHeader("Recent activity", actionTitle: "See all") { showAll() }
            FlowdCard {
                VStack(spacing: 0) {
                    ListRow(title: "Lumen hook B", subtitle: "Clears in 41 h", systemImage: "play.rectangle.fill", tone: .info) {
                        MoneyText(cents: 3_820, style: FlowdFont.figureSm, state: .pending)
                    }
                    FlowdDivider(inset: 52)
                    ListRow(title: "Payout methods", subtitle: "Bank ending 4417", systemImage: "building.columns", showsChevron: true)
                }
            }
        }
        .flowdNavigationTitle("Wallet")     // system large title; iOS 26 draws the glass bar itself
    }
}
```

### Loading, empty, error (every list)

```swift
switch viewModel.state {
case .loading:  FlowdCard { VStack { SkeletonRow(); SkeletonRow(); SkeletonRow() } }
case .empty:    EmptyStateView(systemImage: "creditcard", title: "Your first payout lands here",
                               message: "Pending money shows the day it clears.", actionTitle: "Browse bounties") { openBounties() }
case .failed:   ErrorStateView(title: "Couldn't load your Wallet", message: "Check your connection and try again.") { reload() }
case .loaded:   content
}
// or turn real content into its own skeleton:  content.flowdSkeleton(isLoading: viewModel.isLoading)
```

### Tab shell (system bar hidden, custom glass bar inset above the scroll content)

```swift
TabView(selection: $tab) {
    HomeRoot().tag(AppTab.home).flowdHideSystemTabBar()
    BountiesRoot().tag(AppTab.bounties).flowdHideSystemTabBar()
    WalletRoot().tag(AppTab.wallet).flowdHideSystemTabBar()
    ProfileRoot().tag(AppTab.profile).flowdHideSystemTabBar()
}
.flowdBottomBar {
    FlowdTabBar(
        leading:  [FlowdTabItem(id: AppTab.home, title: "Home", systemImage: "house", selectedSystemImage: "house.fill"),
                   FlowdTabItem(id: AppTab.bounties, title: "Bounties", systemImage: "target")],
        trailing: [FlowdTabItem(id: AppTab.wallet, title: "Wallet", systemImage: "creditcard", selectedSystemImage: "creditcard.fill"),
                   FlowdTabItem(id: AppTab.profile, title: "Profile", systemImage: "person.crop.circle", selectedSystemImage: "person.crop.circle.fill")],
        selection: $tab,
        center: FlowdTabCenterAction(systemImage: "video.fill", label: "Make a take") { showStudio = true }
    )
}
```

### A sheet

```swift
.sheet(isPresented: $showOffer) {
    OfferSheet()
        .flowdSheetChrome(detents: [.medium, .large])     // apply to the ROOT of the sheet content
}
```

### A sticky call to action over scrolling content

```swift
ScrollView { ... }
    .flowdBottomBar {
        FlowdButton("Make a take", systemImage: "video.fill", fullWidth: true) { startStudio() }
            .padding(.horizontal, FlowdLayout.gutter).padding(.bottom, FlowdSpacing.xs)
    }
```

### A card that zooms into its detail (iOS 18+, no-op before)

```swift
@Namespace private var zoom
Button { path.append(bounty) } label: { BountyCard(bounty) }
    .buttonStyle(FlowdPressStyle())
    .flowdZoomSource(id: bounty.id, in: zoom)
// on the pushed view:
BountyDetailView(bounty).flowdZoomDestination(sourceID: bounty.id, in: zoom)
```

---

## 3. API reference

Signatures are exact. Parameters with `= x` are optional. Closures are always the last parameter, so trailing-closure syntax works.

### 3.1 Theme and environment (`Theme.swift`)

| Name | What |
|---|---|
| `View.flowdRoot()` | Apply once at the root. Publishes the in-app prefs, applies the colour-scheme preference and the accent tint. |
| `View.flowdClock(_ now: @escaping @Sendable () -> Date)` | Pin the clock `CountdownLabel` reads (previews, tests, demo world). |
| `View.flowdReduceGlass(_ enabled: Bool)` | Force Reduce glass for a subtree (previews, tests). |
| `EnvironmentValues.flowdReduceGlass: Bool` | The in-app Reduce glass switch. |
| `EnvironmentValues.flowdHapticsEnabled: Bool` | The in-app haptics switch (Wellbeing Mode, Settings). |
| `EnvironmentValues.flowdNow: @Sendable () -> Date` | The design system's clock. |
| `EnvironmentValues.flowdToasts: ToastCenter` | The toast center (defaults to `ToastCenter.shared`). |
| `FlowdPreferenceKey.reduceGlass / .hapticsEnabled / .theme` | `@AppStorage` keys (`String`). |
| `FlowdThemePreference` | `.system / .dark / .light`; `title`, `colorScheme: ColorScheme?`; raw `String`, `CaseIterable`. |
| `FlowdAppearance` | `DynamicProperty`. Declare `private var appearance = FlowdAppearance()` in a view to read: `isDark`, `reduceGlass` (system OR in-app), `reduceMotion`, `increasedContrast`, `differentiateWithoutColor`, `rimWidth` (1 or 1.5), and `animation(_ spring: FlowdSpring) -> Animation` (a 150 ms fade under Reduce Motion). |
| `FlowdTone` | Semantic colour role: `.neutral .accent .violet .mint .ember .sun .rose .info`. Properties: `ink` (AA-safe text), `solid` (fill) + `onSolid` (label on it), `soft` (tinted background), `gradient: LinearGradient?`, `glow`. Accent = interactive, mint = money earned, info = pending, ember = urgency, sun = featured / Elite, rose = danger, violet = Flo. |

### 3.2 Colour, spacing, radius, layout (from `Tokens.swift`, generated, never edit)

- **Colour (`FlowdColor`, light/dark dynamic):** surfaces `bg bgElevated bgSunken surface surfaceRaised surfaceField surfaceHover surfaceActive surfaceGlass1/2/3 scrim`; text `fg fgMuted fgSubtle fgDisabled fgInverse`; lines `rim rimStrong divider focusRing`; accent `accentSolid accentBright accent accentSoft onAccent`; and for each of `violet mint ember sun rose info`: base (text), `Solid`, `Soft`, `on…`. Base names are text-safe; fills are `…Solid` with their `on…` label. `fgDisabled` is never for readable text.
- **Gradients (`FlowdGradient`):** `flow` (decorative, never behind small text), `flowButton` (primary CTA), `flowSoft`, `money`, `ember`, `sun`, `flo`.
- **Spacing (`FlowdSpacing`, 4 pt grid):** `xxs 4, xs 8, sm 12, md 16, lg 20, xl 24, xxl 32, xxxl 40, huge 48, giant 64, jumbo 80, mega 96`.
- **Radius (`FlowdRadius`):** `sm 8, md 12, lg 16, xl 20, xxl 28, xxxl 36, pill`; `concentric(outer:padding:)` (child = parent minus padding). Chips 8, buttons 12, cards 20 to 28, sheets 28 to 36.
- **Layout (`FlowdLayout`):** `hitTarget 44, gutter 16, tabBarHeight 64, headerHeight 64`.

### 3.3 Typography (`Typography.swift`)

SF Pro Rounded for display and every number, SF Pro for text, SF Mono for code. All scale with Dynamic Type except `.hero`/`figureHero`. Cap where a layout cannot reflow: `.flowdDynamicTypeCap(.accessibility1)`.

```swift
Text("Wallet").flowdDisplay(.title1)                // .hero .largeTitle .title1 .title2 .title3
Text("$1,284.60").flowdFigure(.xl)                  // .hero .xl .lg .md .sm .xs  (tabular digits)
Text(brief).flowdBody(.callout)                     // .headline .body .callout .subheadline .button
Text("Decides by Fri 2 PM").flowdCaption(.footnote) // .footnote .caption1 .caption2 .overline .code
Text("Pending").flowdInk(.muted)                    // or .foregroundStyle(FlowdColor.fgMuted)
```

`FlowdInk`: `.primary .muted .subtle .disabled .inverse .tone(FlowdTone)`. Note: `.flowdBody(.footnote)` does not exist; footnote is a **caption** style. Direct styles for money components: `FlowdFont.figureHero/XL/Lg/Md/Sm/XS`, `FlowdFont.title3`, `FlowdFont.button/buttonCompact/buttonLarge`, `FlowdFont.tabLabel` (type `FlowdTextStyle`; apply with `.flowdText(style)`).

### 3.4 Motion (`Motion.swift`)

| Name | What |
|---|---|
| `FlowdSpring` | `.tap .snappy .smooth .sheet .gentle .bouncy`. `animation`, `resolved(reduceMotion:)`. `tap` presses, `snappy` menus and tabs, `smooth` cards and count-ups, `sheet` sheets, `gentle` hero art, `bouncy` momentum or payout moments only. |
| `View.flowdAnimation(_ spring: FlowdSpring = .smooth, value:)` | `.animation(_:value:)` that becomes a short fade under Reduce Motion. |
| `FlowdPressStyle` / `.buttonStyle(.flowdPress)` | Scale 0.96 on touch-down, spring back; dims instead of scaling under Reduce Motion. Wrap any tappable card or row: `Button { } label: { FlowdCard { ... } }.buttonStyle(FlowdPressStyle())`. `FlowdPressStyle(scale: 0.94)` for a different scale. |
| `AnyTransition.flowdMaterialize / .flowdRise / .flowdPop` | Blur+scale+fade arrival; 8 pt rise; icon-swap pop. |
| `View.flowdReveal(index: Int)` | Fade and rise on first appear, 40 ms per index, capped at 8. Never on high-frequency screens. |
| `FlowdPhysics.project(velocity:decelerationRate:)`, `.rubberBand(overshoot:dimension:constant:)`, `.nearest(to:in:)` | Pure maths for hand-built gestures (flick landing point, soft edges, snap points). |

Do not animate keyboard actions or anything done 100 times a day. Durations (`FlowdMotion.fast/base/slow`) and curves (`FlowdMotion.standard(_:)`, `.emphasized(_:)`) come from Tokens.

### 3.5 Haptics (`Haptics.swift`)

One haptic per user action, on the causal frame, never as the only feedback, never per frame.

```swift
.flowdHaptic(.selection, trigger: selectedTab)       // declarative; honours the in-app haptics switch
FlowdHaptics.play(.success)                          // imperative (main actor); gesture ends, view-model events
FlowdHaptics.prepare(.selection)                     // warm the engine just before a known haptic
```

`FlowdHapticKind`: `.selection` (tab, segment, picker) `.tap` (light press) `.press` (medium: record start, commit) `.heavy` `.success` (cleared money, approval, tier-up) `.warning` (gentle bad news, once) `.error` `.increase` `.decrease`. `FlowdHaptics.isEnabled` mirrors the in-app switch.

### 3.6 Glass (`Glass/`)

```swift
.flowdSurface(cornerRadius: FlowdRadius.xxl, tint: nil, elevated: true)             // L1 quiet content surface (FlowdCard uses it)
.flowdGlass(_ layer: FlowdGlassLayer = .l2, tint: Color? = nil, interactive: Bool = false, elevated: Bool = true, cornerRadius: CGFloat? = nil)
.flowdGlass(_ layer = .l2, tint:, interactive:, elevated:, in: someInsettableShape)   // any shape
.flowdGlassCapsule(_ layer = .l2, tint:, interactive:, elevated:)                      // pills, toasts, tab clusters
.flowdGlassCircle(_ layer = .l2, tint:, interactive:, elevated:)                       // icon buttons
```

- `FlowdGlassLayer`: `.l1` quiet (never `glassEffect`), `.l2` controls (iOS 26 `glassEffect`, Material fallback), `.l3` sheets and panels (default radius 36), `.clear` over media only, under bold large content, never body text.
- `tint:` tints the GLASS of the one primary action, never the label. `interactive: true` makes iOS 26 glass flex under touch (custom tappable glass only). Reduce glass / Reduce Transparency swap every layer for a solid, tinted, opaque surface automatically.
- **`FlowdGlassContainer(spacing: CGFloat? = nil) { ... }`** groups sibling glass so it samples together and (iOS 26) blends and morphs. Pass-through before 26. Put related glass in ONE container; never wrap scrolling rows.
- **Matched morph:** inside a container, give each glass view an id and change state in `withAnimation`: `.flowdGlassID("fab", in: namespace)` (iOS 26 `glassEffectID`, `matchedGeometryEffect` before), `.flowdGlassUnion(id:namespace:)` (several views as one shape at rest), `.flowdMorphTransition()` (scale+fade for views entering a cluster before iOS 26).
- **Chrome:** `.flowdSheetChrome(detents:showsGrabber:)`, `.flowdBottomBar { }` / `.flowdTopBar { }` (iOS 26 `safeAreaBar`, `safeAreaInset` before), `.flowdScrollEdgeEffect(hard:edges:)`, `.flowdClearNavigationBar()`, `.flowdHideSystemTabBar()`, `.flowdZoomSource(id:in:)`, `.flowdZoomDestination(sourceID:in:)`.
- **Button style:** `FlowdGlassButtonStyle(_ variant = .secondary, size: = .regular, fullWidth: = false, isIconOnly: = false, haptic: = nil)`, also `.buttonStyle(.flowdGlass(.primary))`. Prefer `FlowdButton`. Variants: `.primary` (Flow gradient, white label), `.secondary` (L2 glass), `.ember`, `.mint`, `.destructive`, `.ghost`. Sizes: `.compact` (44), `.regular` (50), `.large` (58).

### 3.7 Aurora and screens

| Name | What |
|---|---|
| `AuroraBackground(intensity: = .full, isAnimated: = true)` | L0. Four radial orbs plus grain, 90 s drift; static under Reduce Motion, Low Power Mode and when inactive. `.calm` (60 percent) for dense data screens. One per screen. |
| `View.flowdAurora(_ intensity = .full)` | Puts the aurora behind a view (ignores safe area). |
| `FlowdScreen(aurora: = .full, spacing: = FlowdSpacing.lg) { ... }` | The standard scrolling screen (aurora + scroll + gutter + soft scroll edge). |
| `FlowdPreviewCanvas { ... }` | Preview helper: aurora + scroll. Wrap every `#Preview`. |
| `FlowdNavBar(_ title, subtitle: = nil, isLarge: = true, leading: { }, trailing: { })` | Custom header for screens that HIDE the system bar (onboarding, Studio). Use labelled `leading:` / `trailing:` closures (a bare trailing closure is ambiguous). Variants: title only, `leading:` only, `trailing:` only. |
| `FlowdBackButton(label: = "Back")` | Glass back button (dismisses). |
| `View.flowdNavigationTitle(_ title, large: = true)` | System title; lets the aurora through on iOS 17 to 25. |
| `FlowdCloseToolbarItem { dismiss() }` | `ToolbarContent`: a plain "x" for sheets. Never put a glass `FlowdIconButton` inside a toolbar. |

### 3.8 Components (`Components/`)

**Buttons**

```swift
FlowdButton(_ title: String, subtitle: String? = nil, systemImage: String? = nil, variant: = .primary,
            size: = .regular, isLoading: = false, fullWidth: = false, haptic: FlowdHapticKind? = nil, action: () -> Void)
FlowdIconButton(systemImage:, label:, variant: = .secondary, size: = .compact, badge: Int? = nil, action:)   // label is mandatory (VoiceOver)
FlowdBadgeDot(count:)
```

**Surfaces**

```swift
FlowdCard(padding: = FlowdSpacing.md, radius: = FlowdRadius.xxl, tint: Color? = nil, elevated: = true, expands: = true) { ... }
FlowdWell(padding: = FlowdSpacing.sm, radius: = FlowdRadius.md) { ... }     // a fill (not glass) inside a card
SectionHeader(_ title, subtitle: = nil, actionTitle: = nil, action: (() -> Void)? = nil)
ListRow(title:, subtitle: = nil, systemImage:, tone: = .accent, showsChevron: = false) { trailing }           // icon-tile leading
ListRow(title:, subtitle: = nil, systemImage:, tone: = .accent, showsChevron: = false)                         // no trailing
ListRow(title:, subtitle: = nil, showsChevron: = false) { leading }                                            // custom leading
ListRow(title:, subtitle: = nil, showsChevron: = false, leading: { }, trailing: { })
FlowdIconTile(systemImage:, tone: = .accent, size: = 40)       FlowdDivider(inset: = 0)
```

**Money and numbers**

```swift
MoneyText(cents: Int, style: FlowdTextStyle = FlowdFont.figureLg, state: FlowdMoneyState = .neutral, showsCents: = true,
          signed: = false, showsGlyph: = true, countsUpOnAppear: = false, animates: = true)
FlowdEarningsPair(clearedCents:, pendingCents:, pendingNote: String? = nil, heroStyle: = FlowdFont.figureXL, countsUpOnAppear: = false)
StatTile(_ title, value: FlowdStatValue, delta: FlowdDelta? = nil, deltaStyle: = .creator, sparkline: [Double] = [],
         systemImage: String? = nil, valueStyle: = FlowdFont.figureLg, chartTone: = .azure)
FlowdDelta(_ fraction: Double, vs: "Aug")        // 0.38 reads "+38% vs Aug"; always name the period
FlowdStatValue: .money(cents:state:) .count(Int) .compact(Double) .percent(Double) .text(String)
FlowdGridColumns.two / .three                    // LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) { StatTile ... }
FlowdMoneyFormat.string(cents:showsCents:signed:)  .compact(cents:)  .rate(cpmCents:)  .rateShort(cpmCents:)
FlowdNumberFormat.grouped(_:)  .compact(_:)  .percent(_:fractionDigits:)
```

`FlowdMoneyState`: `.cleared` (Mint, check) `.pending` (Lagoon, clock) `.paid` (bank) `.escrowed` (lock) `.down` (Rose, minus, always negative) `.bonus` (Mint, plus) `.neutral`. `deltaStyle: .creator` colours up Mint and down Rose; `.neutral` is ink and arrows only (brand surfaces).

**Labels and selection**

```swift
Pill(_ text, systemImage: String? = nil, tone: = .neutral, style: PillStyle = .soft /.solid /.outline, size: PillSize = .regular /.small)
StatusPill(_ status: FlowdStatus, detail: String? = nil, size: = .regular)
   // FlowdStatus: live funded scheduled draft soldOut closed expired | inReview revision approved rejected appealed | pending cleared paid held
   // Titles: rejected reads "Not approved", revision reads "Needs changes". Always add the reason and next step beside a rejection.
Chip(_ title, systemImage: = nil, count: Int? = nil, isSelected: Bool, action:)      FlowdWrap(spacing:lineSpacing:) { chips }   // chips are 44 pt tall: lineSpacing: 0
SegmentedPicker(selection: $value, values: [Value], fillsWidth: = true) { value in "Title" }
SegmentedPicker(selection: $value, options: [SegmentedPicker<V>.Option(value:, title:, systemImage: nil)], fillsWidth: = true)
TierBadge(_ level: FlowdTierLevel, size: = .row /.chip /.card /.hero, showsLabel: = false)       TierMedallion(level:, diameter:)     TierChip(_ level)
   // FlowdTierLevel: .bronze .silver .gold .platinum .elite; rank, title, next, previous, newPerks, init?(contractValue:), Comparable
```

**Identity and art**

```swift
AvatarView(seed: String, name: String? = nil, size: CGFloat = 40, shape: .circle /.roundedSquare = .circle, tier: FlowdTierLevel? = nil)
ThumbArt(_ art: ArtSeed, aspect: .portrait /.landscape /.card /.square = .portrait, cornerRadius: = FlowdRadius.lg, showsText: = true, isDecorative: = false)
ArtSeed(seed: Int = 1, palette: ArtPalette = .flow, motif: ArtMotif = .orbs, title: String?, caption: String?, glyph: String?, angle: Double?)
ArtSeed(key: "bnty_lumen_hook_a", title:, caption:, glyph:)     // derives palette, motif, seed from a stable key
```

`ArtSeed` is `Codable` and decodes tolerantly from an object, a key string or an integer (`"art_seed": {...}`, `"art_seed": "bnty_x"`, `"art_seed": 1842`); unknown palette or motif fall back. Palettes: `flow money ember sun flo lagoon rose night`. Motifs: `orbs rings ribbon grid burst waves stripes`. `ArtSeed.samples` holds eight fictional demo seeds. Avatars and art are deterministic (no `hashValue`).

**Scores, progress, time**

```swift
ScoreRing(score: Int?, title: String, size: CGFloat = 132, caption: String? = "Checklist score")   // nil score = analysing
FlowdScoreBand.from(score:)   // weak 0-49, okay 50-69, solid 70-84, strong 85-100; title, letter, tone
ProgressRing(progress: Double, size: = 72, lineWidth: = 8, tone: = .accent, label: String? = nil) { centre }   // centre optional
FlowdProgressBar(progress:, tone: = .accent, height: = 8, label: String? = nil)
CountdownLabel(to: Date, style: .compact /.verbose /.clock = .compact, prefix: = "", endedText: = "Done", textStyle: = FlowdFont.figureSm, tone: = .neutral)
FlowdDuration.compact(seconds:) .verbose(seconds:) .clock(seconds:)
```

Scores are CHECKLIST scores: keep the default caption "Checklist score" until the model has settled bounties. A weak band is Ember, never a red flash.

**Feedback**

```swift
EmptyStateView(systemImage:, title:, message: = nil, actionTitle: = nil, tone: = .accent, action: (() -> Void)? = nil)
ErrorStateView(title: = "Something went wrong", message: = nil, retryTitle: = "Try again", retry: () -> Void)
SkeletonView(width: CGFloat? = nil, height: = 16, radius: = FlowdRadius.sm)   SkeletonLines(lines: = 3, lineHeight: = 14)   SkeletonRow()
View.flowdSkeleton(isLoading:)      View.flowdShimmer(active: = true)
ToastCenter (see 1)   View.flowdToastHost(placement: = .top, bottomInset: = 0)
```

**Tab bar:** `FlowdTabItem(id:, title:, systemImage:, selectedSystemImage: = nil, badge: = nil)` (generic over a `Hashable` id), `FlowdTabCenterAction(systemImage:, label:, action:)`, `FlowdTabBar(leading:trailing:selection:center:style:)` and `FlowdTabBar(items:selection:style:)`, `FlowdTabBarStyle` `.full` / `.compact` (icons only; use while scrolling down). The centre action is a solid Flow-gradient disc (AA by construction), the selected marker is a fill, never glass on glass.

### 3.9 Charts (`Charts/`, Swift Charts)

Fixed token palette (azure, ember, lagoon, rose, violet, sun, magenta, green; never cycled), 2 pt lines, 4 pt rounded bar ends, hairline grid, axis text in muted ink, one-line text summary for VoiceOver, a chart/table toggle, selection haptic while scrubbing. Brand dashboards use `.azure`; creator earnings use `.good` (Mint family). Series colour never wears text.

```swift
FlowdAreaChart(title:, points: [FlowdTimePoint], previous: [FlowdTimePoint] = [], previousLabel: = "Previous period",
               format: FlowdValueFormat = .number, tone: FlowdChartTone = .azure, height: = 200, summary: String? = nil, allowsTable: = true)
FlowdBarChart(title:, bars: [FlowdBarDatum], format: = .number, tone: = .azure, orientation: .vertical /.horizontal = .vertical,
              showsValues: = true, height: CGFloat? = nil, summary: = nil, allowsTable: = true)
FlowdFunnelChart(title:, stages: [FlowdFunnelStage], summary: = nil, allowsTable: = true)   FlowdAttributionKey()   // Tracked / Estimated chips
FlowdRetentionChart(title:, points: [FlowdRetentionPoint], benchmark: [FlowdRetentionPoint] = [], hookSecond: = 3,
                    tone: = .violet, height: = 200, summary: = nil, allowsTable: = true)
FlowdSparkline(values: [Double], tone: = .azure, height: = 28, showsArea: = true, showsEndDot: = true, label: String? = nil)
```

Data: `FlowdTimePoint(date:value:)`, `FlowdBarDatum(label:value:isHighlighted: = false)`, `FlowdFunnelStage(label:value:attribution: = .tracked)` (`.tracked` / `.estimated`; CPA pays only on tracked link and code conversions), `FlowdRetentionPoint(second:retained:)` (retained is a 0 to 1 fraction). `FlowdValueFormat`: `.number .compact .moneyCents .moneyCompactCents .percent .seconds` (money values are CENTS). Wrap a chart in a `FlowdCard`. Extras: `FlowdChartFrame` (title, summary, table toggle), `FlowdChartCallout`, `FlowdChartTone`, `FlowdChartStyle`.

### 3.10 Celebration (`Celebration/`)

For creator earned outcomes only. All are silent under Reduce Motion except the haptic and the VoiceOver announcement.

```swift
ConfettiView(trigger: Int = 0, particleCount: = 90, origin: UnitPoint = (0.5, 0.38), duration: = 2.8, colors: = FlowdConfettiPalette.brand, firesOnAppear: = false)
View.flowdConfetti(trigger: Int, origin:, colors:, particleCount:)     // overlay; bump the trigger at the causal moment
FlowdConfettiPalette.brand / .money / .tier(_ level)
PayoutArriveView(amountCents:, methodTitle:, arrivalNote: String? = nil, isArrived: = true, isInstant: = false, includesBackground: = true, onDone: (() -> Void)? = nil)
TierUpView(to: FlowdTierLevel, from: FlowdTierLevel? = nil, perks: [String]? = nil, showsConfetti: = false, includesBackground: = true, onDone: (() -> Void)? = nil)
```

Present them with `.fullScreenCover`. `PayoutArriveView` draws the route, seals it on the success haptic, rolls the amount and fires confetti (weekly or instant payout, arrived or on its way). `TierUpView` closes a progress ring, springs the new medallion in, sweeps the rim once and lists `to.newPerks`; brand rule: rank-up is calm, so no confetti unless you pass `showsConfetti: true` (use for Elite).

---

## 4. Accessibility contract (what the wrappers already do, what you still must)

Already handled: Reduce Transparency and in-app Reduce glass (opaque tinted surfaces), Reduce Motion (aurora static, no sheen, springs become 150 ms fades, shimmer and confetti off), Increase Contrast (1.5 pt rims), Dynamic Type (`ScaledMetric` text, tab bar capped), 44 pt hit targets, VoiceOver labels and traits on every component, money read as "Cleared $62.40", glyph plus word for every status, selection traits, chart summaries and table views, toasts announced to VoiceOver.

You still must: give every icon-only control a label (`FlowdIconButton` requires one), keep copy plain and specific, put text on `FlowdCard`, mark purely decorative images `.accessibilityHidden(true)`, never encode state in colour alone, and keep truncated values reachable.

## 5. Compile-safety rules for feature code (no compiler on the dev machines)

- Use `FlowdCard { ... }` and the DesignSystem names exactly as spelled above; do not guess parameter order. Labelled arguments must appear in declared order.
- `FlowdNavBar`: always label `leading:` / `trailing:`. `ListRow`: with a single trailing closure the closure is the trailing visual when `systemImage:` is given, and the leading visual otherwise.
- `MoneyText(cents:)` takes `Int` cents. `StatTile`, charts and `FlowdValueFormat.moneyCents` also take cents.
- Do not apply `.flowdGlass` to a view that is already inside L2 glass (tab bar, toast, glass button). Use fills.
- Views mutate state only through `@State` / view models; `ToastCenter` and `FlowdHaptics` are main-actor APIs, so call them from view bodies, button actions, `.task` and `@MainActor` view models.
- A `#Preview` using `FlowdToastHost` or `ToastCenter` needs no setup (the environment default is the shared center).
- Keep builders to about ten siblings; split into computed properties or small subviews.
- The widget extension sees only `Tokens.swift` and `Shared/`; none of this folder compiles into it.

## 6. File map

```
DesignSystem/
  Tokens.swift                 generated (npm run sync), never edit
  Theme.swift                  prefs, environment, FlowdAppearance, FlowdTone, flowdRoot
  Typography.swift             role modifiers, FlowdInk, extra FlowdFont styles
  Motion.swift                 FlowdSpring, press style, transitions, reveal, FlowdPhysics
  Haptics.swift                FlowdHapticKind, .flowdHaptic, FlowdHaptics
  DesignGallery.swift          the catalogue (#Preview "Design gallery")
  Glass/                       FlowdGlass (layers), FlowdGlassContainer (+ morph), FlowdGlassButtonStyle, FlowdGlassChrome, AuroraBackground
  Components/                  FlowdButton FlowdCard MoneyText StatTile Pill Chip SegmentedPicker TierBadge AvatarView ArtSeed ThumbArt
                               EmptyStateView SkeletonView ToastCenter ToastHost SectionHeader ListRow ProgressRing ScoreRing
                               CountdownLabel FlowdTabBar FlowdNavBar FlowdScreen
  Charts/                      FlowdChartSupport FlowdAreaChart FlowdBarChart FlowdFunnelChart FlowdSparkline FlowdRetentionChart
  Celebration/                 ConfettiView PayoutArriveView TierUpView
```

## 7. Not verified here

Nothing in this folder has been compiled or run. What was done instead: every file was re-read as the compiler would, and three scripts checked every `FlowdColor / FlowdSpacing / FlowdRadius / FlowdMotion / FlowdFont / FlowdChart ...` reference against the real `Tokens.swift` declarations, every call-site argument label and order of every DesignSystem initialiser and `flowd…` modifier against its declaration (72 initialisers, 35 modifiers, zero mismatches), implicit enum members (`variant: .x`, `tone: .x`, `.flowdBody(.x)` ...) against their enums, duplicate type names, and bracket balance.

Specifically unverified until the macOS CI job and a device check: iOS 26 glass morphing and interactive behaviour (Menu and rotation edge cases), whether a hidden system tab bar reserves no space on iOS 26 (`flowdHideSystemTabBar()` plus `flowdBottomBar`), Swift Charts axis and annotation overflow behaviour (`chartXSelection`, `AnnotationOverflowResolution`), the Elite medallion ring and aurora drift performance on device, haptic timing, and the exact tint colour iOS 26 produces for tinted glass. The iOS 26 Clear / Tinted system setting has no readable API, so L2 glass opacity is never assumed in custom layouts. Pure logic (`FlowdMoneyFormat`, `FlowdNumberFormat`, `FlowdDuration`, `FlowdDelta`, `FlowdScoreBand`, `ArtSeed` decoding, `FlowdRetentionChart.retained`, `FlowdPhysics`) has no unit tests yet; `FlowdTests/DesignSystemTests.swift` is the suggested home.
