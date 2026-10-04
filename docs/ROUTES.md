# flowd web: canonical route map (v1, finalised)

Every internal `<Link>` in `apps/web` must point to a route listed here. If you add a route, add it to this table (own area only) and say so in your report. `[x]` = dynamic segment. Demo personas: brand = **Jordan** at **Lumi** (workspace `br_lumi`), creator = **@maya.makes** (`cr_maya`), admin = **Sam** (ops). Features (`F-nnn`) are defined in `docs/PRODUCT_SPEC.md` §4; the iOS counterparts are in `docs/SCREENS.md`.

## 0. How to read and use this file

1. **"Must show" is the minimum bar.** A page missing a listed item is incomplete; extras are welcome. It lists the key data and the key interactions, so builders cannot under-build. Copy and numbers must be realistic and consistent with fixtures; money formatted at the edge only (`formatMoney`).
2. **One owner per route.** Each section names its owner agent. Do not edit another agent's route folder; make the smallest additive change with `Edit` and list it under `touchedShared`.
3. **Guards.** `/brand/*` needs role `brand_member`, `/creator/*` and `/onboarding/creator` need `creator`, `/admin/*` needs `admin`; everything else is public. A wrong role redirects to `/login?next=<path>`. `/login` redirects by role to `/brand`, `/creator` or `/admin`.
4. **Params.** `[id]` follows `DOMAIN.md` prefixes (`bnty_`, `sub_`, `post_`, `br_`, `cr_`, `app_`, `tour_`, `pay_`); `[handle]` is a creator handle without `@`; `[slug]` an audit slug; `[code]` a tracking code; `[lesson]` a lesson slug.
5. **State in the URL.** Views with filters or tabs use `?tab=`, `?range=7d|30d|90d`, `?app=`, `?q=`, `?filter=` so they are linkable. Dynamic routes have a designed not-found state. Every route group with data has `loading.tsx` and `error.tsx`; every page exports `metadata`.
6. **Honesty affordances** (all areas): a subtle "Demo data" tag where data is simulated; "Checklist score" label on every Hook/Flow Score; Tracked vs Estimated chips on every conversion figure; median beside any top-earner figure.
7. **Redirects.** `/signup/brand` → `/brand/onboarding`; `/signup/creator` → `/onboarding/creator`; `/brand/onboarding` on completion → `/brand/bounties/new`; `/onboarding/creator` on completion → `/creator`. (`/onboarding/brand` from the draft is removed.)

### Directory ownership (prevents file collisions)
| Agent | Route folders | Feature components |
|---|---|---|
| `web-marketing-home` | `(marketing)/layout.tsx` + `/`, `creators`, `brands`, `pricing`, `promise`, `studio`, `compare`, `waitlist`, `founding-creators` | `components/features/marketing/home` |
| `web-marketing-pages` | `(marketing)/{market,leaderboard,formats,security,trust,about,partners,developers,campus,changelog,help,status,app}`, all of `(auth)` | `components/features/marketing/pages`, `components/features/auth` |
| `web-tools-public` | `(tools)`, `(public)`, `(marketing)/legal`, route handler `src/app/og/[kind]/[id]/route.tsx` | `components/features/{tools,public,legal}` |
| `web-brand-core` | `brand/layout.tsx` (shell), `brand/page.tsx`, `onboarding`, `apps`, `bounties`, `wallet` | `components/features/brand/core`, `components/shell/brand*` |
| `web-brand-review` | `brand/{review,analytics,library,tests,promote,rights,compliance,disputes,scorecard}` | `components/features/brand/review` |
| `web-brand-market` | `brand/{creators,offers,market,auctions,specs,attribution,integrations,team,agency,developers,settings}` | `components/features/brand/market` |
| `web-creator-core` | `creator/layout.tsx` (shell), `creator/{page,feed,bounties,brands,studio,submissions,posts,wallet,tax,settings}`, and `src/app/onboarding/creator` (no route group, so it does not collide with `(auth)`) | `components/features/creator/core`, `components/shell/creator*` |
| `web-creator-social` | `creator/{rate-card,inbox,leaderboard,tiers,crews,tournaments,academy,remix,referrals,profile,specs,auctions,wrapped,safety,wellbeing,flo,rights}` | `components/features/creator/social` |
| `web-admin-api` | `admin/**`, `api/v1/**`, server-side adapters that call `src/lib/engine` | `components/features/admin` |

### Load balance (130 routes: 129 pages and one route handler, plus 19 API groups)
| Agent | Routes | Weight note |
|---|---|---|
| `web-marketing-home` | 9 | Flagship pages plus the marketing shell and hero art; `/` and `/pricing` are the heaviest |
| `web-marketing-pages` | 20 | 14 content pages (live `/market`, `/trust`) plus 6 auth pages |
| `web-tools-public` | 22 | 8 tools, 7 public pages (storefront, proof, OG handler), 7 templated legal pages |
| `web-brand-core` | 9 + shell | Shell plus the AI bounty builder, the biggest single page in the app |
| `web-brand-review` | 11 | Review queue and focus mode are the most interaction-dense screens |
| `web-brand-market` | 13 | Mostly list, table and form pages that share components |
| `web-creator-core` | 13 + shell | The money path: onboarding, feed, detail, Studio-lite, submissions, posts, wallet, tax |
| `web-creator-social` | 19 | Smaller pages that share cards, rows and rings |
| `web-admin-api` | 14 + API | 14 admin pages and the whole mock backend (19 API groups) |

### Shell and navigation contracts
- **Marketing shell** (home): glass floating nav (Creators · Brands · Market · Tools · Pricing · Promise), audience-aware CTAs (`/signup/creator`, `/signup/brand`), theme + Reduce glass toggle, footer with legal and status.
- **Brand shell** (core): dimmed sidebar → floating glass bottom bar < 768 px; ⌘K palette; workspace and app switcher; wallet chip (escrow held / available); notifications drawer ("Needs you"); demo role switch in account menu. Groups: *Overview* `/brand`; *Bounties* bounties, review, disputes; *Growth* analytics, library, tests, promote; *Market* creators, offers, market, auctions, specs; *Money and rights* wallet, rights, compliance, scorecard; *Setup* apps, attribution, integrations, team, agency, developers, settings.
- **Creator shell** (core): sidebar → bottom bar (Home · Feed · Studio centre · Wallet · More); wallet chip shows pending and cleared separately; streak flame; ⌘K; quick toggle for numbers-off; "Get the app" nudge. *More* contains: Inbox, Posts, Submissions, Leaderboard, Tiers, Crews, Tournaments, Academy, Remix, Referrals, Profile, Rate card, Specs, Auctions, Rights, Safety, Wellbeing, Flo, Wrapped, Tax, Settings.
- **Admin shell** (admin-api): Overview · Fraud · Disputes · Verification · Payouts · Ledger · SLA · Safety · Bounties · Creators · Brands · ML; demo clock control (advance 24 h / 72 h to trigger settlement; reset demo data).

---

## 1. Marketing: `src/app/(marketing)`

### 1a. Audience pages. Owner: `web-marketing-home`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/` | Landing | Hero "Money follows what works." with creator/brand audience toggle that swaps copy and a glass phone mock; ledger-backed live payout ticker (static under reduced motion, "Demo data" tag); median creator earnings (30 d) beside the top-10% figure with method link; 3-step how-it-works per audience; market preview (clearing CPM by category); Studio phone showcase; outcome stack (CPM + CPA + ads); Promise strip of the 11 commitments linking `/promise`; escrow and Funded explainer; tiers; free tools teaser; fictional testimonials; pricing teaser (12 / 10 / 8% with all-in line); case-study strip (fictional in the demo; permission-based in production); FAQ; dual CTA to `/signup/creator` and `/signup/brand` | F-129, F-124, F-137 |
| `/creators` | For creators | "Get paid for videos that work."; embedded earnings calculator (median + range, FTC disclaimer); First-Dollar Path steps with the 72 h promise and "approval isn't guaranteed" note; Money Clock demo; Studio highlights; tiers and perks; Scam Shield and Rights Card explainers; Academy; Wellbeing; typical-vs-top earnings with method; app + web portal CTAs | F-073, F-001, F-129 |
| `/brands` | For brands | "Fund the videos that move installs."; Attribution Kit diagram (link, code, RevenueCat, survey); funnel preview views → paid; AI bounty builder walkthrough with Brief Lint; review queue with timecoded feedback and auto-approve; all-in price calculator teaser; Rights Vault; API / MCP; matched first bounty CTA; case studies (fictional in the demo; "App X: 2M views, 4,000 trials, $Y" format); link to `/compare` | F-040, F-044, F-048, F-129, F-137 |
| `/pricing` | Pricing | Free / Pro / Scale cards (12 / 10 / 8%, $0 / $299 / $999) and add-ons (install-only 6%, first bounty fee waived + up to $500 matched, Winner promotion 1% of ad spend, creators free, weekly payout free, instant 1.5% min $0.50 max $15); interactive all-in calculator (spend, plan, CPM → effective all-in CPM and break-even at $14,950 / $24,975 / $35,000); honest comparison vs Trybe, Whop, JoinBrands, TRIBE, agencies with "reported" labels and last-verified dates; fee-timing FAQ | F-032, F-122 |
| `/promise` | The flowd Promise | The 11 commitments as cards; each with its live public proof metric (from the ledger), "what happens if we miss it" (e.g., 72 h breach → approve-if-clean + brand reliability hit), and a link to the feature; links to `/trust`, `/security`, `/legal/earnings-disclosure` | F-001–F-021 |
| `/studio` | Studio feature page | Scroll-driven phone mock: brief → script → capture with teleprompter and live checklist → Hook Score with reasons → submit; peek at the 11-format library; "Checklist score" honesty note; on-device privacy; CapCut import; Liquid Glass preview; try Hook Score CTA to `/tools/hook-score` | F-078–F-085 |
| `/compare` | Honest comparison | Side-by-side vs Trybe, Whop Content Rewards, SideShift, agencies using corrected facts (Trybe has Android and deep DTC tooling; our wedge is app attribution, escrow, accountable review); each cell tagged verified / reported with source and last-verified date; "where they are better" column; CTA to `/tools/price-calculator` | F-129, F-122 |
| `/waitlist` | Ranked waitlist | Role toggle, email + handle form; live position and referral link (`joinflowd.io/...`); invite counter; position-based perks (single-level, platform-funded, no chance-based prizes); share buttons; FTC-safe terms; confirmation state | F-126 |
| `/founding-creators` | Founding creators | Live count of the 200 spots (true inventory); badge preview; tier head start; free instant payouts for a year; application form (handle, niche, proof of work); terms and earnings disclosure | F-108 |

### 1b. Content pages. Owner: `web-marketing-pages`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/market` | Live public market | Category selector; clearing CPM (median with p25–p75 band) and 7-day change in neutral arrows; supply (creators) vs demand (open bounties); open bounties preview with Funded badge, rate and spots; top hooks this week; payout ticker; "few trades" warning for thin categories; stale-data timestamp | F-124, F-054 |
| `/leaderboard` | Public leaderboards | Weekly top 20 by niche; tabs earnings / conversion rate / score accuracy; tier badges; opted-out creators shown as hidden; "typical creator" line; rows link to `/c/[handle]` | F-090 |
| `/formats` | Formats and hook library | 11 formats with beat structure, why it works, and sample hooks pre-filled with a demo app; filter by hook type; sources noted; "starting library is a hypothesis" note; "Try in Studio" CTA | F-079 |
| `/security` | Security | Escrow and double-entry ledger explainer; fraud model rules (spikes with no likes, new accounts, cap-clustering), 72 h window; payout protection; FTC disclosure enforcement; privacy and data handling (tokens encrypted, no training without opt-in); subprocessors; vulnerability disclosure | F-022, F-047, F-050 |
| `/trust` | Trust Center | Live promise metrics (median decision hours, % cleared on ETA, disputes resolved within 48 h, % bounties funded at go-live); Brand Scorecard leaderboard teaser; policies (no pay-to-join, no burner accounts, originality); Scam Shield how-to; human support SLA; status link; report CTA | F-007, F-016, F-131 |
| `/trust/report` | Report a scam or abuse | No-login form: type (pay-to-join, fake brand, burner demand, off-platform contact, other), description, evidence upload (mock), optional contact; confirmation with case id and SLA; links to Safety help | F-016, F-115 |
| `/about` | About | Mission and principles; the Promise in brief; team with generated avatars (fictional); press kit; `hello@joinflowd.io` | F-129 |
| `/partners` | Partner programme | Agency and consultant programme: 12-month share of referred apps' fees (single-level), tiers, how payouts work, application form, disclosure | F-127 |
| `/developers` | Developers | API overview with scopes (read / write / financial), drafts-by-default, endpoint groups, webhook events, MCP example ("launch a $500 bounty for my app"), rate limits, OpenAPI download, sandbox key CTA | F-062–F-064 |
| `/campus` | Campus ambassadors | Programme explainer, 10-university map (generated), perks, application form, FAQ | F-128 |
| `/changelog` | Changelog | Dated entries with tags (brand, creator, trust), filter, subscribe | F-131 |
| `/help` | Help centre | Search; categories (money, reviews, rights, taxes, safety, attribution); top articles rendered inline; contact human support with named SLA; status link | F-131 |
| `/status` | System status | Components (API, uploads, payouts, webhooks, review SLAs), 90-day uptime bars, incident history, subscribe | F-131 |
| `/app` | Get the app | iOS TestFlight beta with generated QR and requirements (iOS 17+); Android waitlist email capture; Liquid Glass preview | F-109 |

### 1c. Auth. Owner: `web-marketing-pages` (`src/app/(auth)`)
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/login` | Demo persona picker | Three role cards (Brand: Jordan at Lumi; Creator: Maya; Admin: Sam) with one-line summaries; email and password fields (demo); Sign in with Apple (mock); "Demo data" note; role redirect | F-133 |
| `/signup` | Role chooser | Creator vs brand with one-line value and proof for each; routes to the right signup | F-133 |
| `/signup/creator` | Creator sign-up | Apple / Google (mock) and email; 18+ confirmation; terms and creator agreement summary; → `/onboarding/creator` | F-073, F-133 |
| `/signup/brand` | Brand sign-up | Work email, company, role, monthly UA band; creates workspace on the Free plan with a one-line fee explainer; → `/brand/onboarding` | F-032, F-133 |
| `/forgot` | Password reset | Email field, neutral confirmation (no account enumeration), back link | F-133 |
| `/verify` | ID / KYC demo | States not started → processing → verified or failed with reason; 18+ check; human fallback link; `?kind=brand` variant for business verification | F-031 |

---

## 2. Tools, public pages and legal

### 2a. Tools and reports: `src/app/(tools)`. Owner: `web-tools-public`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/tools` | Free tools index | Cards for each tool with audience label and what you get; CTA to sign up | F-119–F-122 |
| `/tools/hook-score` | Free Hook Score | Paste hook text and/or upload a clip (analysed in-browser); band (Strong / Solid / Weak) with timecoded reasons; one-tap rewrites; "Checklist score" label; shareable result; optional email after the result | F-119, F-081 |
| `/tools/app-ugc-audit` | App UGC Audit | Paste an App Store link; validation and error states; generation progress; on success → `/audit/[slug]`; example audits | F-120 |
| `/audit/[slug]` | Shareable audit report | App summary; AI brief; 10 hooks; predicted CPM range with confidence and price-vs-fill; creators ready now (fictional); assumptions; copy-link and OG card; CTA "Launch this as a bounty" prefilling the builder | F-120 |
| `/tools/earnings-calculator` | Earnings calculator | Inputs (niche, posts per week, average views, tier); p25 / median / p75 outputs with a top example in the same size class; assumptions; "results vary, not a guarantee"; CTA | F-121, F-019 |
| `/tools/budget-planner` | Budget planner | Inputs (budget, goal, category); bands for views, installs, trials, CAC; scenario compare; export; CTA to the builder | F-067 |
| `/tools/price-calculator` | All-in price calculator | Spend, plan, CPM → effective all-in CPM per plan; vs Trybe, Whop and agency models labelled "not like-for-like"; break-even chart | F-122 |
| `/report/state-of-app-ugc` | State of App UGC | Charts: clearing CPMs by category, top hook types, view-to-trial rates; methodology; quarter selector; CSV download; Demo-data note | F-123 |

### 2b. Public pages: `src/app/(public)`. Owner: `web-tools-public`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/c/[handle]` | Creator storefront | Avatar, tier badge, verified stats (posts, approval rate, median views); apps promoted; rate card CTA; badges; proof link; "Earn with flowd" footer; share; designed 404 | F-102 |
| `/p/[id]` | Proof page | Verified amount, period, tier, ledger hash; typical-creator median line; creator handle or anonymised; "How we verify"; revoked state | F-095, F-019 |
| `/b/[id]` | Public bounty | Verified brand, rate, CPA, cap, Funded badge, budget left, Rights Card, Pay Math, Scorecard summary, brief teaser; "Join in the app" CTA with QR and `/signup/creator`; closed and filled states | F-125, F-002, F-011 |
| `/t/[id]` | Public tournament | Prize pool, schedule, rules, bracket, standings, enter CTA; results state | F-092 |
| `/r/[code]` | Tracking-link landing | What a viewer sees: app name and icon, "ad by creator" disclosure, App Store button carrying deferred-link params, promo code shown with copy; invalid-code state; logs a click event | F-041 |
| `/scorecard/[brandId]` | Public Brand Scorecard | Four metrics (pay speed, decision time, approval fairness, approved-work-run), reliability 0–100, sample size and period, 90-day trend, how it is computed; "New brand" state under 10 decisions | F-007 |
| `/og/[kind]/[id]` | OG image handler | Route handler: `kind` in `proof`, `audit`, `card`, `scorecard`, `bounty`; 1200×630 and 1080×1920 variants; generated art only; proof and card always carry the median line | F-095 |

### 2c. Legal: `src/app/(marketing)/legal`. Owner: `web-tools-public`
All seven pages share one template: a "Draft · not legal advice" banner, version and date, table of contents, a plain-English summary box, and the flowd-specific clauses listed below.
| Route | Page | Must show (flowd-specific clauses) | F-IDs |
|---|---|---|---|
| `/legal/terms` | Terms of service | Escrow and ledger; fees and fee timing; 72 h window; clawbacks for fraud only; disputes; suspension | F-132 |
| `/legal/privacy` | Privacy policy | Data inventory; encrypted social tokens; no training on videos without opt-in; analytics rules; GDPR/CCPA export and deletion | F-132 |
| `/legal/creator-agreement` | Creator agreement | Licence tiers; payment terms and Money Clock states; 18+; originality; clawbacks; likeness off by default | F-132 |
| `/legal/brand-terms` | Brand terms | Escrow obligations; review SLA obligations and consequences; rights and renewals; fees; disclosure responsibility | F-132 |
| `/legal/earnings-disclosure` | Earnings disclosure | Median figures with methodology and period; top-earner context; "results vary"; no income guarantees | F-132, F-019 |
| `/legal/usage-rights` | Usage rights | Rights Card field definitions; paid-ad term default 90 days; renewal at 25% of base fee per 30 days; AI likeness; Spark / partnership grants | F-132, F-011 |
| `/legal/community-rules` | Community rules | No burner accounts; no pay-to-join; originality and reposts; disclosure; scam reporting; strikes | F-132, F-018 |

---

## 3. Brand dashboard: `src/app/brand`

### 3a. Core. Owner: `web-brand-core` (shell + setup + bounties + wallet)
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/brand` | Overview | KPI tiles (spend, verified views, installs, trials, cost per trial) with signed delta vs a named period and 12-point spark; "Needs you" (submissions waiting and oldest age, SLA risk, disputes, expiring rights); spend pacing vs budget; mini funnel; live bounties with fill and burn; market pulse; activity; next best actions; new-brand 3-step checklist (connect, fund, brief) | F-061 |
| `/brand/onboarding` | Connect-app wizard | App Store URL → metadata card (generated glyph); RevenueCat connect (webhook URL and secret with copy, test event); SDK snippet with copy; code pool; survey template; optional MMP; error states; progress persists; ends at funding CTA | F-037, F-040 |
| `/brand/apps` | Apps | List with icon, category, attribution health, active bounties; add app; archive | F-037 |
| `/brand/apps/[id]` | App detail | Metadata, attribution coverage meter, rights defaults, template packs, linked integrations, bounty history | F-037, F-070 |
| `/brand/bounties` | Bounties | Tabs live / draft / filled / ended; rows with Funded badge, fill %, budget left, pending submissions, cost per trial; filters, search, bulk pause; empty state with CTA | F-039 |
| `/brand/bounties/new` | AI bounty builder | Four steps Link → Brief → Pay → Fund; Flo draft streams per field and is editable inline; Brief Lint panel (errors block publish); Pay Math and effective all-in CPM; suggested price slider with fill time and confidence; Rights Card editor; first-bounty banner (fee waived, up to $500 matched); creator preview (feed card + detail); funding breakdown (pool, fee, processing); Go live disabled until Funded; autosaved drafts; calm confirmation; pay modes CPM, CPA and install-only (flat 6%), stacked pay (v2), per-video and per-creator caps | F-038, F-013, F-014, F-011, F-033, F-002, F-023, F-024, F-025, F-027 |
| `/brand/bounties/[id]` | Bounty detail | Tabs (`?tab=`) Overview (status, Funded, budget pool / reserved / settled / left, fill, SLA), Submissions (table with flags), Funnel, Creators, Settings (pause, extend, top up, close, feature pin); settlement status per post (window, fraud check, cleared) and clawbacks | F-039, F-044, F-003, F-068, F-026, F-027 |
| `/brand/wallet` | Wallet | Escrow (held, reserved, settled, available); fund by card or bank (mock) with fee breakdown; auto top-up; double-entry ledger table (debit / credit, type, post); invoices list; settlement runs (window closed, fraud check, cleared) with per-post rows; returned unspent; CSV export | F-022, F-034, F-036, F-026 |
| `/brand/wallet/invoices/[id]` | Invoice | Printable per-bounty invoice: pool, fee %, processing, all-in CPM, editable PO and cost-centre fields, tax info, CSV and print stylesheet | F-034, F-035 |

### 3b. Review, analytics and rights. Owner: `web-brand-review`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/brand/review` | Review queue | List sorted by QA flags, Flow band, age; row with creator tier and reputation, band, flags, fraud band, SLA timer (stale at 48 h, breach at 72 h); keyboard J / K, `]` `[`, V bulk select, Shift+A approve passing, S snooze, `?` sheet; fraud-hold lane; inbox-zero state; auto-approve badge linking to rules; 120 ms row collapse, no other animation | F-048, F-004, F-021 |
| `/brand/review/[id]` | Focus-mode review | Player (J K L, Space, `,` `.` frame step, 1–2× speed, captions); context: transcript with beats ticked, disclosure audio + on-screen, music, duplicate hash, AI flag, fraud evidence (score, view curve, US %, account age), creator history, v1 / v2 diff; timecoded comments (C, I / O); actions A approve, R request changes (needs a comment), X reject with requirement-linked reason 1–9; 10-second undo; decide-by timer | F-005, F-046, F-050 |
| `/brand/review/rules` | Auto-approve rules | Rule builder (Flow band, 100% beats, disclosure, duplicate, music, fraud threshold, US %, creator history); scope; guardrails (daily and budget caps, 10% spot-check, kill switch); dry run "would have approved 31 of the last 50" with list; timeout policy (approve-if-clean or escalate); audit log; Pro gating message | F-049 |
| `/brand/analytics` | Funnel and analytics | Filters (bounty, creator, hook, format, platform, window); views → clicks → installs → trials → paid with Tracked / Estimated chips; cost per stage; ROAS D7–D90 with maturity badges; payback day; cohorts; creator league ranked by cost per trial and D30 ROAS; attribution mix and coverage; CSV; table view for accessibility | F-044, F-045 |
| `/brand/library` | Creative library | Grid of every video tagged by format, hook type, hook words, time to app reveal, CTA; hook leaderboards; filters; compare view; "why it won" notes; empty state explains the need for settled posts | F-053 |
| `/brand/tests` | Test planner | Hook × body × CTA matrix sized to spend tier; assign to bounties or offers; results with winner, lift and confidence; small-sample caution; export | F-051 |
| `/brand/promote` | Winner promotion | Eligible posts (cleared, rights allow) with hook rate, hold rate, trial rate, ROAS; flow: creator consent → platform permission (Spark / partnership, mock) → commission and 1% fee summary → confirm; running promotions; fatigue alerts (down 30% from peak) with refresh bounty | F-057, F-058, F-052, F-069 |
| `/brand/rights` | Rights Vault | Licences table (post, creator, usage type, start, end, platform code or grant, status); expiry buckets 30 / 14 / 7 days; renew with price preview (25% of base fee per 30 days); revoke; export | F-012, F-058 |
| `/brand/compliance` | Compliance QA | Audit log per submission (disclosure audio and on-screen, music, claims, AI flag); failures blocking settlement; waive with logged reason; banned-claims and categories lists; disclosure wording template; export | F-050, F-072 |
| `/brand/disputes` | Disputes and appeals | List of creator disputes and appeals on this brand's bounties with status and SLA; case view with ledger evidence and response form; outcomes | F-071, F-010, F-006 |
| `/brand/scorecard` | Own Brand Scorecard | Four metrics, reliability 0–100, sample size; 90-day trend; "what creators see" preview; improvement actions (clear queue older than 48 h, add reasons); SLA-breach list | F-007, F-021 |

### 3c. Market, setup and developers. Owner: `web-brand-market`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/brand/creators` | Discover creators | Filters (niche, tier, approval rate, reliability, platform, price, US audience %); cards with verified stats and cost per trial on your apps; compare; invite to bounty or send offer; add to list; empty results | F-059 |
| `/brand/creators/[handle]` | Creator profile | Tier, reputation with reasons, posts and hit rate, per-app results, rate card, storefront link, history with your brand, fraud summary; actions offer / invite / list | F-059, F-008 |
| `/brand/creators/lists` | CRM lists | Lists and favourites with notes and tags; bulk invite or offer; export | F-059 |
| `/brand/offers` | Direct offers | Create offer (creator, amount, deliverables, rights); thread with counter and accept; escrow reserved on accept; re-buy shortcut for winners | F-060, F-069 |
| `/brand/market` | Market view | Category selector; clearing CPM over time with p25–p75 band; price-vs-fill slider with confidence; supply and demand; competition heat; trend radar; your bounty marked; "why this price" popover; thin-market warning; neutral ink and arrows (no green / red) | F-054 |
| `/brand/auctions` | Auctions | Open auctions for top creator slots (creator, slots, closes); place sealed maximum bid with escrow hold; my bids; results with second-price clearing; rules explainer | F-055 |
| `/brand/specs` | Spec Market | Browse pre-scored videos (Flow band, hook, format, creator, price); preview; license with rights, term and price; my licences; first-refusal banner for approved-unused videos | F-056 |
| `/brand/attribution` | Attribution Kit | Setup checklist (link domain, SDK, RevenueCat, code pool, survey); health with coverage meter and last event; code pool (active codes per SKU against the 10 cap, rotation schedule); conversions by source with confidence labels (CPA pays on link and code only); test-event tool; docs; MMP adapters | F-040–F-043 |
| `/brand/integrations` | Integrations | RevenueCat, MMPs (AppsFlyer, Adjust, Branch), Meta and TikTok ad accounts, Slack, Zapier: connect, status, scopes; Slack approvals config; webhook logs | F-043, F-065 |
| `/brand/team` | Team and activity | Members; roles matrix (owner, admin, reviewer, finance, viewer); invite; client approval links without a seat; filterable, exportable activity log | F-066 |
| `/brand/agency` | Agency roll-up | Apps and clients table (spend, cost per trial, queue age); client approval links; white-label PDF reports; Scale gating message on lower plans | F-066 |
| `/brand/developers` | Developers | API keys with scopes (read / write / financial, drafts by default); webhook endpoints with events, test and delivery log; MCP config with example prompt "launch a $500 bounty"; OpenAPI link; sandbox | F-062–F-064 |
| `/brand/settings` | Settings | Workspace profile; plan and billing (comparison, break-even hint, payment methods); notifications; compliance defaults (disclosure wording, banned claims); default rights; VAT and tax info; danger zone | F-032, F-035, F-134 |

---

## 4. Creator web portal: `src/app/creator`
Primary creator experience is the iOS app; the portal gives desktop parity and pushes "get the app".

### 4a. Core. Owner: `web-creator-core` (shell + money path)
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/onboarding/creator` | First-Dollar Path wizard | Earnings preview (niche → median payouts and sample bounty, typical beside top); niches; link accounts (skippable); 18+ and agreement; starter bounty hand-off ("flat $5, decision within 24 h, cleared within 48 h of approval, approval isn't guaranteed"); progress reads "First dollar in 72 hours"; resumable | F-073, F-077 |
| `/creator` | Home | Money Clock summary (cleared, pending with ETA); Daily Drop card (pre-drop countdown to 16:00 UTC, live with true spots left, sold out with next time); streak with freezes; matched bounties; What to post today; First-Dollar tracker; next steps; activity; Flo entry | F-088, F-089, F-101, F-001, F-073 |
| `/creator/feed` | Bounty feed | Cards with rate, cap, Funded badge, budget left, spots, "decides in about 11 h", expected earnings (median), match %, Rights chip; filters (pay structure, platform, tier-gated, funded-only default), search, saved, sort; tier-locked state with unlock path; always-on flowd "content-about-us" bounty pinned for new creators; CPM, CPA and install-only badges | F-074, F-002, F-130, F-023, F-024 |
| `/creator/bounties/[id]` | Bounty detail | Brief TL;DR by Flo, must-say, do / don't, examples; Rights Card; Pay Math (p25 / median / p75); Brand Scorecard summary; Funded badge and budget bar; spots; deadline; Scam Shield cues and report button; sticky "Make it"; states tier-locked, closed, already claimed | F-075, F-011, F-014, F-007, F-016 |
| `/creator/brands/[id]` | Brand Scorecard | Four metrics, reliability, sample size, trend; recent bounties; share of rejections with reasons; "decides in about 11 h"; report brand; "New brand" state | F-007 |
| `/creator/studio` | Studio-lite | Pick bounty and format → script (AI, library, own) → upload or import clip → Hook Score and Flow Score band with timecoded reasons → brief check → pre-flight (disclosure, music, claims) → submit; "Checklist score" label; nudge to record in the iOS app for the teleprompter; local drafts | F-078–F-085, F-017 |
| `/creator/submissions` | Submissions | Status chips (in review with decide-by, revise, approved, rejected, withdrawn); reserved amount; SLA countdown; filters | F-004, F-003 |
| `/creator/submissions/[id]` | Submission detail | Player with timecoded comments (must-fix vs suggestion, tick off); v1 / v2 history and rounds left; decision with reason code and evidence; upload revision; one appeal; once approved: post flow (disclosure locked, link and code copy, attach post URL); Reserved Slot amount | F-004, F-005, F-006, F-087 |
| `/creator/posts` | Posts | Live posts with views, installs, trials, earnings, state (live, window closed, cleared), clears-at; retention teaser; filters | F-087, F-106 |
| `/creator/posts/[id]` | View Ledger and dispute | Snapshot table and chart (verified vs excluded), source split, bot-flag cause in plain words; conversions with link / code labels; per-post earnings timeline; retention curve; per-video cap progress and any clawback or removal effect; dispute CTA (range, reason, note) and status | F-009, F-010, F-106, F-027 |
| `/creator/wallet` | Wallet | Money Clock hero (pending lagoon + clock, cleared mint + check, paid); rows with ETAs and reasons; earnings chart; payouts (weekly Fri 18:00 UTC, history, proof links); instant cash-out sheet with fee and net; method status; Earnings Card generator; link to tax; settlement path per row (72 h window, fraud check, cleared) | F-001, F-028, F-029, F-095, F-026 |
| `/creator/tax` | Tax Desk | W-9 status and just-in-time flow (mock); YTD cleared and paid; 1099-NEC threshold progress; set-aside slider; CSV export; "not tax advice"; gifting-is-taxable note; Academy link | F-015 |
| `/creator/settings` | Settings | Linked accounts (mock OAuth, read-only); payout methods; ID status linking `/verify`; notifications and quiet hours; appearance (theme, Reduce glass); privacy (AI-training opt-in, export, delete); legal links | F-030, F-031, F-077, F-134 |

### 4b. Social, growth and safety. Owner: `web-creator-social`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/creator/rate-card` | Rate card | Editor (price per video, minimum CPM, rights days and paid-usage add-ons, deliverables, availability); market-suggested price with p25–p75 and fill likelihood; preview as brands see it; Silver+ gating | F-103 |
| `/creator/inbox` | Inbox | Master-detail of offers, counters and messages; threads tied to submission or offer; accept, counter or decline with Rights Card and Pay Math inline; Scam Shield warnings inline; report; rate-limit notice; "in-app only" reminder | F-060, F-107, F-016 |
| `/creator/leaderboard` | Leaderboard | Peer cohort (about 30, by tier and niche) with promotion line and your row; rank-delta chips; weekly reset time; global board tab; private mode and opt-out; unranked state "Earn your first $1" | F-090 |
| `/creator/tiers` | Tiers | Bronze → Elite ladder; progress ring listing each requirement and what is missing; perks table (head start 1 / 3 / 6 / 12 h, rate card, crews, auctions, featured profile); "no drop for 30 days after a dip" note; history | F-091 |
| `/creator/crews` | Crews | My crew (members, shared leaderboard, bonuses); discover, create, join; invite link; leave any time; Gold+ lead | F-093 |
| `/creator/tournaments` | Tournaments | Upcoming, live, past; prize pools; my entries; enter; links to public `/t/[id]` | F-092 |
| `/creator/tournaments/[id]` | Tournament | Rounds and matchups (hook battles); submit entry; standings; results; rules | F-092 |
| `/creator/academy` | Academy | Ten core lessons of 5 minutes or less (hooks, brief and Rights Card, usage rights, contract red flags, platform rules, taxes, scams, rate cards, analytics, cadence); progress; badges; tier boosts; "free, never required" note | F-099 |
| `/creator/academy/[lesson]` | Lesson | Short lesson with example, three-question quiz, completion badge, next lesson, read time | F-099 |
| `/creator/remix` | Remix library | Formats and hooks with filters (format, hook type, niche) and "Remix this" (loads Studio with the structure); Trend radar tab (rising and fading formats); "why it won" cards | F-100, F-101, F-079 |
| `/creator/referrals` | Referrals | Link and code; invites sent and accepted; ranked position; single-level reward rules and caps; "funded by flowd, never by recruits" statement; referral earnings window; FTC-safe copy | F-094 |
| `/creator/profile` | Profile and storefront editor | Handle, bio, portfolio (up to 5), apps promoted, badges, tier, reputation with reasons; preview of `/c/[handle]`; copy link | F-076, F-102, F-008 |
| `/creator/specs` | Spec uploads | My specs with status, Flow band and licensed state; upload and score; price and rights; licence earnings | F-104 |
| `/creator/auctions` | Auction slots | Platinum+: create slot windows; sealed bids revealed at close; second-price result; history; locked state with unlock path | F-105 |
| `/creator/wrapped` | Wrapped | 8–10 segmented stories (earnings, best post, winning hook, streak, tier, typical line); hold to pause; share card; month and year switch | F-096 |
| `/creator/safety` | Scam Shield and Account Health | Tabs `?tab=scams`: rules ("flowd never asks you to pay"), spot-a-scam checklist, report flow, my reports and status; `?tab=account-health`: originality check history, duplicate and watermark flags, per-account guidance, platform rules, burner-account rule | F-016, F-017, F-018 |
| `/creator/wellbeing` | Wellbeing Mode | Quiet hours (default 10 pm–8 am); numbers-off schedule; opt-in pace setting; Pause that preserves tier and streak; rest-week toggle; leaderboard opt-out; worst-month and set-aside view; resources (988 in the US, Creators 4 Mental Health) | F-020, F-089 |
| `/creator/flo` | Flo copilot | Chat with context chips (bounty, format); scripts (three options), hook rewrites, brief TL;DR, caption ideas; streaming typewriter; "checklist-based, can be wrong" label; history; send to Studio | F-098 |
| `/creator/rights` | My licences | Where my videos run (post, brand, usage, start, end, platform); expiry alerts; renewal offers with price and accept / decline; request revocation of Spark access; AI-likeness status (off) | F-012, F-058, F-011 |

---

## 5. Admin: `src/app/admin`. Owner: `web-admin-api`
| Route | Page | Must show (data · interactions) | F-IDs |
|---|---|---|---|
| `/admin` | Launch control tower | 90-day targets vs actuals (six metrics with trend and gap); market health (fill rate, median decision hours, % cleared on ETA, disputes within 48 h); queue counts and SLA breaches; payout-run countdown (Fri 18:00 UTC); GMV and fees; alerts; demo clock (advance 24 h / 72 h, reset) | F-110 |
| `/admin/fraud` | Fraud queue | Sorted by risk and money at stake; filters; counts by rule; bulk clear or hold | F-111, F-047 |
| `/admin/fraud/[id]` | Fraud case | Evidence (score, hourly curve with envelope, cap-clustering, geo, account age, duplicate hash side by side); creator history; actions clear / hold / claw back / ban with reason and audit; notes | F-111, F-046 |
| `/admin/disputes` | Dispute queue | Creator disputes and appeals with 48 h SLA timers and status | F-112 |
| `/admin/disputes/[id]` | Dispute case | Creator ledger snapshots vs brand claim; timeline; decide uphold, overturn or partial with reason; notification preview; release to next payout | F-112, F-010, F-006 |
| `/admin/verification` | Verification queue | Tabs: creator ID and age, brand business and funding source, tax status (W-9); approve or reject with reason codes; documents (mock); SLA | F-113, F-031 |
| `/admin/payouts` | Payout operations | Friday 18:00 UTC run preview (count, total, holds); holds with named reasons and release; failures with retry; instant cash-out volume and limits; method issues | F-114, F-028 |
| `/admin/ledger` | Ledger explorer | Filter by account, bounty, post, type; double-entry pairs; balance proof (escrow in = creator out + platform + returned); anomaly detector; export | F-116, F-022 |
| `/admin/bounties` | Bounty registry | Status, funded, fill, SLA; actions pause, hold, relabel; lint-override log | F-118 |
| `/admin/creators` | Creator registry | Tier, reliability, fraud flags, KYC; actions tier override (logged), hold, ban; search | F-118 |
| `/admin/brands` | Brand registry | Plan, funded, scorecard and reliability, verification, disputes; actions suspend, fee adjustment (logged) | F-118 |
| `/admin/sla` | Review SLA desk | Submissions stale at 48 h and breached at 72 h; actions approve-if-clean, nudge, reassign; reliability hits; approved-unused after 30 days released to the Spec Market; per-brand trends | F-021, F-004 |
| `/admin/safety` | Safety queue | Scam reports by type; triage; takedown, strike, suspend; pay-to-join detections; burner-demand lint overrides; repeat offenders | F-115, F-016 |
| `/admin/ml` | Model monitoring | Hook and Flow Score calibration (predicted vs realised band); fraud precision and recall; matching and pricing monitors; checklist vs learned comparison (about 1,000 settled posts); drift; version registry; video-understanding job status and tag coverage (format, hook, CTA) | F-117, F-139 |

---

## 6. Mock API: `src/app/api/v1/**`. Owner: `web-admin-api`
Implements `packages/contract/openapi.yaml` against the same demo data layer (server-side in-memory singleton seeded from fixtures). iOS `LiveFlowdAPI`, the MCP server and external tools talk to it. Money is integer cents; errors use `{ code, message, hint }`.

| Group | Key endpoints (`/api/v1`) | Must support |
|---|---|---|
| Session | `POST /auth/demo-login`, `GET /me` | Role switch; demo flag |
| Apps and brands | `GET/POST /apps`, `POST /apps/lookup`, `GET /brands/{id}`, `GET /brands/{id}/scorecard` | App Store URL → mock metadata; scorecard from ledger data |
| Bounties | `GET/POST /bounties`, `GET/PATCH /bounties/{id}`, `POST /bounties/{id}/fund`, `/publish`, `/pause`, `/close`, `/top-up`, `POST /bounties/lint`, `POST /bounties/price`, `POST /bounties/draft`, `GET /bounties/{id}/funnel` | `409 bounty_not_funded`; lint ruleset shared with the client; Pay Math and market suggestion; AI draft with graceful failure |
| Feed and Drop | `GET /feed`, `GET /drops/today`, `POST /drops/{id}/claim` | Match ranking; true inventory; claim queue |
| Submissions and review | `GET/POST /submissions`, `POST /submissions/{id}/feedback`, `/decision`, `/revise`, `/appeal`, `/withdraw`, `GET /review/queue`, `GET/PUT /review/rules`, `POST /review/rules/dry-run` | `422 reason_required`; Reserved Slot; two free revision rounds; 72 h SLA and timeout policy |
| Scoring | `POST /score/hook`, `POST /score/flow`, `POST /score/preflight` | Bands plus timecoded reasons; same reason codes as the engine |
| Posts and ledger | `GET /posts`, `GET /posts/{id}/ledger`, `POST /posts/{id}/dispute`, `GET /ledger` | Snapshots, sources, exclusion causes; idempotent settlement; double-entry |
| Wallet and payouts | `GET /wallet`, `GET /payouts`, `GET /payouts/preview`, `POST /payouts/instant` | Money Clock states with ETAs and reasons; fee preview; Friday run |
| Tax | `GET /tax/summary`, `GET /tax/export.csv`, `POST /tax/w9` | Just-in-time prompt state |
| Offers, rate cards, auctions, specs | `GET/POST /offers`, `PUT /rate-card`, `GET/POST /auctions`, `POST /auctions/{id}/bids`, `GET/POST /specs` | Counter flow; second-price clearing |
| Market | `GET /market/clearing`, `POST /market/suggest` | Quartiles, fill-time, confidence |
| Attribution | `GET /r/{code}` (resolve), `POST /attribution/events`, `POST /webhooks/revenuecat`, `GET /attribution/health` | Source and confidence labels; CPA only on `link` and `code`; code-pool rotation |
| Rights and promotion | `GET /rights`, `POST /rights/{id}/renew`, `/revoke`, `POST /promotions` | Expiry alerts 30 / 14 / 7 days; creator consent |
| Reputation and progression | `GET /creators/{id}/reputation`, `GET /tiers`, `GET /leaderboards`, `GET/POST /tournaments`, `/crews`, `/referrals`, `/academy` | Tier thresholds from constants; peer cohorts; single-level referrals |
| Flo and tools | `POST /flo/chat` (SSE), `POST /tools/hook-score`, `POST /tools/app-audit` | Streaming; public tools need no auth |
| Safety | `POST /reports`, `GET /admin/safety` | Case id and SLA |
| Developers | `GET/POST /api-keys`, `/webhook-endpoints`, `POST /mcp` (JSON-RPC) | Scopes (read / write / financial); drafts by default; signed webhooks |
| Admin | `GET /admin/{targets,fraud,disputes,verification,payouts,ledger,sla,ml}`, `POST /admin/demo/advance` | Demo clock drives window close, fraud check, payout run |
| Events and health | `POST /events`, `GET /health` | Analytics rules in `PRODUCT_SPEC.md` §10 |
