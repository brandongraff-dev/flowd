import Link from "next/link";
import { ClipboardCheck, LifeBuoy, ShieldAlert, UserSearch } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Container } from "@/components/shell/container";
import { GlassCard } from "@/components/glass/glass";
import { HeroAccent, IconTile, PageHero } from "@/components/features/marketing/pages/kit";
import { ReportForm } from "@/components/features/marketing/pages/trust/report-form";

export const metadata = buildMetadata({
  title: "Report a scam or abuse",
  description: "Report a pay-to-join ask, a fake brand, a burner-account demand or anything that feels wrong. No account needed. A person reads every report within 24 hours.",
  path: "/trust/report",
});

const NEXT_STEPS = [
  { icon: <UserSearch />, tone: "accent" as const, title: "A person reads it", body: "Within 24 hours, with your evidence next to the brand's history and Scorecard." },
  { icon: <ShieldAlert />, tone: "ember" as const, title: "We act if it holds up", body: "A warning, a removed bounty, or a suspension. Funds in escrow stay protected." },
  { icon: <ClipboardCheck />, tone: "mint" as const, title: "You get the outcome", body: "Your case ID tracks it, and if you left an email we write when it is decided." },
];

export default function ReportPage() {
  return (
    <>
      <PageHero
        id="report"
        size="lg"
        eyebrow="Trust Center"
        title={
          <>
            Report a scam <HeroAccent>or abuse.</HeroAccent>
          </>
        }
        lede="Tell us what happened. You do not need an account, and a person reads every report. Nothing about your own account changes because you reported."
      />
      <Container size="content" className="grid gap-8 pb-16 md:pb-24 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)] lg:items-start lg:gap-10">
        <ReportForm />
        <aside aria-label="What happens next" className="grid gap-5 lg:sticky lg:top-24">
          <GlassCard padding="lg" className="grid gap-6">
            <h2 className="font-display text-title-md text-fg">What happens next</h2>
            <ol className="grid gap-5">
              {NEXT_STEPS.map((step) => (
                <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
                  <IconTile tone={step.tone}>{step.icon}</IconTile>
                  <div className="grid gap-0.5">
                    <h3 className="text-body font-semibold text-fg">{step.title}</h3>
                    <p className="text-body-sm text-fg-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </GlassCard>
          <GlassCard padding="md" className="grid gap-3">
            <p className="flex items-center gap-2.5 text-body font-semibold text-fg">
              <LifeBuoy aria-hidden="true" className="size-5 text-accent" strokeWidth={1.75} />
              If you feel unsafe
            </p>
            <p className="text-body-sm text-fg-muted">Contact your local emergency services first. For threats or harassment from someone on flowd, report it here and block them in the app.</p>
            <Link href="/help#safety" className="text-body-sm font-semibold text-accent underline underline-offset-4">
              Safety help and the community rules
            </Link>
          </GlassCard>
        </aside>
      </Container>
    </>
  );
}
