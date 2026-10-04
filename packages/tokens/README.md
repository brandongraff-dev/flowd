# @flowd/tokens

Design tokens for flowd ("Lagoon Glass"). `tokens.json` is the single source of truth; `build.mjs` verifies it and generates everything the web and iOS apps consume. Plain Node, zero dependencies.

```
npm run build     # verify contrast + chart palettes, then write dist/
npm run check     # verify only
node scripts/derive-ramps.mjs --check   # primitives still match their OKLCH derivation
```

| Output (`dist/`) | For |
|---|---|
| `tokens.css` | `--fd-*` custom properties (dark default, `[data-theme=light]`, OS preference, a11y overrides), legacy aliases, and the Tailwind v4 `@theme inline` block |
| `tailwind.css` | only the `@theme inline` block (already inside `tokens.css`) |
| `recipes.css` | optional `.fd-aurora`, `.fd-glass*`, `.fd-media-scrim`, `.fd-figure` ... |
| `Tokens.swift` | SwiftUI: `FlowdColor`, `FlowdGradient`, `FlowdSpacing`, `FlowdRadius`, `FlowdMotion`, `FlowdFont`, `FlowdGlassSpec`, `FlowdTier`, `FlowdChart` ... |
| `tokens.mjs`, `tokens.d.ts`, `tokens.resolved.json` | JS access with types (springs for `motion/react`, chart hexes) |
| `contrast-report.md` | every contrast pair and chart validation |

**The build fails if** any readable-text token drops below WCAG AA on any glass layer (measured over the brightest or darkest pixel of the real aurora field), if dark and light semantic keys diverge, or if a chart palette fails the dataviz checks.

Edit `tokens.json` (aliases look like `"{color.primitive.azure.600}"`), run `npm run build`, then `npm run sync` at the repo root. The full spec lives in `brand/BRAND.md`; the visual reference is `brand/preview.html`.

Layout: `lib/color.mjs` (OKLCH, WCAG, compositing), `lib/contrast.mjs` (aurora sampling + glass compositing + rules), `lib/chart-check.mjs`, `lib/motion.mjs` (spring maths), `lib/emit-*.mjs` (CSS, Swift, JS/TS).
