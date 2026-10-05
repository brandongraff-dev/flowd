# flowd iOS: canonical screen map (v1, finalised)

Creator app, SwiftUI, iOS 17+ (Liquid Glass on iOS 26). Bundle id `app.flowd.creator`. Demo creator: **Maya** (`@maya.makes`, Gold). Features (`F-nnn`) are defined in `docs/PRODUCT_SPEC.md` §4; the web counterparts are in `docs/ROUTES.md`. Read `docs/CONVENTIONS.md` §5 and `apps/ios/STRUCTURE.md` first.

## 0. Shell and navigation

A floating glass **tab bar** with 5 slots: **Home · Bounties · Studio (centre action, full-screen cover) · Wallet · Profile**. Routing goes through `Router` (typed `Route` enum, one `NavigationPath` per tab). Sheets are L3 glass; content cards are L1 quiet glass; glass never sits on glass.

**`Route` cases** (owned by `ios-core`, additive edits only): `bounty(id)`, `brandScorecard(brandId)`, `submission(id)`, `post(id)`, `viewLedger(postId)`, `dispute(postId)`, `payout(id)`, `moneyClock`, `tiers`, `tax`, `rights`, `safety`, `wellbeing`, `flo(context)`, `lesson(slug)`, `tournament(id)`, `crew`, `referrals`, `remix`, `spec(id)`, `auction(id)`, `storefront`, `settings(section)`.

**Deep links**: `flowd://bounty/<id>`, `flowd://payout/<id>`, `flowd://submission/<id>`, `flowd://post/<id>`, `flowd://drop`, `flowd://scorecard/<brandId>`, `flowd://lesson/<slug>`, `flowd://tournament/<id>`; universal links `joinflowd.io/b/<id>` and `joinflowd.io/c/<handle>`.

**Personas (modes), added after the first review.** The app has three demo personas, switchable from Profile > Account and by launch argument: **Creator** (default; Maya, the native creator app described below), **Brand** (Jordan Ellis, the Lumi workspace: a mobile companion for app teams, section 10) and **Admin** (Ops: the platform console on a phone, section 11). Each persona has its own floating tab bar. Creator = Home / Bounties / Studio / Wallet / Profile; Brand = Overview / Review / Bounties / Insights / Wallet; Admin = Control / Queues / Money / Market / More. `AppState.persona` selects the shell; `RootView` swaps the tab bar with a matched glass morph; the Creator shell stays the default so the existing screens are untouched.

**Launch arguments (automated screenshots and demos; owner `ios-core`, file `App/LaunchOptions.swift`).** `-FlowdDemo YES` skips onboarding and signs in as the demo user of the persona; `-FlowdPersona creator|brand|admin`; `-FlowdScreen <key>` opens a screen directly (keys live in `apps/ios/Scripts/screenshot-screens.txt`; unknown keys fall back to the persona's home); `-FlowdAppearance dark|light`; `-FlowdReduceGlass YES`. The GitHub Actions workflow `ios-screenshots.yml` launches the simulator with these arguments, so every screen that should be screenshotted needs a stable key (`creator-home`, `creator-bounties`, `creator-bounty-detail`, `creator-studio-capture`, `creator-hook-score`, `creator-wallet`, `creator-earnings-card`, `creator-leaderboard`, `creator-profile`, `brand-overview`, `brand-review`, `brand-bounty-detail`, `brand-insights`, `brand-wallet`, `admin-control`, `admin-queues`, `admin-fraud-case`, `admin-payouts`, `admin-market`, `design-gallery`).

**Shared views** (owned by `ios-core`, in `DesignSystem/Components`; feature areas wrap them in their own sheets and screens): `MoneyFigure` (hero and column variants, numericText), `MoneyStateChip` (pending lagoon + clock, cleared mint + check, paid neutral + bank, held rose-soft + pause), `ClearsAtLabel`, `FundedBadge`, `TierBadge` (medallion with chevrons), `ScoreBandView` (band, timecoded reasons, one-tap fix slot, "Checklist score" label), `RightsCardView`, `BrandScorecardView`, `SLACountdownChip` (neutral, amber at 48 h, rose at 72 h), `ConfidenceChip` (Tracked / Estimated), `CelebrationEmitter`, `SkeletonShimmer`, `EmptyStateView`, `ErrorStateView`.

**Folders** are `Flowd/Features/<Area>/`. Existing folders: Onboarding, Home, Bounties, Studio, Wallet, Profile, Leaderboard, Crews, Tournaments, Inbox, RateCard, Earnings, Academy, Tools, Settings. Each agent may add folders for its own screens only: `Flo`, `Safety`, `Rights`, `Referrals`, `Specs`, `Auctions`, `Remix`, `Submissions`, `Studio/Capture`, `Studio/Edit`.

---

## 1. App shell. Owner: `ios-core` (also owns `App/`, `DesignSystem/`, `Core/`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Auth gate & splash | Launch root (`RootView`) | Mark draw-on (600 ms, fade under reduced motion); session restore; first-run vs returning routing with no flash of the wrong tab; fixture-load failure state with retry | F-133 |
| Tab shell | `TabShell` | 5-slot floating glass bar with centre Studio action; scroll-minimise on iOS 26 with an iOS 17 fallback; Inbox count badge; Ember "Drop live" dot only when inventory is real; Wallet dot when something clears; "Continue draft" accessory; per-tab path; re-tap scrolls to top | F-133 |
| Deep-link router | App-level handler | All schemes above and universal links; auth-gated; notification taps; unknown link shows a calm toast | F-107 |
| Celebration & toast host | Overlay host | Celebrations only for earned outcomes (cleared money, approvals, tier-ups, streak milestones): mint bloom plus haptic; calm toasts for autosave and offline queue; rejection renders as a calm card with next step; never celebrates spending or funding; reduced motion becomes a fade and Mint wash | F-001, F-091 |
| Offline & sync banner | Top banner | Upload and mutation queue with per-item states; "Everything you made is saved. We'll sync when you're back."; retry | F-084 |
| Error & maintenance sheet | Shared states | Shimmering skeletons, designed empty and error views, maintenance with status link, forced-update gate | F-131 |

## 2. Onboarding. Owner: `ios-onboarding-profile` (`Features/Onboarding`)
First-Dollar Path: value before signup, no bank, tax or ID before the first approval.
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Intro | First-run full screen | Aurora hero with the mark; "Money follows what works."; Get started / I have an account; static under reduced motion | F-073 |
| Earnings preview | Step 1 | Pick a niche; median payout (30 d) with p25–p75 and a top example in the same size class; a sample bounty (Funded, rate, cap); "Results vary" note; skip | F-121, F-019 |
| Sign in with Apple | Step 2 (mock sheet) | Privacy line; no bank or tax asked; cancel and failure states | F-133 |
| Niches & style | Step 3 | Pick three niches; style (face, faceless, screen recording) which drives format ranking; skip | F-073 |
| Link accounts | Step 4 (mock OAuth sheets) | TikTok and Instagram; what we read (views) and never do (post for you); skippable "link later"; connected and error states | F-077 |
| Age & agreement | Step 5 | 18+ confirmation (ID later); Creator Agreement key terms (licence tiers, clawbacks for fraud only, originality, no burner accounts) with full-text links; accept | F-073, F-132 |
| First-Dollar Path | Step 6 | Starter bounty card (flowd-funded, flat $5, low competition); 72 h timeline (submit → decision within 24 h → cleared within 48 h of approval); "Approval isn't guaranteed; your video must meet the brief"; Ember "Make a take" opens Studio pre-loaded | F-073 |
| Permission primers | Contextual sheets | Camera and mic ("to record in the app"), speech ("captions and teleprompter pacing"), notifications ("Know the minute you're paid", shown after the first submission); one-line why each; denied path keeps working | F-073 |
| First-Dollar tracker | Home card and detail | Four steps with ETAs (scored take, submitted, approved, cleared); "Cleared by Tue 2:00 PM"; resumes drafts; retires after the first cleared dollar | F-073 |

## 3. Profile and settings. Owner: `ios-onboarding-profile` (`Features/Profile`, `Features/Settings`, `Features/Safety`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Profile | Tab root | Tier ring with progress; badges; verified stats (posts, approval rate, reliability with reasons); storefront preview and share link `joinflowd.io/c/<handle>`; Earnings Card shortcut; Account Health chip | F-076, F-008, F-091 |
| Edit profile & portfolio | Push | Handle, bio, niches, up to five portfolio videos (picker), apps promoted (auto), live preview, validation | F-076 |
| Tiers | Push | Bronze → Elite ladder; per-requirement progress ($ cleared, approved posts, approval %, reliability) and what is missing; perks (head start 1 / 3 / 6 / 12 h, rate card, crews, auctions, featured profile); "No drop for 30 days after a dip"; tier history; medallion art | F-091 |
| Linked accounts | Push | Per account: status, last view sync, health; reconnect; disconnect; "flowd never posts for you" | F-077 |
| Account Health | Push | Originality check history (duplicate, watermark, subtitle-only); per-account safety with icon and label; TikTok and Meta unoriginal-content rules in plain words; burner-account rule; how to fix; appeal link | F-017, F-018 |
| ID verification | Sheet (just-in-time) | States not started, processing, verified, failed with reason; why now ("before your first payout"); 18+ check; human fallback; never blocks silently | F-031 |
| Settings | Push hub | Account, Payouts, Notifications, Appearance, Privacy and data, Wellbeing, Safety, Legal, Help; version; "Demo data" indicator; sign out | F-134 |
| Notification preferences | Push | Categories (money, reviews, Drop, offers, tournaments, tips); quiet hours default 10 pm–8 am; batching of non-cash items; one Daily Drop reminder toggle; system permission state | F-107, F-020 |
| Appearance | Push | Theme (system, dark, light); Reduce glass (mirrors the system setting, with an in-app override); reduce motion mirror; haptics toggle; app icon variant (default, dark, tinted) | F-134 |
| Privacy & data | Push | AI-training opt-in (off by default); data export; delete account with confirmation; connected-token disclosure; analytics opt-out | F-134 |
| Wellbeing mode | Push | Master toggle; quiet hours; numbers-off schedule (hides live views and earnings); opt-in pace setting that never affects tier; Pause preserving tier and streak; rest weeks; leaderboard opt-out; worst-month and set-aside view; resources (988 in the US, Creators 4 Mental Health) | F-020 |
| Safety center | Push | Scam Shield rules ("flowd never asks you to pay", in-app chat only, what Funded means); how-to-spot examples; my reports and status; report entry; contact support | F-016 |
| Legal & disclosures | Push | In-app readers for creator agreement, privacy, earnings disclosure (median methodology), usage rights, community rules; version and date; "Draft · not legal advice" | F-132 |
| Help & support | Push | Search help; contact human support with named SLA; status link; send logs; report a problem | F-131 |
| Founding badge | Push (founders only) | Badge detail; perks with expiry dates (tier head start, free instant payouts for 12 months); share | F-108 |

## 4. Home, bounties and inbox. Owner: `ios-home-bounties`
### 4a. Home (`Features/Home`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Home | Tab root | Greeting; earnings card (Cleared mint + check, Pending lagoon + clock with next clears-at; Live Activity toggle); Daily Drop card (the single Ember element); streak flame with freeze ready; Continue draft; matched bounties carousel; What to post today; First-Dollar tracker; Flo entry; Academy nudge; activity; pull-to-refresh; honours numbers-off | F-001, F-088, F-089, F-073, F-098 |
| Daily Drop | Push from Home | Three states: pre-drop (countdown to 16:00 UTC, notify opt-in), live (cards rise with 40 ms stagger; true spots left per bounty; claim with queue position), sold out (next drop time); tier head-start note; claim success; no fake scarcity | F-088 |
| Streak & Flow Week | Push | Weekly streak count; this week's status (post at least once per ISO week); banked freezes (earned 1 per 4 weeks, max 2); rest-week toggle; week-by-week history; milestone moments; calm copy, no guilt | F-089 |
| What to post today | Push / card | Trend-radar cards (rising formats, hook of the day) matched to niche; "Make it" and "Remix this"; "gets smarter as bounties settle" note | F-101 |
| Activity | Push | Chronological approvals, cleared money, offers, tier changes with filters; each links to its detail; empty state | F-107 |

### 4b. Bounties and offers (`Features/Bounties`, `Features/RateCard`; the Rights Card, Pay Math and Scorecard sheets live in `Features/Bounties`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Bounty feed | Tab root | Ranked by match; card with brand glyph and Scorecard dot, rate and CPA, cap, Funded badge, budget bar, spots, "decides in about 11 h", expected earnings (median), Rights chip, tier lock; search; saved toggle; pull-to-refresh; empty state ("Nothing matches yet. Widen your niches, or check back when the Daily Drop lands."); CPM, CPA and install-only badges; flowd "content-about-us" bounty pinned for new creators | F-074, F-002, F-023, F-024, F-130 |
| Filters & sort | Sheet | Pay structure (CPM, CPA, stacked, direct), platform, niche, rights (organic only or paid ok), minimum rate, tier-gated, decision speed; sort by match, pay, ending soon, newest | F-074 |
| Saved & claimed | Push | Saved bounties; claimed spots with expiry timers; active submissions shortcut; ended | F-075 |
| Bounty detail | Push | Header art; rate (e.g., $2.10 per 1,000 + $1.50 per trial); cap; budget bar; Funded badge; deadline; "Decides in about 11 h"; typical earnings range; brief TL;DR by Flo; must-say beats; do / don't; examples; Rights Card and Scorecard entries; Scam Shield cues and report; sticky glass "Make it"; states tier-locked (unlock path), closed, claimed | F-075, F-002, F-003 |
| Rights Card | Sheet | Organic (always), paid-ad usage and term (default 90 days), whitelisting, Spark and partnership, exclusivity, AI likeness (off), renewal price (25% of base fee per 30 days), platforms; "What this means for you" summary; snapshotted at submit | F-011 |
| Pay Math | Sheet | p25 / median / p75 pay per video for this bounty; CPM part and CPA part; cap; "typical creators earn $62 here (30 days)" with the top example in the same size class; "checklist estimate; results vary"; assumptions | F-014, F-019 |
| Brand Scorecard | Sheet / push | Pay speed, decision time, approval fairness, approved-work-run %, reliability 0–100; sample size and period; trend; recent bounties; "New brand" state; report brand | F-007 |
| Offers inbox | Push | Direct offers (brand glyph, amount, deliverables, expiry) with status chips; empty state pointing to the rate card; inline scam warnings | F-060 |
| Offer detail | Push | Terms; Rights Card; Pay Math; Brand Scorecard; thread preview; Accept / Counter / Decline; Funded indicator | F-060, F-011 |
| Counter sheet | Sheet | Adjust price, deliverables, rights add-ons with a market-suggested band; message; shows what changes; send | F-060 |
| Rate card editor | Push | Price per video; minimum CPM; rights days and paid-usage add-ons; deliverables; availability; market-suggested price with p25–p75; Silver+ gating message; preview as brands see it | F-103 |
| Scam report | Sheet | Type chips (asked me to pay, fake brand, burner account, off-platform contact, other); evidence attach; description; submit returns case id and SLA; block brand | F-016 |

### 4c. Inbox and Flo (`Features/Inbox`, `Features/Flo`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Inbox | Push from Home | Tabs Money, Reviews (decisions with timecoded feedback summary), Offers, Updates; unread; swipe actions; "batched to protect your quiet hours" label; empty state | F-107 |
| Thread | Push | Structured thread tied to a submission or offer: messages and system events (decision, revision, counter); in-app-only banner; rate-limit notice; report; link back to context | F-107, F-016 |
| Flo | Push / sheet from Studio | Streaming typewriter chat; chips (Write 3 scripts, Rewrite my hook, TL;DR this brief, Caption ideas); context from bounty and format; "checklist-based, can be wrong" note; send to Studio; history; works offline with cached templates | F-098 |

## 5. Studio capture. Owner: `ios-studio-capture` (`Features/Studio/Capture`)
Full-screen cover from the centre tab or "Make it". Glass only on controls.
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Studio launcher | Cover root | Continue draft; pick a claimed or saved bounty, or free practice; suggested formats; last scores; permission status chip; close | F-078 |
| Brief panel | Overlay / sheet | Brief TL;DR; checkable must-say beats; do / don't; brand assets and screen recordings; Rights chip; deadline; collapsible during capture | F-078, F-070 |
| Format picker | Step | 11 formats ranked for this bounty (labelled checklist); beat structure preview; duration; difficulty; faceless badge | F-079 |
| Script | Step | Three AI scripts (Flo mock) for the format; own-script editor; word count and duration at 150 wpm; hook choice; regenerate; loads the teleprompter | F-079, F-098 |
| Hook library | Sheet | 10+ fill-in hooks by type (confession, curiosity gap, specific number, POV, direct question, risk reversal, pattern interrupt) pre-filled with the app's name and features; favourite; use | F-079 |
| Capture | Full screen | AVFoundation 1080×1920 at 30 fps; teleprompter beside the lens (150 wpm default; current line full opacity, past lines 35%); live shot checklist with haptic ticks; safe-zone guides; 3-2-1 countdown; flip; segments; retake last; record ring morph; controls fade after 2 s; interruption autosaves a draft | F-078 |
| Teleprompter settings | Sheet | Speed (wpm), size, mirror, voice-paced toggle (Speech), position near the lens, opacity; live preview | F-078 |
| Hook coach | Step | On-device Vision checks of the first 3 seconds (face, hook text on screen within 1 s, motion, app visible); filmstrip with timecoded ticks and crosses; band plus reasons; Retake / Continue; works offline; "Checklist score" label | F-080, F-081 |
| Permission recovery | Full-screen state | Denied camera, mic or speech: explanation, Settings deep link, alternative (import from camera roll); no dead end | F-078 |
| Take review | Step | Playback of takes and segments; keep, retake, trim; "Take saved" autosave; continue to Edit | F-078, F-084 |

## 6. Studio edit, submit and submissions. Owner: `ios-studio-edit` (`Features/Studio/Edit`, `Features/Submissions`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Edit | Cover step | Timeline (AVMutableComposition): trim, split, reorder; text overlays; music from approved or commercial library only (badge); preview; undo; export presets; autosave | F-082 |
| Captions | Step | On-device auto-captions (Speech); styles; TikTok / Reels safe-zone placement; edit text; word highlight; language | F-082 |
| Silence & filler cut | Step | Detected pauses and filler words; preview cuts; one-tap apply and undo; amount removed ("−4.2 s") | F-082 |
| Screen overlay | Step | Import a screen recording or brand demo clip; picture-in-picture or green-screen; position and size; sync; brand assets | F-082, F-070 |
| Score | Step | Hook Score ring and Flow Score band with timecoded reasons; brief check ("beats found 4 of 5"); QA flags; one-tap fixes ("Move app reveal up"); band chip updates after a fix; "Checklist score: gets smarter as bounties settle"; Retake / Continue | F-081, F-083 |
| Pre-flight | Step | Disclosure (audio and on-screen), caption carries `#ad` and brand tag, music licence flag, banned claims, AI-content flag, 9:16 and length, safe zones; blocking vs warning states with fix actions; audit snapshot | F-050, F-017, F-083 |
| Variants builder | Step (v2) | Record 3–5 hooks, 1 body, 2 CTAs → up to 10 videos; matrix preview; per-variant score; choose which to submit | F-086 |
| Submit | Step | Summary (thumbnail, bounty, Rights Card accept, reserved amount, decide-by ETA "Lumi decides by Fri 2:00 PM"); resumable background upload with progress; offline queue; "Cleared by <date>" on the starter bounty; thumbnail flies to the brand avatar | F-087, F-003, F-084 |
| Post | After approval | Locked `#ad` plus brand-tag caption; tracking link and pool code (copy); why disclosure is locked; share to TikTok and Instagram; attach post URL; 72 h views-window timer | F-087, F-083, F-041, F-042 |
| Drafts | Push | SwiftData drafts: thumbnail, bounty, stage (recorded, edited, scored), size, last edited; resume; delete; storage warning | F-084 |
| Import | Sheet | Camera roll or CapCut export via PhotosUI; validates 9:16 and length; goes to Score; "edit in CapCut, then import" hint | F-085 |
| Submissions | Push from Home and Wallet | List with status chips (In review with decide-by, Revise, Approved, Rejected, Withdrawn), reserved amount, SLA countdown, filters, pull-to-refresh | F-004 |
| Submission detail | Push | Player; status timeline; decision with reason code and evidence; timecoded comments (must-fix vs suggestion) on the scrubber; version history; rounds left (2 free); actions Revise / Appeal / Post | F-004, F-005 |
| Revise | Push | Checklist of must-fix comments to tick; replace or re-edit → Score → resubmit as v2 with a v1 diff; rounds left; "extra rounds are paid by the brand" | F-005 |
| Appeal | Sheet | One per rejection; reason; evidence with timecodes; what happens next (human reply within 48 h, proposed); read-only after submit | F-006 |

## 7. Wallet, earnings and widgets. Owner: `ios-wallet-widgets` (`Features/Wallet`, `Features/Earnings`, `Features/Rights`, `FlowdWidgets`, `Shared`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Wallet | Tab root | Money Clock hero: Cleared (mint, check) and Pending (lagoon, clock, "next clears Sat 2:00 PM") side by side, never summed; Paid-out total; earnings chart; per-post list; Cash out with a secondary line ("Free · Fri 2:00 PM" or "Instant · $2.40 fee"); empty state "Your first payout lands here"; honours numbers-off | F-001, F-028, F-029 |
| Money Clock | Push | Per-row timeline: posted → window closes → fraud check → cleared → payout, each timestamped; named delay reasons (`fraud_review`, `awaiting_tax_info`, `dispute_open`) with the next action; Pending → Cleared shared-element animation | F-001, F-026 |
| Earnings | Push | Day, week, month chart (Swift Charts); by brand and bounty; gross vs net; median overlay; table alternative for accessibility; link to Tax Desk CSV | F-019, F-001 |
| Posts | Push | Live posts with views, installs, trials, earnings, state chip, clears-at; filter; pull-to-refresh; empty | F-087 |
| Post detail | Push | Views, installs, trials; retention curve (Swift Charts) with drop points; earnings timeline; conversions with source labels (link, code); Rights status; per-video cap progress and any clawback or removal effect; links to View Ledger, Earnings Card, Dispute | F-106, F-009, F-027 |
| View Ledger | Push | Hourly snapshots (list and chart); source (platform API or screenshot proof); traffic-source split; verified vs excluded views with plain-language cause (`bot_pattern`, `cap_clustering`, `duplicate`, `geo_outlier`, `removed_post`); Dispute CTA | F-009 |
| Dispute | Sheet | Snapshot range, reason chips, note; ledger evidence attached; status open → in review → resolved with SLA; outcome with reasons; "doesn't block undisputed money" note | F-010 |
| Payouts | Push | Weekly Fri 18:00 UTC free; upcoming estimate; history (in transit → arrived with dates); proof links; failure with reason and retry; method summary | F-028 |
| Instant cash-out | Sheet | Amount up to cleared; fee preview (1.5%, min $0.50, max $15) and net before confirm; free allowance (Gold ×1/week, Platinum+ unlimited, Founding); blocked states named (awaiting ID, tax); success celebration | F-029 |
| Payout methods | Push | Stripe-style web sheet (mock) to add bank or debit; status; default; verification; remove; security note | F-030 |
| Tax Desk | Push | W-9 status chip; YTD cleared and paid; 1099-NEC threshold progress ($2,000 for 2026 payments); set-aside estimate with adjustable %; CSV export (share); gifting-is-taxable note; "not tax advice"; Academy lesson link | F-015 |
| W-9 flow | Sheet (just-in-time) | Form (name, business type, masked TIN, address, e-sign) mock; shown at first approval; save progress; errors; resulting status | F-015 |
| Rights & renewals | Push | Licences on my posts (brand, usage, start, end, platform, status); renewal offers (25% of base fee per 30 days; accept / decline); expiry alerts; Spark access status; AI likeness off | F-012, F-058 |
| Earnings Card | Sheet / share | 9:16 and 1:1 (ImageRenderer): gradient, tier badge, amount, period, delta, post count, **tier median line**, proof link and QR; Hide amounts; ShareLink; revoke proof | F-095 |
| Wrapped | Full screen | 8–10 segmented stories (earnings, best post, winning hook, streak, tier, typical line); hold to pause; tap to advance; share card; month and year | F-096 |
| Live Activity | Lock Screen and Dynamic Island | Live post: views, pending $, delta, "clears Sat 2:00 PM", window progress; end state "Cleared $38.20" for 4 h; `numericText`; no per-update haptic; paused and hold states | F-097 |
| Widgets | Home Screen (small, medium) | Pending vs Cleared with next clears-at; Daily Drop countdown and spots; numbers-off redaction; deep links | F-097 |

## 8. Compete and grow. Owner: `ios-compete-grow` (`Features/Leaderboard`, `Crews`, `Tournaments`, `Academy`, `Tools`, `Referrals`, `Specs`, `Auctions`, `Remix`)
| Screen | Presented as | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| Leaderboard | Push from Home and Profile | Peer cohort (about 30, by tier and niche) with promotion line, your row and rank-delta chips; week-reset timer; Cohort / Global tabs; niche filter; private mode; unranked state "Earn your first $1" | F-090 |
| Tournaments | Push | Live, upcoming, past; prize pool; entry status; countdown; enter | F-092 |
| Tournament detail | Push | Bracket (rounds, matchups); your entry (submit a hook); standings; schedule; rules; results; share | F-092 |
| Crew | Push | Members; crew bonus meter; activity; invite; leave; empty state linking to discover | F-093 |
| Crew leaderboard | Push | Crews ranked weekly; your crew's position; contribution per member | F-093 |
| Crew discover & invite | Push | Browse and search crews; create a crew (Gold+ lead); invite link; join; rules | F-093 |
| Referrals | Push | Link and code; invites sent and accepted; ranked position; reward rules (single-level, capped, funded by flowd); referral earnings window; share sheet; FTC-safe copy | F-094 |
| Academy | Push | Lessons grid (ten core); progress; badges; tier boosts; "free, never required" | F-099 |
| Lesson | Push | 5-minute cards, three-question quiz, badge award, next lesson; offline cache | F-099 |
| Badges | Push | Earned and locked grid; criteria; share | F-099 |
| Remix library | Push | Formats and hooks; "Remix this" opens Studio pre-loaded; filters; Trend radar tab; "why it won" cards | F-100, F-101 |
| Hook Score tool | Push | Free tool: type a hook or pick a clip; band and reasons; clip checks run on-device; share; "Checklist score" label | F-119, F-081 |
| Spec library | Push | My specs (status, band, licensed or not); licence earnings; empty state with upload CTA | F-104 |
| Spec upload | Push | Pick video → Score → price and rights → publish to Spec Market; AI likeness off; terms | F-104 |
| Auctions | Push (Platinum+) | My auction slots; create windows; incoming sealed-bid count; closes at; locked state with unlock path | F-105 |
| Auction detail | Push | Slot detail; reveal at close; second-price clearing result; history | F-105 |
| Storefront | Push | Link-in-bio editor and preview (`joinflowd.io/c/<handle>`): theme, bio, apps promoted, verified stats, rate card CTA, "Earn with flowd" footer; copy and share QR | F-102 |

---

## 9. Screen-level requirements (all agents)
- Every screen: loading skeleton, empty state, error state, pull-to-refresh where lists load, haptics on commits (iOS only; web has none), VoiceOver labels, Dynamic Type up to XXXL (layouts reflow), reduce-motion and reduce-transparency fallbacks via DesignSystem.
- **Money**: big, tabular (`.monospacedDigit()` / SF Pro Rounded), Mint when positive and earned; pending vs cleared always visually distinct, with a glyph as well as colour; every earning row carries a dated ETA and, when delayed, a named reason. A bare "pending" is a bug.
- **Scores** always show a band, timecoded reasons and the "Checklist score" label; never a bare number.
- **Wellbeing**: numbers-off, quiet hours and Pause are read from `AppState` by every screen that shows live money or views.
- Data comes from `FlowdAPI` only (never from fixtures directly); mutations go through the API protocol so the whole flow works against `MockFlowdAPI`. Analytics through the `Analytics` wrapper using the events in `PRODUCT_SPEC.md` §10.
- Every `View` file ends with a `#Preview` using `PreviewData` (fixture-backed), plus a second preview (dark or empty state) where it matters.
- Celebrations only for creator-earned outcomes; funding, bidding, rejection and spending get calm treatments.

---

## 10. Brand mode (mobile companion for app teams). Owner: `ios-brand-mode` (`Features/BrandMode`)
Persona: Jordan Ellis, growth lead at Lumi (workspace `br_lumi`). Everything runs against `MockFlowdAPI` and the same fixtures as the web brand dashboard. Calm confirmations only (no confetti) for funding, approving and spending.
| Screen | Presented as | Must show (data · interactions) |
|---|---|---|
| Overview | Tab 1 | Spend pacing vs budget; KPI row (views, installs, trials, paid, cost per trial) with tracked-vs-estimated chips; mini funnel; "Needs you" list (reviews waiting with SLA clocks, expiring rights, fatigue alerts); escrow balance chip; next best action |
| Review queue | Tab 2 | Swipeable cards ranked by score and QA flags; approve / request changes (timecoded note, reason code) / reject (reason code mandatory); SLA countdown chips; auto-approve rule status and dry-run summary |
| Review detail | Push | Video (ThumbArt player stand-in), Hook Score and Flow Score with timecoded reasons, QA flags, fraud evidence (view curve, audience %, duplicate hash), creator scorecard, decision bar |
| Bounties | Tab 3 | List by status with Funded badge and budget bar; detail with pace chart, submissions, top creators, rights card, edit caps, pause / extend |
| Insights | Tab 4 | Money Map: funnel with tracked vs estimated, creative leaderboard, hook lab summary, Funnel Doctor top fix with expected-impact range, budget optimizer suggestion (final list follows `docs/research/analytics-spec.md`) |
| Creators | Push from Bounties | Discover and scorecards, rehire list, send direct offer |
| Wallet | Tab 5 | Escrow balance, fund (calm sheet, card mock), ledger, invoices, auto top-up |
| Notifications and settings | Push | Approvals, SLA, rights expiries, digest preferences, persona switch |

## 11. Admin mode (platform console on a phone). Owner: `ios-admin-mode` (`Features/AdminMode`)
Persona: Ops. Mirrors the web `/admin/*` area. Destructive actions (ban, clawback) use a confirm sheet; every decision writes the audit log.
| Screen | Presented as | Must show (data · interactions) |
|---|---|---|
| Control tower | Tab 1 | 90-day targets vs actuals (median time to first dollar, fill within 48 h, second-bounty rate, repeat creators, invites per creator, creators per bounty), market health, live alerts; demo clock control |
| Queues hub | Tab 2 | Fraud, disputes, verification, payouts with counts, oldest-item age and SLA colour |
| Fraud case | Push | View curve with anomaly markers, signal list with weights, account history, hold / clear / ban actions |
| Dispute | Push | Evidence timeline, both sides, decision with reason code, message composer, human-reply SLA (48 h) |
| Verification | Push | ID review card, risk signals, approve / request more |
| Payout approvals | Tab 3 | Weekly batch with risk flags, approve all or per item, instant cash-out requests |
| Market health | Tab 4 | Fill rate, clearing CPMs by category with bands, supply vs demand, active creators per live bounty |
| ML calibration | Push | Score drift, band calibration chart, shadow-model comparison |
| Lookup and audit log | Tab 5 | Creator / brand search, scorecards, audit log, settings |
