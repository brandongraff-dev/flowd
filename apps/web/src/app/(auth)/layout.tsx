import Link from "next/link";
import { Aurora } from "@/components/glass/aurora";
import { ReduceGlassSwitch } from "@/components/glass/reduce-glass-switch";
import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/shell/theme-switch";

const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/help", label: "Help" },
  { href: "/status", label: "Status" },
] as const;

/**
 * The frame around every sign-in and sign-up page: the aurora, the logo (home), the theme control, and a quiet footer with the legal links
 * and the Reduce glass switch (so the accessibility setting is reachable before an account exists). No marketing nav: these pages have one job.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <Aurora />
      <header className="flex items-center justify-between gap-4 px-4 pt-5 sm:px-8 sm:pt-7">
        <Link href="/" aria-label="flowd, home" className="inline-flex min-h-11 items-center rounded-lg">
          <Logo variant="lockup" height={32} decorative />
        </Link>
        <ThemeSwitch />
      </header>
      <main id="main" className="flex flex-1 flex-col px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
        {children}
      </main>
      <footer className="border-t border-divider px-4 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <p className="text-caption text-fg-subtle">flowd, Inc. · Money follows what works.</p>
          <nav aria-label="Legal and help" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-8 items-center text-caption font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
          <ReduceGlassSwitch compact />
        </div>
      </footer>
    </div>
  );
}
