import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/shell/container";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { ReduceGlassSwitch } from "@/components/glass/reduce-glass-switch";
import { SITE } from "@/lib/constants";

interface FooterGroup {
  title: string;
  links: readonly { href: string; label: string }[];
}

const GROUPS: readonly FooterGroup[] = [
  {
    title: "Product",
    links: [
      { href: "/creators", label: "For creators" },
      { href: "/brands", label: "For brands" },
      { href: "/studio", label: "Studio" },
      { href: "/market", label: "Market" },
      { href: "/pricing", label: "Pricing" },
      { href: "/compare", label: "Compare" },
      { href: "/formats", label: "Formats" },
      { href: "/leaderboard", label: "Leaderboards" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { href: "/tools/hook-score", label: "Hook Score" },
      { href: "/tools/app-ugc-audit", label: "App UGC Audit" },
      { href: "/tools/earnings-calculator", label: "Earnings calculator" },
      { href: "/tools/budget-planner", label: "Budget planner" },
      { href: "/tools/price-calculator", label: "Price calculator" },
      { href: "/report/state-of-app-ugc", label: "State of App UGC" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/promise", label: "The flowd Promise" },
      { href: "/trust", label: "Trust Center" },
      { href: "/security", label: "Security" },
      { href: "/trust/report", label: "Report a scam" },
      { href: "/status", label: "System status" },
      { href: "/help", label: "Help centre" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/waitlist", label: "Waitlist" },
      { href: "/founding-creators", label: "Founding creators" },
      { href: "/partners", label: "Partners" },
      { href: "/campus", label: "Campus ambassadors" },
      { href: "/developers", label: "Developers" },
      { href: "/changelog", label: "Changelog" },
      { href: "/app", label: "Get the app" },
    ],
  },
];

const LEGAL: readonly { href: string; label: string }[] = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/creator-agreement", label: "Creator agreement" },
  { href: "/legal/brand-terms", label: "Brand terms" },
  { href: "/legal/earnings-disclosure", label: "Earnings disclosure" },
  { href: "/legal/usage-rights", label: "Usage rights" },
  { href: "/legal/community-rules", label: "Community rules" },
];

const linkClass = "inline-flex min-h-8 items-center text-body-sm text-fg-muted transition-colors duration-(--fd-dur-fast) hover:text-fg pointer-coarse:min-h-11";

/**
 * The marketing footer: link groups, the legal pages, the status link, the owned domain, the display controls (theme and Reduce glass) and the
 * honest small print. Social channels are plain text until the handles are verified (BRAND.md 1), so nothing here points at a page that
 * might not exist.
 */
export function MarketingFooter() {
  return (
    <footer className="relative mt-8 border-t border-divider bg-bg-sunken/60">
      <Container size="wide" className="py-14 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <Link href="/" aria-label="flowd home" className="inline-flex w-fit rounded-md">
              <Logo variant="lockup" height={32} decorative />
            </Link>
            <p className="text-body-lg max-w-[34ch] font-display font-semibold text-fg">Money follows what works.</p>
            <p className="text-body-sm max-w-[44ch] text-fg-muted">
              flowd is the open market for app creators. Brands fund bounties, creators compete, and results get paid.
            </p>
            <a href={`https://${SITE.domain}`} className="inline-flex w-fit items-center gap-1 font-mono text-code text-fg-muted hover:text-fg">
              {SITE.domain}
              <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </a>
            <div className="mt-2 grid gap-4 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <p className="fd-eyebrow text-fg-subtle">Display</p>
              <ThemeSwitch className="justify-self-start" />
              <ReduceGlassSwitch />
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.title} className="grid content-start gap-2">
                <p className="fd-eyebrow pb-1 text-fg-subtle">{group.title}</p>
                <ul className="grid gap-0.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 grid gap-6 border-t border-divider pt-8">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
            {LEGAL.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
            <Link href="/status" className={linkClass}>
              <span aria-hidden="true" className="fd-pulse relative mr-2 inline-flex size-2 text-mint">
                <span className="relative size-2 rounded-full bg-current" />
              </span>
              Status
            </Link>
          </nav>
          <p className="text-caption max-w-[88ch] text-fg-subtle">
            Earnings figures on this site are medians of cleared creator earnings, shown beside the top 10%. Results vary and nothing here is a guarantee of income; approval is not
            guaranteed either, because a video has to meet the brief. Numbers on these pages come from a fictional demo world and are marked where they appear. Comparisons name
            other products only to describe public facts and are dated; see how we check them on{" "}
            <Link href="/compare" className="text-accent underline underline-offset-2">
              the compare page
            </Link>
            .
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-caption text-fg-subtle">
            <p>
              &copy; 2026 {SITE.legalName} &middot; <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-fg">{SITE.email}</a>
            </p>
            <p>Where we will post: TikTok, Instagram and YouTube. Handles are announced when verified.</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
