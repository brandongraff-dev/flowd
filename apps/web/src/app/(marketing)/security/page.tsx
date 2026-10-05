import Link from "next/link";
import { Banknote, Lock, Scale, ShieldCheck } from "lucide-react";
import { CONSTANTS } from "@/lib/engine";
import { buildMetadata } from "@/lib/seo";
import { buttonVariants } from "@/components/ui/button-variants";
import { GlassCard } from "@/components/glass/glass";
import { CtaBand, HeroAccent, IconTile, PageHero } from "@/components/features/marketing/pages/kit";
import {
  DisclosureProgramSection,
  DisclosureSection,
  EscrowSection,
  FraudSection,
  LimitsSection,
  PayoutSection,
  PrivacySection,
  SubprocessorsSection,
} from "@/components/features/marketing/pages/security/security-sections";

export const metadata = buildMetadata({
  title: "Security",
  description: "How flowd holds money in escrow and an append-only ledger, checks views for fraud before paying, protects payouts, enforces ad disclosure and handles your data. Including what we do not claim.",
  path: "/security",
});

const JUMPS = [
  { href: "#escrow", label: "Escrow" },
  { href: "#fraud", label: "Fraud" },
  { href: "#payouts", label: "Payouts" },
  { href: "#disclosure", label: "Disclosure" },
  { href: "#privacy", label: "Privacy" },
  { href: "#subprocessors", label: "Subprocessors" },
  { href: "#vulnerability", label: "Report a bug" },
  { href: "#limits", label: "Limits" },
] as const;

const GLANCE = [
  { icon: <ShieldCheck />, tone: "mint" as const, title: "Escrow first", body: "No bounty goes live until its whole pool and fee are locked." },
  { icon: <Scale />, tone: "accent" as const, title: "Ten fraud rules", body: `Review at ${CONSTANTS.fraud.review_threshold}, hold at ${CONSTANTS.fraud.hold_threshold}, and a person decides.` },
  { icon: <Banknote />, tone: "info" as const, title: "Free Friday payouts", body: "Cleared money goes out Fridays at 18:00 UTC." },
  { icon: <Lock />, tone: "violet" as const, title: "Your data stays yours", body: "Tokens encrypted. No training on your videos without opt-in." },
] as const;

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security"
        title={
          <>
            Every dollar <HeroAccent>accounted for.</HeroAccent>
          </>
        }
        lede="flowd holds money in escrow and an append-only double-entry ledger, checks every view for fraud before it pays, and treats your data as yours. Here is how it works, and where our limits are."
        actions={
          <>
            <Link href="#escrow" className={buttonVariants({ variant: "primary", size: "lg" })}>
              How money is held
            </Link>
            <Link href="#vulnerability" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Report a vulnerability
            </Link>
          </>
        }
        meta={
          <nav aria-label="On this page" className="flex flex-wrap gap-2">
            {JUMPS.map((jump) => (
              <a key={jump.href} href={jump.href} className="inline-flex min-h-8 items-center rounded-pill bg-surface-field px-3 text-caption font-semibold text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg pointer-coarse:min-h-11">
                {jump.label}
              </a>
            ))}
          </nav>
        }
        art={
          <GlassCard padding="lg" className="mx-auto grid w-full max-w-[34rem] gap-5 lg:ml-auto">
            <p className="fd-eyebrow text-fg-subtle">Security at a glance</p>
            <ul className="grid gap-4">
              {GLANCE.map((item) => (
                <li key={item.title} className="flex items-start gap-4">
                  <IconTile tone={item.tone}>{item.icon}</IconTile>
                  <div className="grid gap-0.5">
                    <p className="text-body font-semibold text-fg">{item.title}</p>
                    <p className="text-body-sm text-fg-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </GlassCard>
        }
      />
      <EscrowSection />
      <FraudSection />
      <PayoutSection />
      <DisclosureSection />
      <PrivacySection />
      <SubprocessorsSection />
      <DisclosureProgramSection />
      <LimitsSection />
      <CtaBand
        title="Check our work."
        description="The Trust Center shows live numbers with their targets, and the Promise lists all eleven commitments."
        actions={
          <>
            <Link href="/trust" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Open the Trust Center
            </Link>
            <Link href="/promise" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Read the Promise
            </Link>
          </>
        }
      />
    </>
  );
}
