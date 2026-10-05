"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown, Menu, Moon, PiggyBank, Radar, Sun, Target, Wand2, Calculator, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { GlassBar } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { useTheme } from "@/components/shell/theme-provider";
import { ReduceGlassSwitch } from "@/components/glass/reduce-glass-switch";

interface NavLink {
  href: string;
  label: string;
}

const LINKS: readonly NavLink[] = [
  { href: "/creators", label: "Creators" },
  { href: "/brands", label: "Brands" },
  { href: "/market", label: "Market" },
  { href: "/pricing", label: "Pricing" },
  { href: "/promise", label: "Promise" },
];

interface ToolLink extends NavLink {
  blurb: string;
  icon: typeof Target;
}

const TOOLS: readonly ToolLink[] = [
  { href: "/tools/hook-score", label: "Hook Score", blurb: "Score your first 3 seconds. Free, no account.", icon: Target },
  { href: "/tools/app-ugc-audit", label: "App UGC Audit", blurb: "Paste an App Store link: brief, 10 hooks, predicted CPM.", icon: Radar },
  { href: "/tools/earnings-calculator", label: "Earnings calculator", blurb: "A range, with the typical creator beside it.", icon: Calculator },
  { href: "/tools/budget-planner", label: "Budget planner", blurb: "What a pool buys in views, installs and trials.", icon: PiggyBank },
  { href: "/tools/price-calculator", label: "All-in price calculator", blurb: "Creator pay, fee and processing in one number.", icon: Wand2 },
  { href: "/report/state-of-app-ugc", label: "State of App UGC", blurb: "Clearing CPMs and hook types by category.", icon: BarChart3 },
];

/** The primary action follows who the page is for: creator pages offer sign-up as a creator, brand pages as an app team. */
function primaryAction(pathname: string): { href: string; label: string } {
  if (pathname.startsWith("/creators") || pathname.startsWith("/founding-creators") || pathname.startsWith("/studio")) return { href: "/signup/creator", label: "Start earning" };
  if (pathname.startsWith("/brands") || pathname.startsWith("/pricing") || pathname.startsWith("/compare")) return { href: "/signup/brand", label: "Start a bounty" };
  return { href: "/signup", label: "Get started" };
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass = (active: boolean): string =>
  cn(
    "inline-flex h-9 items-center rounded-pill px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors duration-(--fd-dur-fast) ease-standard pointer-coarse:min-h-11",
    active ? "bg-surface-active text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
  );

/**
 * The marketing header: a floating L2 glass bar (one live glass surface, over the L1 content below). Real links everywhere, the Tools menu is a
 * disclosure with real links (so each one can be opened in a new tab), and below 1024px everything folds into a sheet. The primary action is
 * audience-aware. Content scrolls underneath; the layout gives `main` the top padding.
 */
export function MarketingNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const action = primaryAction(pathname);
  const toolsActive = pathname.startsWith("/tools") || pathname.startsWith("/report");

  return (
    <GlassBar as="header" placement="top" className="h-14 rounded-pill">
      <nav aria-label="Primary" className="flex h-full items-center gap-1 pr-2 pl-4 sm:pl-5">
        <Link href="/" aria-label="flowd home" className="mr-2 inline-flex min-h-11 items-center rounded-md sm:mr-4">
          <Logo variant="lockup" height={26} decorative />
        </Link>

        <ul className="hidden items-center gap-0.5 lg:flex">
          {LINKS.slice(0, 3).map((link) => (
            <li key={link.href}>
              <Link href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined} className={linkClass(isActive(pathname, link.href))}>
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Free tools" className={cn(linkClass(toolsActive), "gap-1")}>
                  Tools
                  <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-(--fd-dur-base) ease-emphasized", toolsOpen && "rotate-180")} strokeWidth={1.75} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" width="lg" className="p-2">
                <p className="fd-eyebrow px-3 pt-2 pb-1 text-fg-subtle">Free tools</p>
                <ul className="grid">
                  {TOOLS.map((tool) => (
                    <li key={tool.href}>
                      <Link
                        href={tool.href}
                        onClick={() => setToolsOpen(false)}
                        className="group flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-(--fd-dur-fast) hover:bg-surface-hover"
                      >
                        <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                          <tool.icon className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="grid gap-0.5">
                          <span className="text-body-sm font-semibold text-fg">{tool.label}</span>
                          <span className="text-caption text-fg-muted">{tool.blurb}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/tools" onClick={() => setToolsOpen(false)} className="mt-1 flex items-center justify-between rounded-2xl px-3 py-2.5 text-body-sm font-semibold text-accent hover:bg-surface-hover">
                  All free tools
                  <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </Link>
              </PopoverContent>
            </Popover>
          </li>
          {LINKS.slice(3).map((link) => (
            <li key={link.href}>
              <Link href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined} className={linkClass(isActive(pathname, link.href))}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Switch between light and dark"
            tooltip={false}
            variant="plain"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            icon={
              <>
                <Sun className="hidden light:block" />
                <Moon className="hidden dark:block" />
              </>
            }
          />
          <Link href="/login" className={cn(buttonVariants({ variant: "plain", size: "sm" }), "hidden sm:inline-flex")}>
            Sign in
          </Link>
          <Link href={action.href} className={buttonVariants({ variant: "primary", size: "sm" })}>
            {action.label}
          </Link>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <IconButton label="Open menu" tooltip={false} variant="plain" size="sm" className="lg:hidden" icon={<Menu />} />
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>Everything on joinflowd.io.</SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-6 pb-8">
                <ul className="grid gap-1">
                  {LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={isActive(pathname, link.href) ? "page" : undefined}
                        className={cn("flex min-h-12 items-center rounded-2xl px-4 text-body font-semibold", isActive(pathname, link.href) ? "bg-surface-active text-fg" : "text-fg hover:bg-surface-hover")}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-1">
                  <p className="fd-eyebrow px-4 pb-1 text-fg-subtle">Free tools</p>
                  {TOOLS.map((tool) => (
                    <Link key={tool.href} href={tool.href} onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center rounded-2xl px-4 text-body-sm font-medium text-fg-muted hover:bg-surface-hover hover:text-fg">
                      {tool.label}
                    </Link>
                  ))}
                </div>
                <div className="grid gap-3">
                  <Link href={action.href} onClick={() => setMenuOpen(false)} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full")}>
                    {action.label}
                  </Link>
                  <Link href="/login" onClick={() => setMenuOpen(false)} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
                    Sign in
                  </Link>
                </div>
                <div className="grid gap-4 rounded-2xl bg-surface-field p-4">
                  <ThemeSwitch className="justify-self-start" />
                  <ReduceGlassSwitch />
                </div>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </GlassBar>
  );
}
