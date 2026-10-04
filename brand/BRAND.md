# flowd brand book

**Version 1.0.0 · 2026-10-03 · theme "Lagoon Glass"**

This is the identity for flowd: the open market where app teams fund bounties, creators compete, and money follows whatever actually works. It overrides the visual notes in `docs/CONVENTIONS.md` (section 1 "Visual direction" and section 2 "Liquid Glass design system") wherever they differ; the differences are listed in [section 19](#19-where-this-differs-from-conventions-and-open-items).

Everything numeric in this book is generated from `packages/tokens/tokens.json` (and the contrast checker that guards it), so the book, the CSS, the Swift and the brand board cannot drift apart. Regenerate with `node packages/tokens/build.mjs && node brand/src/build-brand-md.mjs`.

The living companion to this document is **`brand/preview.html`**, a single-file brand board (open it in a browser; toggle dark/light and reduce-transparency in the top bar). It is the design north star: if a screen looks unlike the board, the screen is wrong.

**Contents**
1. [Name](#1-name) · 2. [Positioning](#2-positioning) · 3. [Tagline and headlines](#3-tagline-and-headlines) · 4. [Voice and tone](#4-voice-and-tone) · 5. [Logo](#5-logo) · 6. [Colour](#6-colour) · 7. [Typography](#7-typography) · 8. [Spacing, radius, elevation, layout](#8-spacing-radius-elevation-layout) · 9. [The glass material](#9-the-glass-material) · 10. [Aurora background](#10-aurora-background-l0) · 11. [Motion](#11-motion) · 12. [Iconography](#12-iconography) · 13. [Imagery and illustration](#13-imagery-and-illustration) · 14. [Tier badges](#14-tier-badges) · 15. [App icon](#15-app-icon) · 16. [Social and OG art direction](#16-social-and-og-art-direction) · 17. [Accessibility](#17-accessibility-rules) · 18. [Using the system](#18-using-the-system) · 19. [Differences and open items](#19-where-this-differs-from-conventions-and-open-items)

---

## 1. Name

**flowd**. Always lowercase, even at the start of a sentence in UI chrome. Pronounced **"flowed"** (/floʊd/, rhymes with "showed"). The brand-side product is **flowd for Brands**. The company in fiction and legal copy is flowd, Inc.

**Why this name**
- **Flow** is the product: attention becomes views, views become installs, installs become revenue, revenue becomes payouts. The market makes money move toward what works.
- The **-d** makes it past tense, a payout that has already landed. "Payout flowd" is a complete, satisfying sentence, and it is the one place the brand name doubles as a verb (see [4.5](#45-payout-and-celebration-moments)). Use that device sparingly: only in payout success moments.
- **Lowercase, five letters, round letters.** Friendly and typeable, with no "creator economy" cliché and no "hub", "lab" or "ify" suffix. The letterforms (f, l, o, w, d) are almost all curves and stems, which is what lets the wordmark be drawn with one monoline stroke.
- It reads as one idea in a logo: a **ribbon** (flow) that rolls into an **f**.

**Always**: `flowd`, `flowd for Brands`, `Flo` (the in-app copilot, capitalised because it is a character, not the company), `flowd, Inc.`
**Never**: `Flowd`, `FLOWD`, `flowD`, `FlowD`, `Flowed` (as the brand), "the flowd platform", "flowd.ai" style suffixes in running text.

**Domains and handles.** The user owns `joinflowd.io`, the canonical public domain (marketing, short links `joinflowd.io/c/<handle>`, proofs `joinflowd.io/p/<id>`, tracking `joinflowd.io/r/<code>`, API `api.joinflowd.io`, brand app `app.joinflowd.io`). See `docs/DOMAIN_CHECK.md`. **Unverified:** social handle availability and a trademark search for "flowd" in classes 9, 35, 36, 42. Do both before spending on launch.

---

## 2. Positioning

**One sentence.** flowd is the open market for app creators: brands fund bounties, creators compete, and a model prices, scores and checks every video so money follows views, installs, trials and ad results.

**For** app teams that buy UGC today and creators who make it, **flowd is** one market and one ledger from first view to paid subscription. **Unlike** a hiring marketplace (flat fees, no price discovery) or a view-count rail (pays for views, not outcomes), flowd pays for what a video actually drives, shows every dollar's state and date, and puts a score and an explanation on every video.

**Five pillars** (each one a promise the UI can keep):
1. **Open.** Bounties anyone qualified can join, rate cards creators set, auctions for top slots, model-suggested prices. No applications that go unanswered.
2. **Proven.** Every dollar has a state and a date: escrowed, pending, cleared, paid out. Pending money shows when it clears.
3. **Fast.** Instant cash-out when you want it, weekly when you do not. A review deadline on every submission.
4. **Honest.** The median creator is always shown beside any top earner. Scores are labelled "Checklist score" until the model has settled enough bounties to earn the name. No invented scarcity.
5. **Alive.** The product looks like a living market: luminous, fast, a little playful where money lands, calm where money is committed.

**Where we sit visually.** From `docs/research/trybe.md` §9: Trybe is a flat, light, white-canvas product with violet pill buttons and an indigo-violet "t" mark, built for Shopify brands. flowd deliberately sits elsewhere: dark-first, translucent Liquid Glass, a violet-to-azure-to-cyan Flow gradient as UI atmosphere, a flat ribbon-f mark with a mint crossbar, and mint reserved for money. The one shared hue family (violet) is used for Flo, the copilot, and the first gradient stop, never as the main button colour. **Unverified:** how Whop's content-rewards surface looks; we have not captured it, so we make no visual comparison.

**Audiences.** App teams (indie to Series B subscription apps, 1 to 5 people on growth) get a calm, dense, Linear-like brand dashboard. Creators (Gen Z UGC creators and clippers) get a vivid, native, Cash App-like iOS app. Same tokens, two intensities (see `docs/research/design-ux.md` principle 7).

---

## 3. Tagline and headlines

### Canonical tagline
> **Money follows what works.**

Why this one:
- It is true for both sides: brands' budgets follow the videos that perform; creators' money follows their work when it does.
- It carries the name (money *flows*) without explaining it, and it is the logo's gesture in words (a ribbon that follows a path).
- It states a mechanism, not an income. It cannot be read as a promise of earnings, which keeps it clear of the FTC's gig-earnings enforcement priority (see `docs/BLUEPRINT.md` "Growth engine").
- Four short words, plain English, works as an H1, an App Store subtitle, a Live Activity title and a 1200x630 card.
- It is a market line ("capital follows returns") without finance jargon.

Risk, and the mitigation: "what works" can sound vague. Always put a concrete line under it: *"flowd is the open market for app creators. Brands fund bounties. Creators compete. Results get paid."*

### Five alternates (pick by surface; never mix two taglines on one screen)
| # | Line | Best for |
|---|---|---|
| 1 | The open market for app creators. | Descriptor, boilerplate, store subtitle, press |
| 2 | Every view has a price. | Brand-side and market pages; the Market view |
| 3 | Make it. Post it. Get paid. | Creator onboarding, App Store promo text |
| 4 | Creators compete. Results get paid. | Explainers, deck, how-it-works |
| 5 | Pay for what performs. | Brand-side ads, pricing page |

### Hero headline options
| Surface | Headline | Support line |
|---|---|---|
| Home (both audiences) | **Money follows what works.** | flowd is the open market for app creators. Brands fund bounties. Creators compete. Results get paid. |
| Creators | **Get paid for videos that work.** | Open bounties for app UGC, paid on verified views, installs and trials. First video in 3 minutes. |
| Brands | **Fund the videos that move installs.** | Set a rate, escrow the pool, and pay only for views, installs and trials that clear. |
| Market page | **See what a view is worth today.** | Live clearing prices by category. Median and top, side by side. |
| Free App UGC Audit | **What should your app's creator videos cost?** | Paste an App Store link. Get a brief, 10 hooks and a predicted CPM. |
| App Store subtitle (30 chars) | Get paid for app videos | |
| Push permission pre-prompt | **Know the minute you're paid.** | We only send payout and review updates. One Daily Drop reminder, if you want it. |
| Empty-state wallet | **Your first payout lands here.** | Pending money shows the date it clears. |

---

## 4. Voice and tone

**In one line:** confident, clear, a little playful. Short sentences. Numbers over adjectives. Never hype income.

### 4.1 Principles
1. **Clear before clever.** If a joke costs a second of understanding, cut it.
2. **Numbers over adjectives.** "$2.40 per 1,000 views" beats "great rates". Say how many, how much, by when.
3. **Calm where money is committed, bright where money lands.** Funding, bidding, cash-out and legal moments are precise and quiet. Cleared money, approvals and tier-ups get a little warmth and motion.
4. **Say what is true.** Day-one Flow Score and Hook Score are checklist scores; the UI says so. Estimated is never styled as tracked. Demo data is labelled.
5. **Respect the person.** No guilt, no streak shaming, no fake countdowns, no "last chance" that is not true. Slack beats streaks.
6. **Plain English.** Contractions are fine. No jargon without a one-line gloss. No exclamation marks, with one allowance: a single payout celebration may carry one.

### 4.2 Vocabulary (use these exact words in UI, code and docs)
**bounty** (never campaign, gig), **creator** (never influencer), **brand** or **app team** (the buyer), **submission**, **post**, **payout**, **pending → cleared**, **Wallet**, **Studio**, **Market**, **rate card**, **Daily Drop**, **Crews**, **Tournaments**, tiers **Bronze → Silver → Gold → Platinum → Elite**, **Hook Score**, **Flow Score**, **Flo**, **Spec Market**, **Winner promotion**. Sentence case everywhere in UI (not Title Case), except product names above.

### 4.3 Earnings and money language (FTC-careful, mandatory)
- Show the **typical (median)** beside any top-earner example, in the same view, in the same size class. "Top creator $1,940 · typical $212 (median, last 30 days)".
- Never: "guaranteed", "passive income", "quit your job", "easy money", "unlimited earnings", "make $X a day".
- Earnings cards and share art always carry the median line and link to a proof page.
- Money is formatted at the edge only (`$1,284.50`), tabular, Mint when it is earned and up, Rose with a minus sign when it is down, Lagoon with a clock when pending. Always show pending and cleared as separate numbers.
- Disclosure is automatic: every creator posting flow includes `#ad` and the brand's wording.
- Scores: "Checklist score: B. It gets smarter as bounties settle." Never "AI predicts your video will go viral".

### 4.4 Do and don't
| Do | Don't |
|---|---|
| $2.40 per 1,000 views, plus $1.50 per trial started. | Earn insane money with this one trick! |
| Checklist score: B. Strong open, app shows at 0:14. | Our AI knows what will go viral. |
| Pending $186.20 · clears Fri 2:00 PM | Money coming soon! |
| Not approved: the app isn't on screen in the first 3 seconds. Fix and resubmit. | Your video was rejected. |
| This bounty needs $5,000 in escrow. You have $3,140. | Insufficient funds. |
| 5 spots left in today's drop. | Hurry, almost gone! (unless it is true inventory) |
| Typical creator, last 30 days: $212 (median) | Creators make thousands. |

### 4.5 Payout and celebration moments
Cleared money, approvals and tier-ups may be a little warm: a spring on the number, mint glow, one haptic on iOS, no confetti. Funding, bidding and spending never celebrate (see `docs/research/design-ux.md` principle 6).

### 4.6 Twenty-five microcopy samples
**Buttons**
1. Start a bounty *(brand primary)*
2. Fund $5,000 *(shows the amount; never just "Pay")*
3. Make a take *(creator primary in Studio)*
4. Submit for review
5. Cash out $240.00 *(secondary line: "Instant · $2.40 fee" or "Free · Fri 2:00 PM")*
6. Claim a spot *(Daily Drop, secondary line: "5 left")*

**Empty states**
7. Bounties: *"Nothing matches yet. Widen your niches, or check back when the Daily Drop lands at 2 PM."*
8. Wallet: *"Your first payout lands here. Pending money shows the day it clears."*
9. Review queue: *"Inbox zero. Every submission has a decision."*
10. Studio: *"No drafts yet. Record a take and Hook Score checks the first 3 seconds before you post."*

**Errors**
11. Upload: *"Upload stopped at 62%. Your take is saved on this phone. Try again."*
12. Funding: *"This bounty needs $5,000 in escrow. You have $3,140. Add $1,860 to go live."*
13. Rejected submission: *"Not approved: the app isn't on screen in the first 3 seconds. Fix and resubmit."*
14. Offline: *"You're offline. Everything you made is saved. We'll sync when you're back."*
15. Payout hold: *"This payout is held for review. It clears Fri 2:00 PM if nothing changes. See why."*

**Push notifications**
16. *Payout flowd* · "$62.40 cleared to your Wallet."
17. *Daily Drop is live* · "6 new bounties. First come, first filled."
18. *Approved* · "Nap Nest approved your take. Post it with #ad and the brand tag to start the views window."
19. *Views are counting* · "12,480 views so far on Nap Nest. $29.95 pending, clears Fri."
20. *Promoted* · "Nap Nest is running your video as an ad. You earn a commission on ad results."

**Payout celebration**
21. Hero: **$240.00** *flowd.* · "Cleared. It's in your Wallet now." · [Share earnings card] *(card carries the median line)*
22. Tier-up: **You're Gold.** · "Higher-paying bounties show up for you first now."
23. Brand: **Bounty filled.** · "214 posts, 3,310 installs, $2.58 per install. See what worked."

**Flo (copilot) and tooltips**
24. Flo: *"Checklist score: B. Strong open. Move the app reveal from 0:14 to 0:03 and re-check."*
25. Tooltip on Flow Score: *"A checklist score from your first 3 seconds, captions, disclosure and pacing. It gets smarter as bounties settle."*

---

## 5. Logo

### 5.1 Concept
One continuous **ribbon** of constant width enters from the lower left like a stream, sweeps up in a single S into the stem, and rolls over into the hook. A straight crossbar crosses it. It reads as a lowercase **f**, as flow, and as a drop of liquid being drawn. Three things make it ownable: the foot (the tail that enters from the left), the confident single-weight stroke, and the **mint crossbar**.

**The logo is flat. No gradients, glows, shadows or glass effects, anywhere in the logo or app icon.** Colour is one structural colour (ink on light, ice on dark) plus one accent: the crossbar of the f is **mint**, the colour of money. That one bar is the whole colour story. (The product UI still uses the aurora and Flow gradient as atmosphere; the logo never does.) Flat also keeps it distinct from the blurple marks of Stripe, Discord and Linear, and from Facebook's blue-tile f.

The **wordmark** is custom monoline lowercase, drawn as stroked paths with round caps and joins (stroke 17 on a 104 ascender). Its f is the same ribbon, condensed, and carries the same mint crossbar. No font is required to render either. The **lockup** is the full-colour wordmark (ink or ice letters, mint crossbar on the f): the mark *is* the f, so no second f is added. The **stacked lockup** puts the app tile (flat tile, mark inside) above the wordmark.

### 5.2 Files (`brand/logo/`)
Everything is generated by `node brand/src/build-logos.mjs` (SVG) and `node brand/src/rasterize.mjs` (PNG, uses Chrome or Edge; set `CHROME_PATH` to override).

| Need | Use |
|---|---|
| Symbol on its own (avatar, hero art, loading) | `flowd-mark-on-dark.svg` (ice + mint) · `flowd-mark-on-light.svg` (ink + mint) · `flowd-mark.svg` (adapts to OS scheme) · `flowd-mark-mono-light.svg` (white) · `flowd-mark-mono-dark.svg` (ink) · `flowd-mark-1024.png` |
| Wordmark only (one colour, no accent) | `flowd-wordmark.svg` (adapts to light/dark colour scheme) · `-on-dark` · `-mono-light` · `-mono-dark` |
| Primary lockup (nav, footer, emails) | `flowd-lockup-on-dark.svg` / `flowd-lockup-on-light.svg` (explicit) · `flowd-lockup.svg` (adapts to `prefers-color-scheme`) · `-mono-light` / `-mono-dark` · PNG: `flowd-lockup-on-dark.png`, `flowd-lockup-on-light.png` |
| Stacked lockup (splash, posters, centre layouts) | `flowd-lockup-stacked*.svg` (same variants) · PNG on-dark/on-light |
| App icon (iOS asset) | `app-icon-1024.png` (default) · `app-icon-dark-1024.png` · `app-icon-tinted-1024.png` |
| App icon layers (iOS 26 Icon Composer) | `app-icon-layer-bg-1024.png` (opaque) + `app-icon-layer-fg-1024.png` (mark on transparent); SVG sources alongside |
| Rounded preview (README, store pages) | `app-icon-rounded.svg`, `app-icon-rounded-512.png`. Never use as the iOS asset |
| Favicon and PWA | `favicon.svg`, `favicon.ico` (16/32/48), `favicon-16/32/48.png`, `favicon-180.png` (apple-touch-icon), `favicon-192.png`, `favicon-512.png` |
| Social card | `og-image.svg` and `og-image.png` (1200x630) |

The adaptive files (`flowd-wordmark.svg`, `flowd-lockup.svg`) follow the **OS** colour scheme via a `prefers-color-scheme` media query inside the SVG. They do not follow an in-app theme toggle. In the product, pick the explicit `-on-dark` / `-on-light` file from the active theme (or inline the SVG).

| File | Size |
|---|---|
| `app-icon-1024.png` | 15 KB |
| `app-icon-dark-1024.png` | 15 KB |
| `app-icon-dark.svg` | 0.6 KB |
| `app-icon-layer-bg-1024.png` | 4 KB |
| `app-icon-layer-bg.svg` | 0.3 KB |
| `app-icon-layer-fg-1024.png` | 14 KB |
| `app-icon-layer-fg.svg` | 0.6 KB |
| `app-icon-rounded-512.png` | 10 KB |
| `app-icon-rounded.svg` | 0.7 KB |
| `app-icon-tinted-1024.png` | 13 KB |
| `app-icon-tinted.svg` | 0.7 KB |
| `app-icon.svg` | 0.7 KB |
| `favicon-16.png` | 0 KB |
| `favicon-180.png` | 2 KB |
| `favicon-192.png` | 2 KB |
| `favicon-32.png` | 1 KB |
| `favicon-48.png` | 1 KB |
| `favicon-512.png` | 7 KB |
| `favicon.ico` | 2 KB |
| `favicon.svg` | 0.6 KB |
| `flowd-lockup-mono-dark.svg` | 0.8 KB |
| `flowd-lockup-mono-light.svg` | 0.8 KB |
| `flowd-lockup-on-dark.png` | 32 KB |
| `flowd-lockup-on-dark.svg` | 0.8 KB |
| `flowd-lockup-on-light.png` | 34 KB |
| `flowd-lockup-on-light.svg` | 0.8 KB |
| `flowd-lockup-stacked-mono-dark.svg` | 1.4 KB |
| `flowd-lockup-stacked-mono-light.svg` | 1.4 KB |
| `flowd-lockup-stacked-on-dark.png` | 29 KB |
| `flowd-lockup-stacked-on-dark.svg` | 1.2 KB |
| `flowd-lockup-stacked-on-light.png` | 30 KB |
| `flowd-lockup-stacked-on-light.svg` | 1.2 KB |
| `flowd-lockup-stacked.svg` | 1.6 KB |
| `flowd-lockup.svg` | 1.2 KB |
| `flowd-mark-1024.png` | 18 KB |
| `flowd-mark-mono-dark.svg` | 0.5 KB |
| `flowd-mark-mono-light.svg` | 0.5 KB |
| `flowd-mark-on-dark.svg` | 0.5 KB |
| `flowd-mark-on-light.svg` | 0.5 KB |
| `flowd-mark.svg` | 0.9 KB |
| `flowd-wordmark-mono-dark.svg` | 0.8 KB |
| `flowd-wordmark-mono-light.svg` | 0.8 KB |
| `flowd-wordmark-on-dark.svg` | 0.8 KB |
| `flowd-wordmark.svg` | 0.9 KB |
| `og-image.png` | 865 KB |
| `og-image.svg` | 89.3 KB |

### 5.3 Clear space and minimum size
- **Clear space = x**, where x is the height of the lowercase **o** in the wordmark (about 0.56 of the lockup's height). Keep x free on all four sides of the lockup and wordmark. For the mark alone, keep 0.5 x the mark's height free.
- **Minimum sizes:** lockup 96 px wide (25 mm in print); wordmark 64 px wide; mark 16 px (below 24 px use `favicon.svg`, the tile with a heavier stroke).
- Prefer the lockup in headers, the mark in tight spaces (tab titles, avatars), the wordmark where the mark already appears nearby.

### 5.4 Colour on backgrounds
| Background | Use |
|---|---|
| Abyss / dark UI, aurora | `-on-dark` lockup (ice wordmark, mint f-bar) |
| Pearl / light UI, pastel aurora | `-on-light` lockup (ink wordmark, mint f-bar) |
| Photography, video, noisy art | `-mono-light` (white) or `-mono-dark` (ink), whichever clears 4.5:1 |
| Gradient or aurora hero art, saturated surfaces | `-mono-light` (white) when the mint bar would clash; the `-on-dark` lockup is fine on the dark aurora |
| One-colour print, embossing | `-mono-dark` / `-mono-light` |

### 5.5 Misuse (never)
Add a gradient (the logo is flat) · recolour the mint bar · stretch, squash or skew · add shadows, glows, outlines or bevels · rotate or tilt · rearrange mark and wordmark · set the wordmark in a font · place on low-contrast or busy backgrounds · put the mint bar on a mint or green background · animate the mark except the approved ribbon draw-on (stroke-dashoffset, 600 ms `emphasized`, reduced motion: fade).

### 5.6 Avatars and brand marks for users
User and brand avatars are **generated** (never stock): gradient disc seeded by the handle (pick one of the eight gradient pairs from the Flow/Money/Ember/Sun/Flo families), two initials in Bricolage 800 at 42% of the diameter, 1.5 px inner rim. Fictional brands in demo data get a rounded-square generated glyph, never a real app icon.

---

## 6. Colour

### 6.1 Principles
- **Ramps, not swatches.** One neutral (abyss), one accent family (ultraviolet → azure → lagoon), four reserved signals (mint, ember, sun, rose). Each ramp is built in **OKLCH** with a constant hue, even steps in perceived lightness, and chroma scaled to that hue's own sRGB gamut. The ramps are reproducible: `node packages/tokens/scripts/derive-ramps.mjs --check`.
- **Semantic tokens only in product code.** Components use `bg`, `surface`, `fg-muted`, `mint`, `rim`... never a ramp step. Primitives exist for art, gradients and tokens themselves.
- **One colour, one meaning** (within 15° of hue): azure/ultraviolet = interactive and Flo; mint = money earned or cleared; lagoon = pending and info; ember = urgency; sun = Elite and featured; rose = danger and negative money. Colour is never the only cue: money states also carry a glyph (check, clock, minus).
- **Base names are text-safe.** `mint`, `ember`, `accent`... are AA-verified as text or icon colour on every surface. Fills are `*-solid` with their own `on-*` text colour. Tints are `*-soft`.
- **Fill one action per view.** One primary gradient button per view; peers stay neutral glass or ghost. Tint the glass, not the label.
- **Dark and light are both designed.** Dark is the default; light is pearl/ice with a pastel aurora. Theme switching is `data-theme="dark|light"` on `<html>`; with no attribute the OS preference wins and dark is the fallback.

### 6.2 Brand constants
| Role | Dark | Light |
|---|---|---|
| Canvas (`bg`) | `#030921` abyss | `#F3F7FF` pearl |
| Text (`fg`) | `#F3F7FF` | `#08112A` |
| Primary fill (`accent-solid`) | `#0E62E1` azure 600, white text | `#0E62E1` |
| Flow gradient | `#784FFC` → `#307DFD` → `#17D2E7` at 0 / 52 / 100 %, 135° | same |
| Money (`mint`) | `#18DF9B` (text), `#18DF9B` (fill) | `#146949` (text), `#20B27C` (fill) |
| Urgency (`ember`) | `#FBA584` (text), `#FE7A43` (fill) | `#983E15` (text), `#D95715` (fill) |
| Elite / featured (`sun`) | `#F8C216` (text), `#F8C216` (fill) | `#765D13` (text), `#F8C216` (fill) |
| Danger (`rose`) | `#FA909B` (text), `#FD5170` (fill) | `#B01E42` (text), `#DF1B52` (fill) |
| Pending / info (`info`) | `#17D2E7` (text), `#17D2E7` (fill) | `#156671` (text), `#1FA7B8` (fill) |

### 6.3 Dark theme tokens
Contrast column is the ratio of the token's colour as text on `bg / surface / glass L1 / L2 / L3`, measured on the worst-case backdrop (see 6.6). AA needs 4.5:1 for body text; every readable-text token clears it everywhere in the table.

| Token | Value | Role | Contrast (bg / surface / L1 / L2 / L3, worst-case glass) |
|---|---|---|---|
| `bg` | `#030921` | Page canvas under the aurora | n/a |
| `bg-elevated` | `#08112A` | Raised canvas (headers, drawers) | n/a |
| `bg-sunken` | `#010419` | Wells, code blocks, video letterbox | n/a |
| `surface` | `#101A34` | Solid card/panel, popover fallback, table rows | n/a |
| `surface-raised` | `#18233D` | Solid raised surface (menus, sticky headers) | n/a |
| `surface-field` | `rgba(255, 255, 255, 0.06)` | Input and chip fill; sits ON glass (a fill, not more glass) | n/a |
| `surface-hover` | `rgba(255, 255, 255, 0.06)` | Hover wash on rows and buttons | n/a |
| `surface-active` | `rgba(255, 255, 255, 0.10)` | Pressed / selected wash, active tab lens | n/a |
| `surface-glass-1` | `rgba(9, 16, 40, 0.72)` | L1 quiet-glass fill (carries the legibility scrim) | n/a |
| `surface-glass-2` | `rgba(14, 22, 52, 0.68)` | L2 glass fill | n/a |
| `surface-glass-3` | `rgba(7, 12, 32, 0.80)` | L3 sheet fill | n/a |
| `scrim` | `rgba(2, 5, 16, 0.62)` | Behind L3 sheets and modals | n/a |
| `fg` | `#F3F7FF` | Primary text and numerals | 18.4 / 16.0 / 11.4 / 10.3 / 14.9 |
| `fg-muted` | `#C0CAE0` | Secondary text | 12.0 / 10.5 / 7.4 / 6.7 / 9.7 |
| `fg-subtle` | `#A3AFCB` | Tertiary text: metadata, helper, placeholder | 9.0 / 7.8 / 5.5 / 5.0 / 7.3 |
| `fg-disabled` | `#5F6B8A` | Disabled only (exempt from AA) | n/a |
| `fg-inverse` | `#030921` | Text on bright solid fills | n/a |
| `on-accent` | `#FFFFFF` | Text on accent-solid | 5.5:1 on accent-solid |
| `rim` | `rgba(255, 255, 255, 0.14)` | Hairline border | n/a |
| `rim-strong` | `rgba(255, 255, 255, 0.28)` | Stronger border, selected outline | n/a |
| `divider` | `rgba(255, 255, 255, 0.08)` | Row separators | n/a |
| `focus-ring` | `#73A5F9` | Keyboard focus ring (3:1 on bg and surface) | 8.0:1 on bg |
| `accent-solid` | `#0E62E1` | Primary fill under white text | n/a |
| `accent-bright` | `#307DFD` | Icons, strokes, indicators, glows | 5.1:1 on bg |
| `accent-solid-hover` | `#0D6CF8` | Hover for accent-solid | n/a |
| `accent-solid-pressed` | `#1150B3` | Pressed for accent-solid | n/a |
| `accent` | `#7CABF9` | Links, active text, interactive text (AA-safe) | 8.5 / 7.4 / 5.3 / 4.8 / 6.9 |
| `accent-soft` | `rgba(48, 125, 253, 0.11)` | Tinted pill / selected background | n/a |
| `violet-solid` | `#784FFC` | Violet fill | n/a |
| `violet` | `#BCB8F3` | Flo, the copilot (AA-safe text) | 10.6 / 9.3 / 6.6 / 5.9 / 8.6 |
| `violet-soft` | `rgba(120, 79, 252, 0.20)` | Violet pill background | n/a |
| `on-violet` | `#FFFFFF` | Text on violet-solid | 4.9:1 on violet-solid |
| `mint-solid` | `#18DF9B` | Mint fill (earned badge, success bar) | n/a |
| `mint` | `#18DF9B` | Money going up, cleared, earned (AA-safe text/icon) | 11.3 / 9.9 / 7.0 / 6.4 / 9.2 |
| `mint-soft` | `rgba(24, 223, 155, 0.16)` | Mint pill background | n/a |
| `on-mint` | `#030921` | Text on mint-solid | 11.3:1 on mint-solid |
| `ember-solid` | `#FE7A43` | Ember fill | n/a |
| `ember` | `#FBA584` | Urgency, Daily Drop, hot CTA text | 10.2 / 8.9 / 6.3 / 5.7 / 8.3 |
| `ember-soft` | `rgba(254, 122, 67, 0.17)` | Ember pill background | n/a |
| `on-ember` | `#030921` | Text on ember-solid | 7.6:1 on ember-solid |
| `sun-solid` | `#F8C216` | Sun fill | n/a |
| `sun` | `#F8C216` | Elite, featured text | 11.9 / 10.4 / 7.4 / 6.7 / 9.7 |
| `sun-soft` | `rgba(248, 194, 22, 0.16)` | Sun pill background | n/a |
| `on-sun` | `#030921` | Text on sun-solid | 11.9:1 on sun-solid |
| `rose-solid` | `#FD5170` | Rose fill | n/a |
| `rose` | `#FA909B` | Danger, rejected, negative money text | 8.9 / 7.8 / 5.5 / 5.0 / 7.3 |
| `rose-soft` | `rgba(253, 81, 112, 0.17)` | Rose pill background | n/a |
| `on-rose` | `#030921` | Text on rose-solid | 6.2:1 on rose-solid |
| `info-solid` | `#17D2E7` | Info/pending fill | n/a |
| `info` | `#17D2E7` | Pending, info, in-flight money (AA-safe text) | 10.7 / 9.4 / 6.6 / 6.0 / 8.7 |
| `info-soft` | `rgba(23, 210, 231, 0.15)` | Info pill background | n/a |
| `on-info` | `#030921` | Text on info-solid | 10.7:1 on info-solid |

### 6.4 Light theme tokens
| Token | Value | Role | Contrast (bg / surface / L1 / L2 / L3, worst-case glass) |
|---|---|---|---|
| `bg` | `#F3F7FF` | Page canvas under the aurora | n/a |
| `bg-elevated` | `#FFFFFF` | Raised canvas (headers, drawers) | n/a |
| `bg-sunken` | `#ECF0F9` | Wells, code blocks, video letterbox | n/a |
| `surface` | `#FFFFFF` | Solid card/panel, popover fallback, table rows | n/a |
| `surface-raised` | `#FBFCFF` | Solid raised surface (menus, sticky headers) | n/a |
| `surface-field` | `rgba(8, 17, 42, 0.05)` | Input and chip fill; sits ON glass (a fill, not more glass) | n/a |
| `surface-hover` | `rgba(8, 17, 42, 0.05)` | Hover wash on rows and buttons | n/a |
| `surface-active` | `rgba(8, 17, 42, 0.09)` | Pressed / selected wash, active tab lens | n/a |
| `surface-glass-1` | `rgba(255, 255, 255, 0.62)` | L1 quiet-glass fill (carries the legibility scrim) | n/a |
| `surface-glass-2` | `rgba(255, 255, 255, 0.54)` | L2 glass fill | n/a |
| `surface-glass-3` | `rgba(255, 255, 255, 0.84)` | L3 sheet fill | n/a |
| `scrim` | `rgba(8, 17, 42, 0.34)` | Behind L3 sheets and modals | n/a |
| `fg` | `#08112A` | Primary text and numerals | 17.4 / 18.7 / 15.2 / 17.0 / 16.0 |
| `fg-muted` | `#3F4966` | Secondary text | 8.3 / 8.9 / 7.2 / 8.1 / 7.7 |
| `fg-subtle` | `#5B6684` | Tertiary text: metadata, helper, placeholder | 5.3 / 5.7 / 4.6 / 5.2 / 4.9 |
| `fg-disabled` | `#9AA4BC` | Disabled only (exempt from AA) | n/a |
| `fg-inverse` | `#FFFFFF` | Text on bright solid fills | n/a |
| `on-accent` | `#FFFFFF` | Text on accent-solid | 5.5:1 on accent-solid |
| `rim` | `rgba(8, 17, 42, 0.10)` | Hairline border | n/a |
| `rim-strong` | `rgba(8, 17, 42, 0.22)` | Stronger border, selected outline | n/a |
| `divider` | `rgba(8, 17, 42, 0.07)` | Row separators | n/a |
| `focus-ring` | `#0E62E1` | Keyboard focus ring (3:1 on bg and surface) | 5.1:1 on bg |
| `accent-solid` | `#0E62E1` | Primary fill under white text | n/a |
| `accent-bright` | `#0E62E1` | Icons, strokes, indicators, glows | 5.1:1 on bg |
| `accent-solid-hover` | `#1150B3` | Hover for accent-solid | n/a |
| `accent-solid-pressed` | `#113E88` | Pressed for accent-solid | n/a |
| `accent` | `#1150B3` | Links, active text, interactive text (AA-safe) | 6.9 / 7.4 / 6.0 / 6.8 / 6.4 |
| `accent-soft` | `rgba(14, 98, 225, 0.10)` | Tinted pill / selected background | n/a |
| `violet-solid` | `#671AF3` | Violet fill | n/a |
| `violet` | `#531EC3` | Flo, the copilot (AA-safe text) | 8.4 / 9.0 / 7.3 / 8.2 / 7.7 |
| `violet-soft` | `rgba(103, 26, 243, 0.10)` | Violet pill background | n/a |
| `on-violet` | `#FFFFFF` | Text on violet-solid | 7.0:1 on violet-solid |
| `mint-solid` | `#20B27C` | Mint fill (earned badge, success bar) | n/a |
| `mint` | `#146949` | Money going up, cleared, earned (AA-safe text/icon) | 6.2 / 6.7 / 5.4 / 6.1 / 5.7 |
| `mint-soft` | `rgba(32, 178, 124, 0.16)` | Mint pill background | n/a |
| `on-mint` | `#030921` | Text on mint-solid | 7.3:1 on mint-solid |
| `ember-solid` | `#D95715` | Ember fill | n/a |
| `ember` | `#983E15` | Urgency, Daily Drop, hot CTA text | 6.4 / 6.9 / 5.6 / 6.3 / 5.9 |
| `ember-soft` | `rgba(217, 87, 21, 0.06)` | Ember pill background | n/a |
| `on-ember` | `#030921` | Text on ember-solid | 5.0:1 on ember-solid |
| `sun-solid` | `#F8C216` | Sun fill | n/a |
| `sun` | `#765D13` | Elite, featured text | 5.8 / 6.3 / 5.1 / 5.7 / 5.4 |
| `sun-soft` | `rgba(248, 194, 22, 0.22)` | Sun pill background | n/a |
| `on-sun` | `#030921` | Text on sun-solid | 11.9:1 on sun-solid |
| `rose-solid` | `#DF1B52` | Rose fill | n/a |
| `rose` | `#B01E42` | Danger, rejected, negative money text | 6.3 / 6.8 / 5.5 / 6.1 / 5.8 |
| `rose-soft` | `rgba(223, 27, 82, 0.10)` | Rose pill background | n/a |
| `on-rose` | `#FFFFFF` | Text on rose-solid | 4.8:1 on rose-solid |
| `info-solid` | `#1FA7B8` | Info/pending fill | n/a |
| `info` | `#156671` | Pending, info, in-flight money (AA-safe text) | 6.2 / 6.6 / 5.4 / 6.0 / 5.7 |
| `info-soft` | `rgba(31, 167, 184, 0.14)` | Info pill background | n/a |
| `on-info` | `#030921` | Text on info-solid | 6.8:1 on info-solid |

### 6.5 Primitive ramps
Used by gradients, art and the token build. 500 is the signature step of each hue.

- **ultraviolet**: 50 `#F6F6F9` · 100 `#EDECF5` · 200 `#D7D7F1` · 300 `#BCB8F3` · 400 `#988BF8` · 500 `#784FFC` · 600 `#671AF3` · 700 `#531EC3` · 800 `#401D96` · 900 `#301970` · 950 `#1F124A`
- **azure**: 50 `#F5F7F9` · 100 `#EAEFF6` · 200 `#D1DEF2` · 300 `#ABC7F4` · 400 `#73A5F9` · 500 `#307DFD` · 600 `#0E62E1` · 700 `#1150B3` · 800 `#113E88` · 900 `#0E2F65` · 950 `#081E41`
- **lagoon**: 50 `#F2F8F9` · 100 `#E7F6F8` · 200 `#CDF1F7` · 300 `#9EECF8` · 400 `#37E4FA` · 500 `#17D2E7` · 600 `#1FA7B8` · 700 `#22828F` · 800 `#1E5F68` · 900 `#174147` · 950 `#0C2327`
- **mint**: 50 `#F1F9F4` · 100 `#E5F8EE` · 200 `#C7F7DE` · 300 `#89F9C5` · 400 `#39F1AB` · 500 `#18DF9B` · 600 `#20B27C` · 700 `#238A61` · 800 `#1F6447` · 900 `#174531` · 950 `#0C251A`
- **ember**: 50 `#F9F6F5` · 100 `#F7EFEC` · 200 `#F5DFD7` · 300 `#F7C8B7` · 400 `#FBA584` · 500 `#FE7A43` · 600 `#D95715` · 700 `#AA4619` · 800 `#7D3617` · 900 `#592611` · 950 `#341509`
- **sun**: 50 `#F9F7F0` · 100 `#F9F3E6` · 200 `#F8ECCF` · 300 `#FAE2A9` · 400 `#FCD267` · 500 `#F8C216` · 600 `#C59B1D` · 700 `#987820` · 800 `#6D571C` · 900 `#4A3B15` · 950 `#261E09`
- **rose**: 50 `#F9F6F6` · 100 `#F7EDEE` · 200 `#F4DADB` · 300 `#F6BDC1` · 400 `#FA909B` · 500 `#FD5170` · 600 `#DF1B52` · 700 `#B01E42` · 800 `#831C32` · 900 `#5F1624` · 950 `#390E15`
- **abyss**: 50 `#F3F7FF` · 100 `#ECF0F9` · 200 `#DEE3EE` · 300 `#C5CEE2` · 400 `#9BA8C3` · 500 `#74809A` · 600 `#505D7A` · 700 `#374360` · 800 `#212D48` · 850 `#18233D` · 900 `#101A34` · 925 `#0C162F` · 950 `#08112A` · 975 `#030921` · 1000 `#010419`

### 6.6 How contrast on glass is measured
A flat "foreground vs background" ratio proves nothing when text sits on translucent glass. The build measures text against what is really behind it:
1. It samples the **actual aurora field** (the CSS radial gradients in `tokens.json`) on a pixel grid at four viewport sizes and keeps the **brightest** pixel in dark theme (light text) or the **darkest** in light theme (dark text).
2. It composites each glass layer the way CSS paints it: backdrop → `saturate()` → translucent fill → sheen gradient. L2 is measured **on top of L1** (the maximum nesting). L3 is measured over its scrim.
3. Every readable-text token must clear its minimum on every backdrop; `fg` ≥ 7:1, everything else ≥ 4.5:1. The build fails (exit 1) if any of the 193 checked pairs misses.

**Dark theme backdrops**

| Backdrop | Hex | Built as |
|---|---|---|
| `bg` | `#030921` | semantic bg |
| `surface` | `#101A34` | semantic surface |
| `aurora` | `#2843A4` | brightest pixel of the aurora field at 1440x900, 390x844, 1920x1080, 768x1024 |
| `L1` | `#243265` | glass L1 over that pixel: saturate, fill, sheen |
| `L2` | `#2F3A62` | glass L2 stacked on that L1 (the maximum nesting) |
| `L3` | `#19203B` | glass L3 over scrim over that pixel |

**Light theme backdrops**

| Backdrop | Hex | Built as |
|---|---|---|
| `bg` | `#F3F7FF` | semantic bg |
| `surface` | `#FFFFFF` | semantic surface |
| `aurora` | `#C2BDF7` | darkest pixel of the aurora field (same viewports) |
| `L1` | `#E8E5FF` | glass L1 over that pixel: saturate, fill, sheen |
| `L2` | `#F5F3FF` | glass L2 stacked on that L1 (the maximum nesting) |
| `L3` | `#EDEDF7` | glass L3 over scrim over that pixel |

**Text tokens on each backdrop (dark)**

| Token | Hex | Min | bg | surface | aurora | L1 | L2 | L3 |
|---|---|---|---|---|---|---|---|---|
| `fg` | `#F3F7FF` | 7 | 18.4 | 16.0 | 8.1 | 11.4 | 10.3 | 14.9 |
| `fg-muted` | `#C0CAE0` | 4.5 | 12.0 | 10.5 | 5.3 | 7.4 | 6.7 | 9.7 |
| `fg-subtle` | `#A3AFCB` | 4.5 | 9.0 | 7.8 | - | 5.5 | 5.0 | 7.3 |
| `accent` | `#7CABF9` | 4.5 | 8.5 | 7.4 | - | 5.3 | 4.8 | 6.9 |
| `violet` | `#BCB8F3` | 4.5 | 10.6 | 9.3 | - | 6.6 | 5.9 | 8.6 |
| `mint` | `#18DF9B` | 4.5 | 11.3 | 9.9 | - | 7.0 | 6.4 | 9.2 |
| `ember` | `#FBA584` | 4.5 | 10.2 | 8.9 | - | 6.3 | 5.7 | 8.3 |
| `sun` | `#F8C216` | 4.5 | 11.9 | 10.4 | - | 7.4 | 6.7 | 9.7 |
| `rose` | `#FA909B` | 4.5 | 8.9 | 7.8 | - | 5.5 | 5.0 | 7.3 |
| `info` | `#17D2E7` | 4.5 | 10.7 | 9.4 | - | 6.6 | 6.0 | 8.7 |

**Text tokens on each backdrop (light)**

| Token | Hex | Min | bg | surface | aurora | L1 | L2 | L3 |
|---|---|---|---|---|---|---|---|---|
| `fg` | `#08112A` | 7 | 17.4 | 18.7 | 10.6 | 15.2 | 17.0 | 16.0 |
| `fg-muted` | `#3F4966` | 4.5 | 8.3 | 8.9 | 5.0 | 7.2 | 8.1 | 7.7 |
| `fg-subtle` | `#5B6684` | 4.5 | 5.3 | 5.7 | - | 4.6 | 5.2 | 4.9 |
| `accent` | `#1150B3` | 4.5 | 6.9 | 7.4 | - | 6.0 | 6.8 | 6.4 |
| `violet` | `#531EC3` | 4.5 | 8.4 | 9.0 | - | 7.3 | 8.2 | 7.7 |
| `mint` | `#146949` | 4.5 | 6.2 | 6.7 | - | 5.4 | 6.1 | 5.7 |
| `ember` | `#983E15` | 4.5 | 6.4 | 6.9 | - | 5.6 | 6.3 | 5.9 |
| `sun` | `#765D13` | 4.5 | 5.8 | 6.3 | - | 5.1 | 5.7 | 5.4 |
| `rose` | `#B01E42` | 4.5 | 6.3 | 6.8 | - | 5.5 | 6.1 | 5.8 |
| `info` | `#156671` | 4.5 | 6.2 | 6.6 | - | 5.4 | 6.0 | 5.7 |

Raw aurora is checked only for `fg` and `fg-muted`; subtle and coloured text must sit on `bg`, `surface` or glass. Over arbitrary photos or generated thumbnails, text must sit on a media scrim (`.fd-media-scrim`, 80% ink at the bottom fading to 0) or on glass using the heavier **fill over media** value. The complete pair list is in `packages/tokens/dist/contrast-report.md`.

### 6.7 Gradients
| Name | Angle | Stops | Use |
|---|---|---|---|
| `flow` | 135° | #784FFC 0%, #307DFD 52%, #17D2E7 100% | Signature. Decorative, strokes, hero art, gradient text. Never put body text on the cyan end. |
| `flowButton` | 135° | #671AF3 0%, #0E62E1 100% | Primary CTA fill. White text clears AA at both ends. |
| `flowSoft` | 135° | rgba(120, 79, 252, 0.30) 0%, rgba(48, 125, 253, 0.22) 52%, rgba(23, 210, 231, 0.18) 100% | Tinted glass / selected states. |
| `money` | 135° | #39F1AB 0%, #37E4FA 100% | Earnings glow, payout celebration, wallet hero. Ink text only. |
| `ember` | 135° | #F8C216 0%, #FE7A43 55%, #FD5170 100% | Daily Drop, urgent CTAs. Ink text only. |
| `sun` | 135° | #FAE2A9 0%, #F8C216 55%, #C59B1D 100% | Featured bounties, Elite accents. |
| `flo` | 135° | #988BF8 0%, #671AF3 100% | Flo, the in-app copilot. Always violet. |

Rules: the Flow gradient is for brand moments (logo, hero art, progress, gradient words, selected states), never for body text and never behind small white text on its cyan end. **Gradient text** is for one word or phrase per view. Mint gradient is for earnings glow; Ember gradient is for the single most urgent action.

### 6.8 Money states
| State | Colour | Cue | Example |
|---|---|---|---|
| Earned, cleared | `mint` | check | $62.40 cleared |
| Pending | `info` (lagoon) | clock, and the clear date | $186.20 · clears Fri 2:00 PM |
| Down, refunded, clawed back | `rose` | minus sign | −$12.00 |
| Escrowed (brand) | `fg` | lock | $5,000 in escrow |
| Bonus / CPA | `mint` | plus | + $1.50 per trial |

### 6.9 Chart palette (validated)
Fixed hue order, never cycled; the ninth series folds into "Other", a facet or an encoding. Checked with the dataviz skill's validator logic inside the token build. For scatter, bubble, map and small-multiple forms (any two marks can touch), use only the first three slots.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | azure | `#186FE2` | `#1A74EC` |
| 2 | ember | `#DC6320` | `#E56722` |
| 3 | lagoon | `#28A3B6` | `#29A6BC` |
| 4 | rose | `#DE3A46` | `#F04C55` |
| 5 | violet | `#6032BB` | `#9778F7` |
| 6 | sun | `#D7AB2C` | `#B08B22` |
| 7 | magenta | `#D25BCB` | `#C54EBE` |
| 8 | green | `#197F1B` | `#1C891E` |

| Set | Light | Dark |
|---|---|---|
| Sequential (azure, light to dark = low to high) | `#D1DEF2` `#ABC7F4` `#73A5F9` `#307DFD` `#0E62E1` `#1150B3` `#113E88` | `#113E88` `#1150B3` `#0E62E1` `#307DFD` `#73A5F9` `#ABC7F4` `#D1DEF2` |
| Ordinal (tiers, funnel stages) | `#73A5F9` `#307DFD` `#0E62E1` `#1150B3` `#113E88` | `#1150B3` `#0E62E1` `#307DFD` `#73A5F9` `#ABC7F4` |
| Diverging (azure below, ember above) | `#1150B3` `#307DFD` `#ABC7F4` `#E3E7F0` `#F7C8B7` `#FE7A43` `#AA4619` | `#307DFD` `#1150B3` `#0E2F65` `#2A3452` `#592611` `#AA4619` `#FE7A43` |
| Status: good / warning / serious / critical | `#20B27C` `#F8C216` `#FE7A43` `#DF1B52` | `#18DF9B` `#F8C216` `#FE7A43` `#FD5170` |
| Surface / grid / axis | `#FFFFFF` `rgba(8, 17, 42, 0.08)` `rgba(8, 17, 42, 0.22)` | `#101A34` `rgba(255, 255, 255, 0.08)` `rgba(255, 255, 255, 0.22)` |

- **categorical (light, adjacent, 8 slots)**: PASS. Lightness band: PASS (all 8 inside OKLCH L 0.43-0.77); Chroma floor: PASS (all 8 >= 0.1); CVD separation: PASS (worst adjacent #28A3B6<->#DE3A46 dE 15.6 (deutan); target 8); Normal-vision floor: PASS (worst adjacent #DC6320<->#28A3B6 dE 27.3; floor 15); Contrast vs surface: WARN (below 3:1 (needs direct labels or table view): #28A3B6 3.00, #D7AB2C 2.15)
- **categorical (light, all-pairs, first 3 slots)**: PASS. Lightness band: PASS (all 3 inside OKLCH L 0.43-0.77); Chroma floor: PASS (all 3 >= 0.1); CVD separation: PASS (worst all #186FE2<->#28A3B6 dE 17.3 (deutan); target 8); Normal-vision floor: PASS (worst all #186FE2<->#28A3B6 dE 17.4; floor 15); Contrast vs surface: WARN (below 3:1 (needs direct labels or table view): #28A3B6 3.00)
- **ordinal (light)**: PASS. Lightness monotone: PASS (steps read in order); Adjacent dL: PASS (all gaps >= 0.06); Light-end contrast: PASS (#73A5F9 2.48:1 vs surface; floor 2); Single hue: PASS (hue spread 0 deg)
- **categorical (dark, adjacent, 8 slots)**: PASS. Lightness band: PASS (all 8 inside OKLCH L 0.48-0.67); Chroma floor: PASS (all 8 >= 0.1); CVD separation: PASS (worst adjacent #29A6BC<->#F04C55 dE 15.6 (deutan); target 8); Normal-vision floor: PASS (worst adjacent #F04C55<->#9778F7 dE 27.1; floor 15); Contrast vs surface: PASS (all 8 >= 3:1)
- **categorical (dark, all-pairs, first 3 slots)**: PASS. Lightness band: PASS (all 3 inside OKLCH L 0.48-0.67); Chroma floor: PASS (all 3 >= 0.1); CVD separation: PASS (worst all #1A74EC<->#29A6BC dE 17.0 (deutan); target 8); Normal-vision floor: PASS (worst all #1A74EC<->#29A6BC dE 17.1; floor 15); Contrast vs surface: PASS (all 3 >= 3:1)
- **ordinal (dark)**: PASS. Lightness monotone: PASS (steps read in order); Adjacent dL: PASS (all gaps >= 0.06); Light-end contrast: PASS (#1150B3 2.31:1 vs surface; floor 2); Single hue: PASS (hue spread 1 deg)

Cross-checked against the dataviz skill's own CLI (`validate_palette.js`, run on 2026-10-03): light and dark 8-slot adjacent sets PASS; the first three slots PASS all-pairs in both modes; the azure ordinal ramps PASS in both modes. The only warnings are the documented 3:1 relief cases in light mode (lagoon exactly 3.00:1, sun 2.15:1).

Light-mode lagoon and sun sit at or below 3:1 against white: label them directly or provide the table view (the relief rule). Status colours are reserved: they always carry an icon and a label and are never reused as a series colour.

---

## 7. Typography

### 7.1 Families
| Role | Web | iOS | Why |
|---|---|---|---|
| **Display** and **figures** | **Bricolage Grotesque Variable** (`@fontsource-variable/bricolage-grotesque`, `opsz.css`: axes opsz 12-96, wght 200-800; OpenType: `tnum`, `pnum`, `frac`) | SF Pro **Rounded** | Friendly, slightly quirky grotesque that stays distinctive at 96 px and keeps tabular figures warm. Verified: the font ships `tnum`. |
| **Text** and UI | **Geist Variable** (`@fontsource-variable/geist` or the `geist` package; wght 100-900; `tnum`, `case`, `ss01-ss11`) | SF Pro | Quiet, neutral workhorse. |
| **Mono** | **Geist Mono Variable** (`@fontsource-variable/geist-mono`) | SF Mono | Code, IDs (`bnty_8f2c1a`), tracking links, ledgers. |

Differences from CONVENTIONS: hero and inline money uses **Bricolage with tabular numerals**, not Geist Mono. A 64 px mono figure reads cold and technical; Bricolage `tnum` keeps count-ups jitter-free and on brand. Geist Mono is for code and dense right-aligned ledgers.

Font stacks (generated; `--font-bricolage`, `--font-geist-sans`, `--font-geist-mono` are the optional `next/font` variables, with the fontsource family names as fallbacks):

```css
--fd-font-display: var(--font-bricolage, "Bricolage Grotesque Variable"), "Bricolage Grotesque", ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif;
--fd-font-text:    var(--font-geist-sans, "Geist Variable"), "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--fd-font-mono:    var(--font-geist-mono, "Geist Mono Variable"), "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

### 7.2 Rules
- **Display** (Bricolage): weights 700-800 for display sizes, 650-700 for titles. `font-optical-sizing: auto` so the optical-size axis tightens as the type grows. **Tracking tightens as size grows** (-0.04em at 96 px down to 0 at 16 px); body copy needs no tracking; small uppercase labels get +0.08em.
- **Line height by role:** display 0.94-1.1, titles 1.2-1.3, body 1.5-1.55, UI 1.4. Never below 1.4 for text that wraps to three lines or more.
- **Numbers are heroes.** Money and counts use tabular numerals (`font-variant-numeric: tabular-nums`) wherever a value can change. Hero figures ≥ 48 px (they then qualify as large text for contrast).
- **Measure:** 60-75 characters for long-form (`max-width: 62ch` in prose). Headings `text-wrap: balance`; descriptions `text-wrap: pretty`.
- **Sizes:** body 16 px (14 in dense tools), UI floor 12 px, inputs 16 px on mobile (iOS Safari zooms smaller). Weights below 18 px stay at 400 or heavier; weights under 300 are display-only.
- **Load only the faces you use**; never let the browser synthesise bold or italic. Use `.woff2`; self-host through the fontsource packages (offline-safe).
- **Underlines** take their position and thickness from the font (`text-underline-position: from-font`, `text-decoration-thickness: from-font`).
- **Language and direction:** set `lang` on `<html>`; isolate mixed-direction values with `<bdi>`.
- Font smoothing (`-webkit-font-smoothing: antialiased`) once on the root, never per component.

### 7.3 Web scale
Display sizes are fluid (`clamp`). Tailwind utilities are `text-display-2xl`, `text-body`, `text-figure-hero`... each sets size, line-height, tracking and weight together.

| Style | Family | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|---|
| `display-2xl` | display | 96px max, `clamp(3.25rem, 1.4rem + 7.4vw, 6rem)` | 0.94 | -0.04em | 800 | Marketing hero, one per page |
| `display-xl` | display | 72px max, `clamp(2.75rem, 1.2rem + 5.2vw, 4.5rem)` | 0.98 | -0.035em | 800 | Section heroes |
| `display-lg` | display | 56px max, `clamp(2.375rem, 1.2rem + 3.6vw, 3.5rem)` | 1 | -0.03em | 750 | Page titles (marketing) |
| `display-md` | display | 44px max, `clamp(2rem, 1.2rem + 2.2vw, 2.75rem)` | 1.05 | -0.025em | 750 | App page H1, big stats |
| `display-sm` | display | 34px max, `clamp(1.75rem, 1.2rem + 1.2vw, 2.125rem)` | 1.1 | -0.02em | 700 | Section H2 |
| `title-lg` | display | 28px | 1.2 | -0.015em | 700 | Card hero titles, sheet titles |
| `title-md` | display | 22px | 1.25 | -0.01em | 650 | Card titles |
| `title-sm` | text | 18px | 1.3 | -0.005em | 600 | List titles, sub-heads |
| `body-lg` | text | 18px | 1.55 | 0em | 400 | Lead paragraphs |
| `body` | text | 16px | 1.55 | 0em | 400 | Default reading text |
| `body-sm` | text | 14px | 1.5 | 0em | 400 | Dense UI text, table cells, inputs (16 on mobile) |
| `caption` | text | 13px | 1.4 | 0.005em | 450 | Captions, metadata, helper text |
| `micro` | text | 12px | 1.35 | 0.01em | 500 | Floor. Badges, chart ticks. Never below 12. |
| `overline` | text | 12px | 1.2 | 0.08em | 600 | Eyebrows, table headers |
| `button` | text | 15px | 1.2 | 0em | 600 | Buttons, tabs, pills |
| `figure-hero` | display | 72px max, `clamp(3rem, 1.6rem + 6vw, 4.5rem)` | 1 | -0.035em | 800 | Wallet balance, hero payout |
| `figure-xl` | display | 48px | 1 | -0.03em | 750 | KPI headline numbers |
| `figure-lg` | display | 34px | 1.05 | -0.025em | 700 | Card stats |
| `figure-md` | display | 24px | 1.1 | -0.015em | 700 | Row amounts, ticker |
| `figure-sm` | text | 15px | 1.3 | 0em | 600 | Inline money and counts |
| `code` | mono | 13px | 1.5 | 0em | 450 | Code, IDs, ledger |

### 7.4 iOS scale
SF Pro Rounded for display and **every number**; SF Pro for text; SF Mono for code. Apply with `.flowdText(FlowdFont.title1)` (a `ViewModifier` that scales with Dynamic Type via `ScaledMetric`, except styles marked fixed). Cap hero sizes with `.dynamicTypeSize(...DynamicTypeSize.accessibility1)` where a layout cannot reflow.

| Style | Text style | Size | Weight | Design | Tracking | Notes |
|---|---|---|---|---|---|---|
| `hero` | largeTitle | 56pt | heavy | rounded | -1.8pt | fixed size (does not scale) |
| `largeTitle` | largeTitle | 34pt | bold | rounded | -0.8pt | Dynamic Type |
| `title1` | title | 28pt | bold | rounded | -0.5pt | Dynamic Type |
| `title2` | title2 | 22pt | bold | rounded | -0.3pt | Dynamic Type |
| `title3` | title3 | 20pt | semibold | rounded | -0.2pt | Dynamic Type |
| `headline` | headline | 17pt | semibold | default | -0.2pt | Dynamic Type |
| `body` | body | 17pt | regular | default | 0pt | Dynamic Type |
| `callout` | callout | 16pt | regular | default | 0pt | Dynamic Type |
| `subheadline` | subheadline | 15pt | regular | default | 0pt | Dynamic Type |
| `footnote` | footnote | 13pt | regular | default | 0pt | Dynamic Type |
| `caption1` | caption | 12pt | medium | default | 0.1pt | Dynamic Type |
| `caption2` | caption2 | 11pt | medium | default | 0.1pt | Dynamic Type |
| `overline` | caption2 | 11pt | semibold | default | 0.9pt | Dynamic Type, uppercase |
| `button` | body | 16pt | semibold | rounded | 0pt | Dynamic Type |
| `figureHero` | largeTitle | 64pt | heavy | rounded | -2pt | fixed size (does not scale), monospacedDigit |
| `figureXL` | largeTitle | 44pt | bold | rounded | -1.2pt | Dynamic Type, monospacedDigit |
| `figureLg` | title | 32pt | bold | rounded | -0.7pt | Dynamic Type, monospacedDigit |
| `figureMd` | title2 | 22pt | bold | rounded | -0.3pt | Dynamic Type, monospacedDigit |
| `figureSm` | subheadline | 15pt | semibold | rounded | 0pt | Dynamic Type, monospacedDigit |
| `code` | footnote | 13pt | regular | monospaced | 0pt | Dynamic Type, monospacedDigit |

---

## 8. Spacing, radius, elevation, layout

**4 pt grid.** Tailwind's `--spacing` is 0.25 rem, so `p-4` = 16 px. Named steps (mostly for iOS and prose):

| Step | px | iOS name |
|---|---|---|
| `xxs` | 4 | xxs |
| `xs` | 8 | xs |
| `sm` | 12 | sm |
| `md` | 16 | md |
| `lg` | 20 | lg |
| `xl` | 24 | xl |
| `2xl` | 32 | xxl |
| `3xl` | 40 | xxxl |
| `4xl` | 48 | huge |
| `5xl` | 64 | giant |
| `6xl` | 80 | jumbo |
| `7xl` | 96 | mega |

**Radius.** Concentric: *child radius = parent radius − padding*. A 28 px card with 20 px padding holds an 8 px inner element.

| Token | px | Typical use |
|---|---|---|
| `sm` | 8 | Chips, small buttons, tags |
| `md` | 12 | Inputs, small cards |
| `lg` | 16 | List rows, tooltips |
| `xl` | 20 | Cards inside cards |
| `2xl` | 28 | L1 cards, panels |
| `3xl` | 36 | L3 sheets, phone screens |
| `pill` | 9999 | Buttons, L2 controls, tab bar |

**Elevation** is a stack of soft layers, slightly coloured (blue-violet) rather than black, and always lighter on light theme. Glass L1 = level 2, L2 = level 3, L3 = level 4.

**dark**

| Level | Box shadow |
|---|---|
| 1 rest | `0px 1px 2px 0px rgba(1, 4, 20, 0.50), 0px 6px 16px -6px rgba(1, 4, 20, 0.45)` |
| 2 raised / L1 | `0px 2px 4px 0px rgba(1, 4, 20, 0.40), 0px 14px 32px -10px rgba(1, 4, 20, 0.60)` |
| 3 float / L2 | `0px 4px 8px 0px rgba(1, 4, 20, 0.40), 0px 22px 48px -14px rgba(1, 4, 20, 0.65), 0px 8px 28px -10px rgba(48, 125, 253, 0.16)` |
| 4 overlay / L3 | `0px 8px 16px 0px rgba(1, 4, 20, 0.45), 0px 36px 80px -18px rgba(1, 4, 20, 0.75), 0px 12px 40px -14px rgba(120, 79, 252, 0.20)` |

**light**

| Level | Box shadow |
|---|---|
| 1 rest | `0px 1px 2px 0px rgba(22, 38, 96, 0.06), 0px 6px 16px -6px rgba(22, 38, 96, 0.12)` |
| 2 raised / L1 | `0px 2px 4px 0px rgba(22, 38, 96, 0.06), 0px 14px 32px -10px rgba(22, 38, 96, 0.18)` |
| 3 float / L2 | `0px 4px 8px 0px rgba(22, 38, 96, 0.06), 0px 22px 48px -14px rgba(22, 38, 96, 0.24), 0px 8px 28px -10px rgba(14, 98, 225, 0.14)` |
| 4 overlay / L3 | `0px 8px 16px 0px rgba(22, 38, 96, 0.08), 0px 36px 80px -18px rgba(22, 38, 96, 0.32), 0px 12px 40px -14px rgba(103, 26, 243, 0.16)` |

Glows (for earnings, Daily Drop, Elite) are `shadow-glow-flow|mint|ember|sun|violet` and are decorative, never the only cue.

**Layout.**

| Token | Value |
|---|---|
| `gutterMobile` | 16px |
| `gutterTablet` | 24px |
| `gutterDesktop` | 32px |
| `contentMax` | 1200px |
| `wideMax` | 1360px |
| `proseMax` | 680px |
| `dashboardSidebar` | 264px |
| `dashboardSidebarCollapsed` | 76px |
| `headerHeight` | 64px |
| `tabBarHeight` | 64px |
| `hitTarget` | 44px |
| `focusRingWidth` | 2px |
| `focusRingOffset` | 2px |

Dashboard collapses the side-nav to a floating glass bottom bar under 768 px; tables degrade to cards; hit targets are ≥ 44 px.

**Breakpoints** and **z-index**

| Name | min-width |
|---|---|
| `xs` | 360px |
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |
| `3xl` | 1920px |

| Layer | z-index |
|---|---|
| `base` | 0 |
| `content` | 1 |
| `raised` | 10 |
| `sticky` | 100 |
| `nav` | 200 |
| `dropdown` | 300 |
| `scrim` | 400 |
| `modal` | 500 |
| `popover` | 600 |
| `toast` | 700 |
| `tooltip` | 800 |
| `max` | 9999 |

---

## 9. The glass material

Glass is a **material**, not a decoration. It has a job (separating a floating layer from content while staying legible) and a physical recipe.

### 9.1 Layers
| Layer | What | Variant | Rule |
|---|---|---|---|
| **L0** | Aurora background | none | Luminous blurred gradient orbs + grain (section 10) |
| **L1** | Content surfaces: cards, panels, list groups | **Quiet glass**: low blur, high fill (Material on iOS, never `glassEffect`) | Holds content; hairline rim, soft shadow |
| **L2** | Floating controls: nav, tab bar, toolbars, pills, FABs, toasts | **Real glass** (`glassEffect` on iOS 26+) | Interactive; pointer sheen; may float over L1 |
| **L2 clear** | Controls over media | **Clear glass**, only over media-rich content under large bold content | Needs the 35% dim; never body text |
| **L3** | Sheets, modals, popovers | **Thick real glass** over a scrim | Content inside uses fills (`surface-field`), not more glass |

**Stacking rule.** L2 and L3 may float over L1 (a tab bar over cards, a pill on a card) but never over each other, and never more than two layers in any stack. Inside glass use **fills** (`surface-field`, `surface-active`) and vibrancy, not more glass. This satisfies both CONVENTIONS ("never more than two layers") and the research's "no glass on glass" (`docs/research/liquid-glass.md` §1).

**Legibility rule.** The **fill carries the contrast**: it is an ink scrim in dark theme (a *darker* fill raises contrast for light text; a white wash lowers it) and a white wash in light theme. Never reduce blur to gain contrast; raise the fill. Text on glass is `fg`, `fg-muted` or `fg-subtle`, medium weight (500) or heavier at 16 px and below.

### 9.2 Exact parameters
Generated from `tokens.json`. CSS variables are `--fd-glass-<1|2|3>-*`; Swift is `FlowdGlassSpec.l1|l2|l3`.

| Param | dark L1 | dark L2 | dark L3 | light L1 | light L2 | light L3 |
|---|---|---|---|---|---|---|
| Blur | 16px | 24px | 40px | 16px | 24px | 40px |
| Saturate | 140% | 160% | 150% | 150% | 170% | 150% |
| Fill (tint + scrim) | `rgba(9, 16, 40, 0.72)` | `rgba(14, 22, 52, 0.68)` | `rgba(7, 12, 32, 0.80)` | `rgba(255, 255, 255, 0.62)` | `rgba(255, 255, 255, 0.54)` | `rgba(255, 255, 255, 0.84)` |
| Fill over media | `rgba(8, 14, 36, 0.78)` | `rgba(10, 17, 42, 0.78)` | `rgba(7, 12, 32, 0.86)` | `rgba(255, 255, 255, 0.80)` | `rgba(255, 255, 255, 0.78)` | `rgba(255, 255, 255, 0.90)` |
| Sheen 135° | 0.09 → 0.015 | 0.12 → 0.02 | 0.07 → 0.01 | 0.55 → 0 | 0.70 → 0.05 | 0.50 → 0.10 |
| Rim from / mid / to | 0.46 / 0.12 / 0.07 @ 1px | 0.60 / 0.16 / 0.10 @ 1px | 0.34 / 0.10 / 0.05 @ 1px | 0.95 / 0.45 / 0.60 @ 1px | 1 / 0.50 / 0.70 @ 1px | 0.95 / 0.50 / 0.60 @ 1px |
| Highlight (inset top) | `rgba(255, 255, 255, 0.22)` | `rgba(255, 255, 255, 0.34)` | `rgba(255, 255, 255, 0.20)` | `rgba(255, 255, 255, 0.95)` | `rgba(255, 255, 255, 1)` | `rgba(255, 255, 255, 1)` |
| Lowlight (inset bottom) | `rgba(0, 0, 0, 0.28)` | `rgba(0, 0, 0, 0.30)` | `rgba(0, 0, 0, 0.35)` | `rgba(8, 17, 42, 0.05)` | `rgba(8, 17, 42, 0.06)` | `rgba(8, 17, 42, 0.06)` |
| Edge (outer 1px) | `rgba(2, 5, 20, 0.45)` | `rgba(2, 5, 20, 0.50)` | `rgba(2, 5, 20, 0.55)` | `rgba(8, 17, 42, 0.08)` | `rgba(8, 17, 42, 0.10)` | `rgba(8, 17, 42, 0.12)` |
| Elevation | level 2 | level 3 | level 4 | level 2 | level 3 | level 4 |
| Solid fallback | `#101A34` | `#18233D` | `#0C162F` | `#FFFFFF` | `#F7F9FF` | `#FFFFFF` |

Further constants: the pointer sheen is a **240 px** radial white highlight (14% dark, 60% light) following `--mx/--my`; grain opacity 0.035 dark / 0.03 light; the **clear** variant is blur 10 px, saturate 150%, tint `rgba(255,255,255,0.03)`, dim `rgba(0,0,0,0.35)`.

### 9.3 Anatomy of one surface (web)
Bottom to top, for `.fd-glass`:
1. `backdrop-filter: blur(var(--fd-glass-N-blur)) saturate(var(--fd-glass-N-saturate))`. Keep `brightness` at 1.
2. **Fill**: background colour = `--fd-glass-N-fill` (the scrim).
3. **Sheen**: `linear-gradient(135deg, from, to)` painted above the fill, brightest top-left.
4. **Highlight / lowlight / edge**: `inset 0 1px 0 highlight`, `inset 0 -1px 0 lowlight`, `0 0 0 1px edge`.
5. **Specular rim**: a 1 px gradient border drawn on `::before` with a mask (bright top-left, dim middle, mid bottom-right).
6. **Pointer sheen**: a 240 px radial highlight on `::after`, opacity 0 until hover or focus within.
7. **Elevation shadow**, slightly coloured (`--fd-glass-N-shadow`).
8. **Grain** lives in the aurora, not on every surface.

The full, framework-free implementation is `packages/tokens/dist/recipes.css` (`.fd-aurora`, `.fd-glass`, `.fd-glass-l2`, `.fd-glass-l3`, `.fd-glass-clear`, `.fd-media-scrim`, `.fd-figure`, `.fd-gradient-text`, `.fd-skeleton`). The web foundation can use it as is or port it into its `components/glass`. Pointer tracking:

```js
el.addEventListener('pointermove', (e) => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
});
```

**Refraction** (`feDisplacementMap`): optional progressive enhancement for **hero or primary elements only**, Chromium only (gate with `navigator.userAgentData`; `@supports` cannot detect it), at most three refracted surfaces per page, maps generated once and cached, never animate displacement. Parameters: displacement scale 14, edge blur 0.6, turbulence frequency 0.012, 2 octaves. Everywhere else: plain blur. See `docs/research/liquid-glass.md` Part B4-B5.

**Performance budget:** at most three live glass surfaces per viewport on web; never animate blur radius; no `opacity`, `filter`, `mask`, `clip-path`, blend modes or `will-change` of those on an ancestor of glass (it breaks the backdrop root).

### 9.4 Accessibility fallbacks (mandatory)
| Setting | Web | iOS |
|---|---|---|
| Reduce transparency | `@media (prefers-reduced-transparency: reduce)` **and** `html[data-transparency="reduce"]` (Safari and Firefox ignore the media query, so ship an in-app "Reduce glass" switch): blur 0, fill = the layer's solid, no sheen, no grain | `accessibilityReduceTransparency`: solid tinted fills |
| Reduce motion | `prefers-reduced-motion`: aurora static, no pointer sheen transition, no spring overshoot, skeletons static | `accessibilityReduceMotion` |
| Increase contrast | `prefers-contrast: more`: rims become solid `rim-strong` | `accessibilityContrast` / system behaviour |
| Forced colors | System colours; keep borders | n/a |

### 9.5 iOS
All glass goes through DesignSystem wrappers (`.flowdGlass(...)`, `FlowdGlassContainer`, `FlowdGlassButtonStyle`, `FlowdSurface`); feature views never call `glassEffect` directly. iOS 26+: L2 and L3 use `glassEffect` (regular; interactive for L2) grouped in a `GlassEffectContainer`. iOS 17-25: `Material` + tint + rim stroke. L1 is the same quiet surface on every OS.

| Layer | Uses glassEffect | Variant | Fallback material (all OS for L1; iOS 17-25 for L2/L3) | Fallback tint opacity (light / dark) | Rim stroke opacity (light / dark) |
|---|---|---|---|---|---|
| L1 | never (quiet) | quiet | `thinMaterial` | 0.3 / 0.4 | 0.6 / 0.22 |
| L2 | iOS 26+ | regular, interactive | `ultraThinMaterial` | 0.28 / 0.34 | 0.8 / 0.32 |
| L3 | iOS 26+ | regular | `thickMaterial` | 0.5 / 0.55 | 0.6 / 0.2 |

Tint **only** the primary action, tint the glass not the label, and verify the label by computed contrast (below about 0.85 tint opacity the passing label colour flips with the backdrop). Details, signatures and the wrapper code: `docs/research/liquid-glass.md`.

---

## 10. Aurora background (L0)

The aurora is the colour in the room: four soft orbs on the canvas, gently drifting, with a hint of grain.

**Recipe (web).** One element (`.fd-aurora`, `position: fixed; inset: 0; z-index: -1`) whose background is the orb gradient list over the canvas colour. Each orb is `radial-gradient(circle <r>, color alpha 0%, color alpha*0.43 45%, transparent 100%)` at `x% y%`, with the radius `min(<r>vmax, <r x 2200>px)` so it never balloons on very tall or very wide screens. A `::before` copy drifts (translate ±2 vw, scale 1 → 1.06, **90 s** ease-in-out alternate); a `::after` carries grain (SVG turbulence tile, 160 px, `mix-blend-mode: overlay`) at the opacities below. Dark theme adds a soft vignette.

**dark**: base `#030921`, noise 0.035.

| Orb | Centre x / y | Radius (x longer side) | Colour at centre | Peak alpha | Falloff |
|---|---|---|---|---|---|
| violet | 6% / 0% | 0.62 | `#6B3FF5` | 0.67 | 0.67 @ 0%, 0.29 @ 45%, 0 @ 100% |
| azure | 96% / 2% | 0.5 | `#2F7BFF` | 0.52 | 0.52 @ 0%, 0.22 @ 45%, 0 @ 100% |
| lagoon | 84% / 106% | 0.52 | `#19D3E6` | 0.35 | 0.35 @ 0%, 0.145 @ 45%, 0 @ 100% |
| rose | -4% / 98% | 0.38 | `#FF4D8D` | 0.2 | 0.2 @ 0%, 0.07 @ 45%, 0 @ 100% |

**light**: base `#F3F7FF`, noise 0.03.

| Orb | Centre x / y | Radius (x longer side) | Colour at centre | Peak alpha | Falloff |
|---|---|---|---|---|---|
| violet | 6% / 0% | 0.62 | `#A99CF2` | 0.62 | 0.62 @ 0%, 0.28 @ 45%, 0 @ 100% |
| azure | 96% / 2% | 0.5 | `#8DB8F5` | 0.6 | 0.6 @ 0%, 0.26 @ 45%, 0 @ 100% |
| lagoon | 84% / 106% | 0.52 | `#7FE3F2` | 0.55 | 0.55 @ 0%, 0.24 @ 45%, 0 @ 100% |
| rose | -4% / 98% | 0.38 | `#F6B3BA` | 0.45 | 0.45 @ 0%, 0.18 @ 45%, 0 @ 100% |

- **Light theme** uses the same four orbs as pastels over pearl. Light-mode text is measured against the darkest pixel of this field.
- **Reduced motion:** the drift stops; the orbs stay.
- **Never** blur-filter the orbs (the gradient is already soft); never animate their size; keep to one aurora per page.
- **Where it shows through:** in the gutters and behind L1/L2 glass. On dense data screens (brand dashboard tables) the aurora recedes: lower the orb alphas to 60% and keep the vignette.
- **iOS:** `FlowdAurora.darkOrbs` / `lightOrbs` are RadialGradients at `x,y` (fractions of the container) with radius = `radius` x the longer side; drift is `FlowdAurora.driftSeconds`.

---

## 11. Motion

**Principles** (from `apple-design` and `better-ui`): respond on press-down, not release; motion starts from the *current* value, inherits the user's velocity and can be interrupted at any instant; springs for anything touched; ease-out for micro-interactions; nothing locks input during a transition; the hero art may be rich, the chrome is quiet; every animated state also has a static cue.

- **State changes and gestures:** springs. Default to **no overshoot**; use `bouncy` only when the gesture carried momentum (a flick) or at a payout moment.
- **Micro-interactions** (hover, focus, color): 150-220 ms, `standard` ease-out. Only animate `transform`, `opacity` (and `filter` sparingly); never `transition: all`.
- **Press feedback:** scale to **0.96** on press-down (≥ 0.95 always), 100 ms ease-out, spring back on `tap`.
- **Icon swaps** (e.g. heart toggle, clock → check): cross-fade with scale 0.25 → 1, opacity 0 → 1, blur 4 px → 0, spring `duration 0.3, bounce 0`.
- **Lists:** stagger ≤ 40 ms per item, capped at 8 items; no stagger on high-frequency screens (the review queue animates nothing but a 120 ms row collapse).
- **Numbers:** count up with `smooth` when a value changes; never animate between formatted strings (use tabular figures so width never jumps).
- **Enter/exit:** exits are softer than entries (small fixed translateY, not full height) and take the same path back; popovers and menus scale from their trigger.
- **Theme switch:** suppress transitions for one frame (inject `*{transition:none !important}`, force reflow, remove next frame) so the flip snaps instead of smearing.
- **Skip entrance animation on first load** unless it is an intentional page intro.
- **Reduced motion:** replace movement with 120-200 ms cross-fades; drop overshoot, parallax, drift, pointer sheen and skeleton shimmer; keep opacity and colour changes that carry meaning.
- **Haptics (iOS only):** on the causal frame, matched to the visual: success on cleared money and approvals, light impact on press, selection on tab change, error on rejection. Reserve them for meaningful moments. Web gets visual and optional sound only (no reliable haptics API).

**Spring presets.** Defined once as stiffness / damping / mass; the other columns are derived so web, CSS and iOS feel identical. Web: `motion/react` `{ type: "spring", stiffness, damping, mass }` (`motionSpring.snappy`), or the CSS `linear()` easing with its duration (`--fd-spring-snappy` + `--fd-spring-snappy-dur`). iOS: `.spring(response:dampingFraction:)` (`FlowdMotion.snappy`).

| Preset | Stiffness | Damping | Mass | iOS response | iOS dampingFraction | motion bounce | CSS linear() duration | Use |
|---|---|---|---|---|---|---|---|---|
| `tap` | 520 | 40 | 1 | 0.276 | 0.877 | 0.123 | 346 ms | Press feedback, toggles, checkboxes |
| `snappy` | 420 | 34 | 1 | 0.307 | 0.83 | 0.17 | 396 ms | Menus, popovers, tabs, chips |
| `smooth` | 320 | 30 | 1 | 0.351 | 0.839 | 0.161 | 454 ms | Cards, list reorder, layout shifts, count-ups |
| `sheet` | 380 | 36 | 1 | 0.322 | 0.923 | 0.077 | 329 ms | Sheets, drawers, modals |
| `gentle` | 240 | 26 | 1 | 0.406 | 0.839 | 0.161 | 525 ms | Hero art, aurora parallax, page transitions |
| `bouncy` | 300 | 22 | 1 | 0.363 | 0.635 | 0.365 | 571 ms | Momentum only: flick release, payout celebration |

**Durations and curves**

| Token | ms |
|---|---|
| `instant` | 80 |
| `fast` | 150 |
| `base` | 220 |
| `slow` | 320 |
| `slower` | 480 |
| `hero` | 800 |

| Token | cubic-bezier |
|---|---|
| `standard` | (0.2, 0, 0, 1) |
| `emphasized` | (0.16, 1, 0.3, 1) |
| `decelerate` | (0, 0, 0.2, 1) |
| `accelerate` | (0.4, 0, 1, 1) |
| `inOut` | (0.65, 0, 0.35, 1) |

---

## 12. Iconography

- **Web:** `lucide-react` only. **iOS:** SF Symbols only. One icon library per surface; never mix.
- **Stroke matches text weight:** 1.5-1.75 px beside regular text, 2 px beside semibold. The board uses 1.75. Never hairline icons next to bold type.
- **Sizes:** 16 (inline with caption), 18 (buttons, pills), 20 (rows, inputs), 24 (tab bar, navigation), 28+ (empty states and art, stroke 1.6).
- **Outline by default; fill marks the active state** (tab bar current tab uses the filled symbol on iOS).
- **One SVG, recoloured by state**: icons use `currentColor`; hover, selected and disabled come from colour and opacity, never separate assets.
- **Optical alignment:** nudge asymmetric icons (play, arrow) so they look centred, not just geometrically centred.
- **Money cues** (never colour alone): check = cleared, clock = pending, minus = negative, lock = escrow, arrow up-right = growth, bolt = Daily Drop / urgency, four-point spark = Flo.
- **Suggested mapping** (verify SF Symbol availability per target OS): Home `house` / `house.fill`; Bounties `target`; Studio `video` / `video.fill`; Wallet `creditcard`; Profile `person.crop.circle`; Search `magnifyingglass`; Notifications `bell`; Daily Drop `bolt.fill`; Flo `sparkles`; Cleared `checkmark.circle.fill`; Pending `clock`; Escrow `lock`; Inbox `tray`.
- **Hit areas:** every icon button is ≥ 44 x 44 (pad the hit area, not the glyph).

---

## 13. Imagery and illustration

**Nothing is photographed or downloaded.** All imagery is generated (SVG, CSS, canvas, gradients) so the product is offline-capable and licence-clean, and so no real person, logo or company ever appears (CONVENTIONS section 1). Customers, apps and creators in demo data are fictional (the board uses "Nap Nest", "Fernlingo", "Loafly", "Maya").

- **Aurora orbs** are the signature background and hero art (section 10).
- **Glass cards and chips** stage numbers and UI over the aurora.
- **Generated video thumbnails** (9:16): a diagonal gradient from the Flow, Money, Ember, Sun or Flo families (or a tint seeded by the app), **big type** (two or three words, Bricolage 800, white, tight leading, soft text shadow), a tiny generic app glyph top-left, a caption chip bottom-left. No faces, no stock. Any text on a thumbnail sits on a **media scrim**.
- **Phone mock-ups** are built in HTML/CSS/SVG: 58 px outer radius, 11 px bezel, 30 px Dynamic Island, real content from fixtures (see the board's two phones). Never a screenshot of a real device.
- **Empty and error states** are illustrated: a 92 px glass tile (radius 28) with a 40 px icon at stroke 1.6 over the soft Flow tint, a one-line headline, a one-line reason and a primary action. Never blank.
- **Charts** follow section 6.9 and the dataviz rules: thin marks (2 px lines), 4 px rounded data ends anchored to the baseline, 2 px surface gaps, recessive grid, selective direct labels, tooltips on hover, a table view for accessibility.
- **Loading** is a shimmering glass skeleton (stops under reduced motion).
- **Avatars** are generated (section 5.6).

---

## 14. Tier badges

Five tiers, Bronze → Silver → Gold → Platinum → Elite. A badge is a **medallion** with **one to four chevrons** (rank reads without colour), and Elite is the only **dark** medallion with a prismatic ring, so it can never be mistaken for Gold. The tier name always appears as text next to the badge.

**Geometry** (112 grid): medallion radius 46 (Elite 42 with a 3 px conic ring outside), 1.6 px rim gradient (bright top-left), 36 px inner ring at ink 20% (Elite: dashed white 16%), chevrons: 28 px wide, 5.4 px stroke, round caps and joins, 10.5 px vertical pitch, centred. Glow = a soft coloured drop shadow (blur 18, 75% of the glow colour). A top-left white radial highlight at 60% completes the "gel" look.

| Tier | Chevrons | Gradient stops (135°) | Ink | Glow | Rim |
|---|---|---|---|---|---|
| Bronze | 1 | #F2B98A 0%, #C9803F 55%, #9A5E2C 100% | `#2A1405` | `rgba(201, 128, 63, 0.40)` | `#FFD9B3` |
| Silver | 2 | #F4F7FC 0%, #C3CBDA 55%, #8893AA 100% | `#131B2E` | `rgba(195, 203, 218, 0.38)` | `#FFFFFF` |
| Gold | 3 | #FFEBA3 0%, #F6C23A 52%, #C58A00 100% | `#2F1F00` | `rgba(246, 194, 58, 0.46)` | `#FFF6CF` |
| Platinum | 4 | #F6FCFF 0%, #BDD8F6 38%, #C2B2F8 70%, #9FEAF5 100% | `#14223F` | `rgba(159, 200, 245, 0.46)` | `#FFFFFF` |
| Elite | 4 | #FFF1B8 0%, #FFB347 34%, #FF5C8A 68%, #8B5CFF 100% | `#1A0A33` (core) | `rgba(255, 140, 90, 0.55)` | `#FFF4D6` |

- **Elite** medallion core is `#1A0A33` (the ink value), chevrons take the gradient, the ring is a conic gradient (Sun → Ember → Rose → Ultraviolet → Lagoon → Sun) rotating once per 14 s (static under reduced motion), plus four sparks at the cardinal points.
- **Sizes:** 20 (chip: medallion only, no inner ring), 32 (list rows), 56 (cards), 112 (profile and celebration). Under 24 px drop the glow.
- **Tier chip** (profiles, leaderboards, bios): pill with the tier gradient, a 24 px translucent disc with an up-chevron, tier name in 650 weight at the tier's ink colour.
- **Contrast:** the ink clears 4.5:1 on each tier's mid stop and 3:1 on the end stops (checked in the token build).
- **Rank-up** moment: medallion springs in (`bouncy`), rim sweeps once, haptic success on iOS; no confetti.

---

## 15. App icon

A full-bleed, fully opaque 1024 x 1024 square (iOS applies the corner mask, so never pre-round the asset). It is **flat**: a solid ink tile (`#08112A`), an ice-white ribbon-f and a mint crossbar. No gradient, glow, shadow or glass effect. iOS 26 adds its own Liquid Glass sheen to the system icon; the artwork stays flat so that system layer reads cleanly. The same flat tile is the favicon and the stacked-lockup tile.

| Appearance | File | Notes |
|---|---|---|
| Light (default) | `app-icon-1024.png` | Flat ink tile, ice-white mark, mint crossbar |
| Dark | `app-icon-dark-1024.png` | Flat deepest-navy tile, same mark |
| Tinted (iOS 18+) | `app-icon-tinted-1024.png` | Greyscale artwork (white ribbon, mid-grey bar) the system tints |
| Layers (iOS 26 Icon Composer) | `app-icon-layer-bg-1024.png` + `app-icon-layer-fg-1024.png` | Layers are flat fills; do not bake blur or specular into them, the system adds them |

Keep the mark inside the central ~62% so it survives every mask (Apple, Android adaptive, PWA maskable at 192/512). No transparency, no text, no alpha channel (the PNGs are written without one). Minimum rendered size 29 pt.

---

## 16. Social and OG art direction

**Master template: 1200 x 630** (`og-image.svg/png`). Dark theme always, even when the product page is light: the dark aurora is the brand's most recognisable image.
- **Layout:** lockup top-left (56 px tall) at 72 px margins. Headline left, two lines, 96 px display-2xl: line one white, line two in the Flow gradient (ultraviolet → azure → cyan). Support line in `fg-muted` (28 px), a one-sentence mechanism line in `fg-subtle` (22 px). Right: one glass bounty card (L1) with one hero number in Mint and one floating L2 pill overlapping its corner.
- **Rules:** one hero number, one gradient phrase, one glass card, one floating pill. Fictional apps only. All type is outlined to paths so the SVG needs no fonts. Safe area 72 px; nothing important in the outer 6%.
- **Content rules:** a rate or a mechanism, not an income. If a payout figure appears, the **median** line sits beside it. Never real logos, people or photos.

**Earnings and proof cards** (share art, 1080 x 1920 story and 1080 x 1080 square): aurora background, big mint figure in Bricolage 800 (figure-hero), pending vs cleared as two small glass chips, a tier chip, the creator handle, and the **proof URL** `joinflowd.io/p/<id>`. The median line is mandatory ("Typical creator this week: $212"). Footer: the lockup, mono-light, at the bottom margin.

**Platform notes.** X and LinkedIn crop to roughly 1.91:1: keep the headline inside the central 1080 x 540. Reels, TikTok and Stories keep captions out of the top 14% and bottom 22%. App Store screenshots follow the app chrome (phones on aurora with a one-line headline in display-md).

---

## 17. Accessibility rules

1. **Contrast:** text ≥ 4.5:1 (≥ 3:1 for large: 24 px, or 18.66 px bold), UI components and focus rings ≥ 3:1. Measured on the actual glass over the worst aurora pixel (section 6.6); enforced by the token build.
2. **Never colour alone:** money states, status, chart series, tier ranks, form validation. Pair with an icon, a label or a shape.
3. **Targets:** ≥ 44 x 44 px / pt. Focus ring: 2 px ring with a 2 px offset, `focus-ring` colour (≥ 3:1), visible on every interactive element.
4. **Transparency, motion and contrast settings are honoured** (section 9.4), including an in-app "Reduce glass" switch.
5. **Type scales:** respect browser text size (rem) and iOS Dynamic Type; layouts reflow, nothing truncates silently. Truncated values stay reachable (tooltip or expand).
6. **Semantics:** headings in order, labelled controls, `aria-live="polite"` for toasts and updating figures, icons `aria-hidden` unless they carry meaning, charts have a table view and a text summary.
7. **Colour-blind safety:** the chart palette separates adjacent categories at ΔE ≥ 8 under protan and deutan simulation and ≥ 15 for normal vision (the build enforces it).
8. **Copy:** plain language, specific error messages with the fix, no timers that are not real.
9. **Dark and light** are both audited; the default is dark but `prefers-color-scheme` and `data-theme` both work.

---

## 18. Using the system

### 18.1 Files
| Path | What |
|---|---|
| `packages/tokens/tokens.json` | **Canonical** tokens (hand-edited). |
| `packages/tokens/build.mjs` | Zero-dependency build: verifies contrast and chart palettes, then writes `dist/`. `npm run build` / `npm run check` in `packages/tokens`. |
| `packages/tokens/dist/tokens.css` | CSS custom properties (`--fd-*`, dark default, `[data-theme=light]`, OS preference, accessibility overrides), legacy aliases, and the Tailwind v4 `@theme inline` block. |
| `packages/tokens/dist/tailwind.css` | Only the `@theme inline` block (it is also inside `tokens.css`; the web app's `tailwind-tokens.css` slot is synced from it, and importing both is harmless because the declarations are identical). |
| `packages/tokens/dist/recipes.css` | Optional glass, aurora and type recipes. |
| `packages/tokens/dist/Tokens.swift` | SwiftUI: dynamic colours, gradients, spacing, radius, motion, fonts, glass spec, tiers, charts. |
| `packages/tokens/dist/tokens.mjs` / `tokens.d.ts` / `tokens.resolved.json` | JS access (springs for `motion/react`, chart hexes for canvas) with types. |
| `packages/tokens/dist/contrast-report.md` | Every contrast pair and chart validation, regenerated on each build. |
| `brand/logo/*` | All logo, icon and OG artwork. |
| `brand/preview.html` | The brand board. |
| `brand/src/*` | Generators (logos, OG, PNGs, board, this book). |

### 18.2 Web
```css
/* app/globals.css */
@import "tailwindcss";
@import "../styles/tokens.css";      /* synced from packages/tokens/dist/tokens.css (includes @theme inline) */
@import "../styles/recipes.css";     /* optional */
```
- **Theme:** set `data-theme="dark|light"` on `<html>` before first paint. Reduce glass: `data-transparency="reduce"`.
- **Utilities** (semantic only; the default Tailwind palette is removed on purpose): `bg-bg`, `bg-surface`, `bg-surface-glass-1`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-rim`, `text-mint`, `bg-mint-solid text-on-mint`, `bg-mint-soft`, `text-ember`, `bg-accent-solid text-on-accent`, `text-accent`, `font-display`, `text-display-xl`, `text-figure-hero`, `rounded-2xl`, `shadow-float`, `ease-spring-snappy`.
- **Fonts:** import `@fontsource-variable/bricolage-grotesque/opsz.css`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` (or the `geist` package and expose `--font-geist-sans` / `--font-geist-mono`).
- **Meta:** `<meta name="theme-color" content="`#030921`" media="(prefers-color-scheme: dark)">` and ``#F3F7FF`` for light; copy `favicon.svg`, `favicon.ico`, `favicon-180.png` (apple-touch-icon), `favicon-192/512.png`, `og-image.png` into `public/`.
- **Legacy names:** `tokens.css` keeps aliases for the placeholder names the web app shipped with (`--canvas`, `--surface`, `--fg`, `--glass-blur`, `--azure`...), so the app renders after a sync with no edits. Migrate to `--fd-*` and delete the alias block when convenient. Notable semantic changes: `--surface` (translucent 6% white) is now `--fd-surface-field`; Tailwind `bg-surface` is the **solid** `surface`; `--azure` maps to the AA-safe `accent` text colour (use `bg-accent-solid text-on-accent` for fills).

### 18.3 iOS
- Copy `dist/Tokens.swift` to `apps/ios/Flowd/DesignSystem/Tokens.swift` (the sync does this). It declares `FlowdColor`, `FlowdPrimitive`, `FlowdGradient`, `FlowdAurora`, `FlowdTier`, `FlowdChart`, `FlowdSpacing`, `FlowdRadius`, `FlowdLayout`, `FlowdElevation`, `FlowdGlassSpec`, `FlowdMotion`, `FlowdFont` (+ `.flowdText(_:)`), all `internal`, Swift 5 mode, SwiftUI + UIKit + Foundation only. It has **not been compiled** (no Swift toolchain on the authoring machine); it was audited by hand for explicit types, exhaustive switches and API availability (iOS 17). Compile it first on the macOS runner.
- App icon: drop the three PNGs into `AppIcon` (default, Dark, Tinted); for iOS 26 build the layered icon from `app-icon-layer-bg/fg`.
- Colours always come from `FlowdColor.*` (dynamic light/dark); glass only through DesignSystem wrappers.

### 18.4 Regenerating
```
node packages/tokens/build.mjs          # verify + write dist/
node brand/src/build-logos.mjs          # SVG logos, icons, favicon
node brand/src/build-og.mjs             # og-image.svg (needs brand/src/og-text.json)
node brand/src/rasterize.mjs            # PNGs + favicon.ico (Chrome/Edge)
node brand/src/build-preview.mjs        # brand/preview.html
node brand/src/build-brand-md.mjs       # this file
```
`brand/src/og-text.json` holds the OG headline and card text as outlined paths (made once from the OFL fonts with HarfBuzz shaping), so the repo build stays dependency-free. Fonts used by the board live in `brand/src/fonts` with their SIL OFL licences.

---

## 19. Where this differs from CONVENTIONS, and open items

**Decisions that change or refine CONVENTIONS** (this book wins):
1. **Figures:** hero and inline money use Bricolage with `tnum` (and Geist for inline UI figures), not Geist Mono. Geist Mono is for code and ledgers.
2. **Glass layering:** L1 is *quiet glass* (low blur, high fill; Material on iOS); L2/L3 are real glass. Rule restated as "L2/L3 float over L1, never over each other, max two in a stack, fills inside glass". This follows `docs/research/liquid-glass.md` §1.1.
3. **In-app Reduce glass:** `data-transparency="reduce"` in addition to the media query, because Safari and Firefox ignore `prefers-reduced-transparency`.
4. **Token naming:** raw custom properties are `--fd-*`; the Tailwind default palette is removed; base colour names (`mint`, `ember`, `accent`...) are the AA-safe text colour, fills are `*-solid` with `on-*`. Legacy aliases ship for the web placeholder.
5. **Primary button:** a deep Flow gradient (ultraviolet 600 → azure 600) with white text, not bright azure with ink text.
6. **Aurora dark alphas** are higher than the first placeholder (violet 0.67, azure 0.52, lagoon 0.35, rose 0.20) because the glass fill (0.72 / 0.68) was raised to keep AA in the worst case.

**Open items and unverified**
- Trademark search and social handle availability for "flowd" (classes 9, 35, 36, 42).
- `Tokens.swift` is hand-audited, not compiled. `tokens.css` was compiled with Tailwind v4.3.3 and the utilities verified; it has not been run in the Next.js app.
- iOS glass behaviour, Clear/Tinted settings, Safari/Firefox rendering and real-device haptics are unverified here (see `docs/research/liquid-glass.md` Part D).
- Competitor visuals other than Trybe (`docs/research/trybe.md` §9) were not captured.
- The tier thresholds (what earns Silver → Elite) belong to `docs/PRODUCT_SPEC.md`; the board shows perks only.
- Light-mode `lagoon` and `sun` chart colours need direct labels or the table view (3:1 relief rule).
- `docs/CONVENTIONS.md` still says "never stack more than two glass layers" and "Geist Mono for figures"; update it to match this book.

*Generated 2026-10-03 from tokens v1.0.0.*
