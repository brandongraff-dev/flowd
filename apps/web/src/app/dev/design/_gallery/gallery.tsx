"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Aurora, GlassBar, ReduceGlassSwitch } from "@/components/glass";
import { Badge, Chip, SegmentedControl, TooltipProvider } from "@/components/ui";
import { useTheme } from "@/components/shell/theme-provider";
import { isTheme, type Theme } from "@/lib/theme";
import { ControlsSection } from "./controls-section";
import { DataSection } from "./data-section";
import { FeedbackSection } from "./feedback-section";
import { FormsSection } from "./forms-section";
import { AuroraSection, GlassSection } from "./glass-section";
import { LayoutSection } from "./layout-section";
import { OverlaysSection } from "./overlays-section";
import { TypeSection } from "./type-section";

const NAV = [
  { id: "glass", label: "Glass" },
  { id: "aurora", label: "Aurora" },
  { id: "controls", label: "Controls" },
  { id: "forms", label: "Forms" },
  { id: "data", label: "Numbers" },
  { id: "feedback", label: "Feedback" },
  { id: "overlays", label: "Overlays" },
  { id: "layout", label: "Structure" },
  { id: "type", label: "Type" },
] as const;

function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl<Theme>
      aria-label="Colour theme"
      size="sm"
      value={theme}
      onValueChange={(next) => {
        if (isTheme(next)) setTheme(next);
      }}
      options={[
        { value: "light", label: <Sun aria-hidden="true" />, "aria-label": "Light" },
        { value: "dark", label: <Moon aria-hidden="true" />, "aria-label": "Dark" },
        { value: "system", label: <Monitor aria-hidden="true" />, "aria-label": "System" },
      ]}
    />
  );
}

/** The /dev/design gallery: every primitive, in both themes, over the aurora, with the Reduce glass switch in the bar. */
export function DesignGallery() {
  return (
    <TooltipProvider>
      <Aurora />
      <GlassBar placement="top" as="header" className="z-(--fd-z-nav) flex items-center gap-3 py-1.5 pr-2 pl-5">
        <a href="#top" className="flex shrink-0 items-baseline gap-2 rounded-md">
          <span className="font-display text-title-sm font-extrabold tracking-[-0.03em] text-fg">flowd</span>
          <span className="hidden text-caption font-medium text-fg-subtle sm:inline">design system</span>
        </a>
        <nav aria-label="Sections" className="ml-4 hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-pill px-3 py-1.5 text-body-sm font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <ReduceGlassSwitch compact className="gap-2.5 py-0 max-sm:[&>span]:text-caption" />
          <ThemeControl />
        </div>
      </GlassBar>

      <main id="main" className="mx-auto w-full max-w-(--fd-content-max) px-4 pt-28 pb-28 sm:px-6 lg:px-8">
        <header id="top" className="grid max-w-3xl gap-5 pt-6 pb-4">
          <p className="fd-eyebrow text-accent">Lagoon Glass · v1</p>
          <h1 className="font-display text-display-lg text-fg">
            The flowd design system, <span className="fd-gradient-text">in one scroll.</span>
          </h1>
          <p className="text-body-lg text-fg-muted">
            Every primitive in dark and light, over the aurora, with hover, focus, loading and disabled states you can see side by side. Flip the theme or turn on Reduce glass in the bar to check the fallbacks.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">L1 quiet glass</Badge>
            <Badge tone="violet">L2 and L3 real glass</Badge>
            <Badge tone="mint" dot>
              AA on every surface
            </Badge>
            <Badge tone="neutral">44px targets</Badge>
          </div>
          <nav aria-label="Jump to a section" className="-mx-4 overflow-x-auto px-4 pb-1 xl:hidden">
            <ul className="flex w-max gap-2">
              {NAV.map((item) => (
                <li key={item.id}>
                  <Chip size="sm" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    {item.label}
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <GlassSection />
        <AuroraSection />
        <ControlsSection />
        <FormsSection />
        <DataSection />
        <FeedbackSection />
        <OverlaysSection />
        <LayoutSection />
        <TypeSection />
      </main>
    </TooltipProvider>
  );
}
