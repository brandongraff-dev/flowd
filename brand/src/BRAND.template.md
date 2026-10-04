# flowd brand book

**Version {{version}} · {{date}} · theme "Lagoon Glass"**

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

{{logo_files}}

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
| Canvas (`bg`) | {{c:dark.bg}} abyss | {{c:light.bg}} pearl |
| Text (`fg`) | {{c:dark.fg}} | {{c:light.fg}} |
| Primary fill (`accent-solid`) | {{c:dark.accent-solid}} azure 600, white text | {{c:light.accent-solid}} |
| Flow gradient | {{p:ultraviolet.500}} → {{p:azure.500}} → {{p:lagoon.500}} at 0 / 52 / 100 %, 135° | same |
| Money (`mint`) | {{c:dark.mint}} (text), {{c:dark.mint-solid}} (fill) | {{c:light.mint}} (text), {{c:light.mint-solid}} (fill) |
| Urgency (`ember`) | {{c:dark.ember}} (text), {{c:dark.ember-solid}} (fill) | {{c:light.ember}} (text), {{c:light.ember-solid}} (fill) |
| Elite / featured (`sun`) | {{c:dark.sun}} (text), {{c:dark.sun-solid}} (fill) | {{c:light.sun}} (text), {{c:light.sun-solid}} (fill) |
| Danger (`rose`) | {{c:dark.rose}} (text), {{c:dark.rose-solid}} (fill) | {{c:light.rose}} (text), {{c:light.rose-solid}} (fill) |
| Pending / info (`info`) | {{c:dark.info}} (text), {{c:dark.info-solid}} (fill) | {{c:light.info}} (text), {{c:light.info-solid}} (fill) |

### 6.3 Dark theme tokens
Contrast column is the ratio of the token's colour as text on `bg / surface / glass L1 / L2 / L3`, measured on the worst-case backdrop (see 6.6). AA needs 4.5:1 for body text; every readable-text token clears it everywhere in the table.

{{semantic_dark}}

### 6.4 Light theme tokens
{{semantic_light}}

### 6.5 Primitive ramps
Used by gradients, art and the token build. 500 is the signature step of each hue.

{{ramps}}

### 6.6 How contrast on glass is measured
A flat "foreground vs background" ratio proves nothing when text sits on translucent glass. The build measures text against what is really behind it:
1. It samples the **actual aurora field** (the CSS radial gradients in `tokens.json`) on a pixel grid at four viewport sizes and keeps the **brightest** pixel in dark theme (light text) or the **darkest** in light theme (dark text).
2. It composites each glass layer the way CSS paints it: backdrop → `saturate()` → translucent fill → sheen gradient. L2 is measured **on top of L1** (the maximum nesting). L3 is measured over its scrim.
3. Every readable-text token must clear its minimum on every backdrop; `fg` ≥ 7:1, everything else ≥ 4.5:1. The build fails (exit 1) if any of the {{pairs}} checked pairs misses.

**Dark theme backdrops**

{{backdrops_dark}}

**Light theme backdrops**

{{backdrops_light}}

**Text tokens on each backdrop (dark)**

{{text_matrix_dark}}

**Text tokens on each backdrop (light)**

{{text_matrix_light}}

Raw aurora is checked only for `fg` and `fg-muted`; subtle and coloured text must sit on `bg`, `surface` or glass. Over arbitrary photos or generated thumbnails, text must sit on a media scrim (`.fd-media-scrim`, 80% ink at the bottom fading to 0) or on glass using the heavier **fill over media** value. The complete pair list is in `packages/tokens/dist/contrast-report.md`.

### 6.7 Gradients
{{gradients}}

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

{{chart_table}}

{{chart_other}}

{{chart_validation}}

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

{{type_web}}

### 7.4 iOS scale
SF Pro Rounded for display and **every number**; SF Pro for text; SF Mono for code. Apply with `.flowdText(FlowdFont.title1)` (a `ViewModifier` that scales with Dynamic Type via `ScaledMetric`, except styles marked fixed). Cap hero sizes with `.dynamicTypeSize(...DynamicTypeSize.accessibility1)` where a layout cannot reflow.

{{type_ios}}

---

## 8. Spacing, radius, elevation, layout

**4 pt grid.** Tailwind's `--spacing` is 0.25 rem, so `p-4` = 16 px. Named steps (mostly for iOS and prose):

{{spacing}}

**Radius.** Concentric: *child radius = parent radius − padding*. A 28 px card with 20 px padding holds an 8 px inner element.

{{radius}}

**Elevation** is a stack of soft layers, slightly coloured (blue-violet) rather than black, and always lighter on light theme. Glass L1 = level 2, L2 = level 3, L3 = level 4.

{{elevation}}

Glows (for earnings, Daily Drop, Elite) are `shadow-glow-flow|mint|ember|sun|violet` and are decorative, never the only cue.

**Layout.**

{{layout}}

Dashboard collapses the side-nav to a floating glass bottom bar under 768 px; tables degrade to cards; hit targets are ≥ 44 px.

**Breakpoints** and **z-index**

{{breakpoints}}

{{zindex}}

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

{{glass_params}}

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

{{glass_ios}}

Tint **only** the primary action, tint the glass not the label, and verify the label by computed contrast (below about 0.85 tint opacity the passing label colour flips with the backdrop). Details, signatures and the wrapper code: `docs/research/liquid-glass.md`.

---

## 10. Aurora background (L0)

The aurora is the colour in the room: four soft orbs on the canvas, gently drifting, with a hint of grain.

**Recipe (web).** One element (`.fd-aurora`, `position: fixed; inset: 0; z-index: -1`) whose background is the orb gradient list over the canvas colour. Each orb is `radial-gradient(circle <r>, color alpha 0%, color alpha*0.43 45%, transparent 100%)` at `x% y%`, with the radius `min(<r>vmax, <r x 2200>px)` so it never balloons on very tall or very wide screens. A `::before` copy drifts (translate ±2 vw, scale 1 → 1.06, **90 s** ease-in-out alternate); a `::after` carries grain (SVG turbulence tile, 160 px, `mix-blend-mode: overlay`) at the opacities below. Dark theme adds a soft vignette.

{{aurora}}

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

{{springs}}

**Durations and curves**

{{durations}}

{{easings}}

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

{{tiers}}

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
- **Meta:** `<meta name="theme-color" content="{{c:dark.bg}}" media="(prefers-color-scheme: dark)">` and `{{c:light.bg}}` for light; copy `favicon.svg`, `favicon.ico`, `favicon-180.png` (apple-touch-icon), `favicon-192/512.png`, `og-image.png` into `public/`.
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

*Generated {{date}} from tokens v{{version}}.*
