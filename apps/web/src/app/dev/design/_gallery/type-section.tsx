import { Cols, Code, Panel, Row, Section } from "./kit";

const DISPLAY = [
  { cls: "text-display-2xl", name: "display-2xl", spec: "96px · 0.94 · −0.04em · 800" },
  { cls: "text-display-xl", name: "display-xl", spec: "72px · 0.98 · −0.035em · 800" },
  { cls: "text-display-lg", name: "display-lg", spec: "56px · 1 · −0.03em · 750" },
  { cls: "text-display-md", name: "display-md", spec: "44px · 1.05 · −0.025em · 750" },
  { cls: "text-display-sm", name: "display-sm", spec: "34px · 1.1 · −0.02em · 700" },
] as const;

const TEXT = [
  { cls: "font-display text-title-lg", name: "title-lg", sample: "Card hero titles and sheet titles", spec: "28px · 1.2 · 700" },
  { cls: "font-display text-title-md", name: "title-md", sample: "Card titles read like this", spec: "22px · 1.25 · 650" },
  { cls: "text-title-sm", name: "title-sm", sample: "List titles and sub-heads", spec: "18px · 1.3 · 600" },
  { cls: "text-body-lg", name: "body-lg", sample: "Lead paragraphs set a little larger so the page opens with confidence.", spec: "18px · 1.55 · 400" },
  { cls: "text-body", name: "body", sample: "Default reading text. Short sentences. Numbers over adjectives, and never a promise about income.", spec: "16px · 1.55 · 400" },
  { cls: "text-body-sm", name: "body-sm", sample: "Dense UI text, table cells and inputs (16px on a phone so iOS never zooms).", spec: "14px · 1.5 · 400" },
  { cls: "text-caption", name: "caption", sample: "Captions, metadata and helper text sit at 13px.", spec: "13px · 1.4 · 450" },
  { cls: "text-micro", name: "micro", sample: "Badges and chart ticks: the 12px floor.", spec: "12px · 1.35 · 500" },
] as const;

const FIGURES = [
  { cls: "text-figure-hero", name: "figure-hero", sample: "$1,284.60", spec: "72px · 1 · −0.035em · 800" },
  { cls: "text-figure-xl", name: "figure-xl", sample: "412,880", spec: "48px · 1 · −0.03em · 750" },
  { cls: "text-figure-lg", name: "figure-lg", sample: "$62.40", spec: "34px · 1.05 · −0.025em · 700" },
  { cls: "text-figure-md", name: "figure-md", sample: "+$38.20", spec: "24px · 1.1 · −0.015em · 700" },
] as const;

const SURFACES = [
  { cls: "bg-bg", name: "bg", note: "Canvas" },
  { cls: "bg-bg-elevated", name: "bg-elevated", note: "Headers, drawers" },
  { cls: "bg-bg-sunken", name: "bg-sunken", note: "Wells, code" },
  { cls: "bg-surface", name: "surface", note: "Solid cards" },
  { cls: "bg-surface-raised", name: "surface-raised", note: "Menus" },
  { cls: "bg-surface-field", name: "surface-field", note: "Inputs, on glass" },
  { cls: "bg-surface-active", name: "surface-active", note: "Pressed, selected" },
] as const;

const SIGNALS = [
  { name: "accent", solid: "bg-accent-solid", soft: "bg-accent-soft", text: "text-accent", on: "text-on-accent", note: "Interactive" },
  { name: "violet", solid: "bg-violet-solid", soft: "bg-violet-soft", text: "text-violet", on: "text-on-violet", note: "Flo" },
  { name: "mint", solid: "bg-mint-solid", soft: "bg-mint-soft", text: "text-mint", on: "text-on-mint", note: "Money earned" },
  { name: "info", solid: "bg-info-solid", soft: "bg-info-soft", text: "text-info", on: "text-on-info", note: "Pending" },
  { name: "ember", solid: "bg-ember-solid", soft: "bg-ember-soft", text: "text-ember", on: "text-on-ember", note: "Urgency" },
  { name: "sun", solid: "bg-sun-solid", soft: "bg-sun-soft", text: "text-sun", on: "text-on-sun", note: "Elite, featured" },
  { name: "rose", solid: "bg-rose-solid", soft: "bg-rose-soft", text: "text-rose", on: "text-on-rose", note: "Danger" },
] as const;

const GRADIENTS = [
  { name: "flow", cls: "bg-(image:--fd-gradient-flow)", note: "Brand moments, gradient words" },
  { name: "flowButton", cls: "bg-(image:--fd-gradient-flowButton)", note: "Primary CTA, white label" },
  { name: "money", cls: "bg-(image:--fd-gradient-money)", note: "Earnings glow, ink label" },
  { name: "ember", cls: "bg-(image:--fd-gradient-ember)", note: "Daily Drop, ink label" },
  { name: "sun", cls: "bg-(image:--fd-gradient-sun)", note: "Featured, Elite" },
  { name: "flo", cls: "bg-(image:--fd-gradient-flo)", note: "Flo, the copilot" },
] as const;

/** Type scale and colour tokens, so the whole palette can be audited in both themes in one scroll. Server component. */
export function TypeSection() {
  return (
    <Section
      id="type"
      eyebrow="Type and colour"
      title="Big, confident, tabular."
      description="Bricolage Grotesque for display and every number, Geist for text, Geist Mono only for code and IDs. Colours are semantic: one colour, one meaning, and base names are the text-safe values."
    >
      <Panel title="Display" note="Fluid with clamp(); tracking tightens as size grows.">
        <div className="grid gap-7">
          {DISPLAY.map((item) => (
            <div key={item.name} className="grid gap-1.5">
              <p className={`${item.cls} font-display text-fg [overflow-wrap:anywhere]`}>Money follows what works.</p>
              <p className="font-mono text-code text-fg-subtle">
                {item.name} · {item.spec}
              </p>
            </div>
          ))}
          <p className="font-display text-display-md text-fg">
            Get paid for videos that <span className="fd-gradient-text">actually work.</span>
          </p>
        </div>
      </Panel>

      <Cols>
        <Panel title="Figures" note="Bricolage with tnum: digits never jitter, columns align.">
          <div className="grid gap-5">
            {FIGURES.map((item) => (
              <div key={item.name} className="grid gap-1">
                <p className={`${item.cls} fd-figure text-fg`}>{item.sample}</p>
                <p className="font-mono text-code text-fg-subtle">
                  {item.name} · {item.spec}
                </p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Eyebrow and code" note="Geist Mono is for IDs, codes and ledgers. Never for money.">
          <p className="fd-eyebrow text-accent">Liquid glass · 04</p>
          <p className="text-body-sm text-fg-muted">
            IDs and codes use mono: <Code>bnty_8f2c1a</Code> <Code>joinflowd.io/p/ab12</Code> <Code>MAYA10</Code>
          </p>
          <p className="font-mono text-code text-fg">ledg_7c41e2 · +$62.40 · cleared 2026-10-03T14:00:00Z</p>
        </Panel>
      </Cols>

      <Panel title="Text" note="Weights below 18px stay at 400 or heavier. Headings balance their lines; paragraphs avoid orphans.">
        <div className="grid gap-5 md:grid-cols-2">
          {TEXT.map((item) => (
            <div key={item.name} className="grid gap-1.5">
              <p className={`${item.cls} max-w-[62ch] text-fg`}>{item.sample}</p>
              <p className="font-mono text-code text-fg-subtle">
                {item.name} · {item.spec}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Cols>
        <Panel title="Surfaces and text" note="Text tokens on glass: fg, fg-muted, fg-subtle are all AA. Disabled is exempt.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SURFACES.map((item) => (
              <div key={item.name} className={`${item.cls} grid gap-1 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]`}>
                <span className="text-caption font-semibold text-fg">{item.name}</span>
                <span className="text-micro text-fg-subtle">{item.note}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-1 rounded-xl bg-surface p-4">
            <p className="text-body-sm font-semibold text-fg">fg · primary text and numerals</p>
            <p className="text-body-sm text-fg-muted">fg-muted · secondary text</p>
            <p className="text-body-sm text-fg-subtle">fg-subtle · metadata, helper text, placeholders</p>
            <p className="text-body-sm text-fg-disabled">fg-disabled · disabled only</p>
          </div>
        </Panel>

        <Panel title="Signals" note="Base name = text-safe on every surface. Fill = *-solid with its own on-* label. Tint = *-soft.">
          <div className="grid gap-2.5">
            {SIGNALS.map((item) => (
              <div key={item.name} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                <span className={`${item.text} text-body-sm font-semibold`}>{item.name}</span>
                <span className="text-caption text-fg-subtle">{item.note}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`${item.soft} ${item.text} grid h-7 min-w-10 place-items-center rounded-md px-2 text-micro font-semibold`}>soft</span>
                  <span className={`${item.solid} ${item.on} grid h-7 min-w-12 place-items-center rounded-md px-2 text-micro font-semibold`}>solid</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Cols>

      <Panel title="Gradients" note="The Flow gradient is for brand moments, never for body text or small white text on its cyan end.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GRADIENTS.map((item) => (
            <div key={item.name} className="grid gap-2">
              <div className={`${item.cls} h-16 rounded-xl shadow-rest`} />
              <p className="text-caption">
                <span className="font-semibold text-fg">{item.name}</span> <span className="text-fg-subtle">· {item.note}</span>
              </p>
            </div>
          ))}
        </div>
        <Row label="Radius scale (concentric: child = parent − padding)">
          {[8, 12, 16, 20, 28, 36].map((radius) => (
            <div key={radius} className="grid size-16 place-items-center bg-surface-active text-caption font-semibold text-fg-muted tabular-nums" style={{ borderRadius: radius }}>
              {radius}
            </div>
          ))}
          <div className="grid h-16 w-24 place-items-center rounded-pill bg-surface-active text-caption font-semibold text-fg-muted">pill</div>
        </Row>
      </Panel>
    </Section>
  );
}
