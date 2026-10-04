"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Monitor, Moon, Sun } from "lucide-react";
import { Aurora, GlassBar, ReduceGlassSwitch } from "@/components/glass";
import { Chip, SegmentedControl, TooltipProvider } from "@/components/ui";
import { useTheme } from "@/components/shell/theme-provider";
import { isTheme, type Theme } from "@/lib/theme";

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

export interface GalleryNavItem {
  id: string;
  label: string;
}

export interface GalleryChromeProps {
  /** Right of the wordmark in the bar ("charts", "shell"). */
  area: string;
  nav: readonly GalleryNavItem[];
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
  badges?: ReactNode;
  /** Render the page content full-bleed (the shell gallery shows app frames). */
  children: ReactNode;
}

/** The shared frame of the /dev/design/charts and /dev/design/shell galleries: aurora, a glass bar with section links, theme and Reduce glass. */
export function GalleryChrome({ area, nav, eyebrow, title, intro, badges, children }: GalleryChromeProps) {
  return (
    <TooltipProvider>
      <Aurora />
      <GlassBar placement="top" as="header" className="z-(--fd-z-nav) flex items-center gap-3 py-1.5 pr-2 pl-5">
        <Link href="/dev/design" className="flex shrink-0 items-baseline gap-2 rounded-md">
          <span className="font-display text-title-sm font-extrabold tracking-[-0.03em] text-fg">flowd</span>
          <span className="hidden text-caption font-medium text-fg-subtle sm:inline">design system · {area}</span>
        </Link>
        <nav aria-label="Sections" className="ml-4 hidden items-center gap-0.5 xl:flex">
          {nav.map((item) => (
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
          <ReduceGlassSwitch compact className="gap-2.5 py-0 max-sm:[&>span]:text-caption max-[360px]:hidden" />
          <ThemeControl />
        </div>
      </GlassBar>

      <main id="main" className="mx-auto w-full max-w-(--fd-content-max) px-4 pt-28 pb-28 sm:px-6 lg:px-8">
        <header id="top" className="grid max-w-3xl gap-5 pt-6 pb-4">
          <p className="fd-eyebrow text-accent">{eyebrow}</p>
          <h1 className="font-display text-display-lg text-fg">{title}</h1>
          <p className="text-body-lg text-fg-muted">{intro}</p>
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          <nav aria-label="Jump to a section" className="-mx-4 overflow-x-auto px-4 pb-1 xl:hidden">
            <ul className="flex w-max gap-2">
              {nav.map((item) => (
                <li key={item.id}>
                  <Chip size="sm" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    {item.label}
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        {children}
      </main>
    </TooltipProvider>
  );
}
