import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { formatClockEta, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { DemoTag } from "@/components/shell/demo-banner";
import { CtaBand, HeroAccent, PageHero, PageSection } from "@/components/features/marketing/pages/kit";
import { getStatusData } from "@/components/features/marketing/pages/status/status-data";
import { ComponentsSection, IncidentsSection } from "@/components/features/marketing/pages/status/status-view";
import { SubscribeCard } from "@/components/features/marketing/pages/subscribe";
import { buttonVariants } from "@/components/ui/button-variants";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "System status",
  description: "How flowd is running right now: API, uploads, payouts, webhooks and review SLAs, with 90-day uptime, incident history and email updates.",
  path: "/status",
});

export default async function StatusPage() {
  const data = await getStatusData();
  const Icon = data.overall === "operational" ? CircleCheck : data.overall === "degraded" ? CircleAlert : CircleX;
  const tone = data.overall === "operational" ? "bg-mint-soft text-mint" : data.overall === "degraded" ? "bg-sun-soft text-sun" : "bg-rose-soft text-rose";

  return (
    <>
      <PageHero
        eyebrow="System status"
        title={
          <>
            How flowd is running, <HeroAccent>right now.</HeroAccent>
          </>
        }
        lede="The systems your money and your videos depend on, with the last 90 days of uptime and every incident written up in plain words. Subscribe and we will tell you before you have to ask."
        actions={
          <Link href="#components" className={buttonVariants({ variant: "primary", size: "lg" })}>
            See the components
          </Link>
        }
        art={
          <GlassCard padding="lg" role="status" className="mx-auto grid w-full max-w-[34rem] gap-6 lg:ml-auto">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className={cn("grid size-14 shrink-0 place-items-center rounded-[20px] [&_svg]:size-7", tone)}>
                <Icon strokeWidth={1.75} />
              </span>
              <div className="grid gap-1">
                <h2 className="font-display text-title-lg text-balance text-fg">{data.headline}</h2>
                <p className="text-caption text-fg-subtle">Checked {formatDateTime(data.now)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <dt className="text-caption font-medium text-fg-muted">Uptime, 90 days</dt>
                <dd className="fd-figure text-figure-md text-fg">{data.avgUptime.toFixed(2)}%</dd>
              </div>
              <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <dt className="text-caption font-medium text-fg-muted">Next payout run</dt>
                <dd className="fd-figure text-figure-md text-fg">{formatClockEta(data.live.nextRunAt)}</dd>
              </div>
            </dl>
            <DemoTag />
          </GlassCard>
        }
      />
      <ComponentsSection data={data} />
      <IncidentsSection data={data} />
      <PageSection id="subscribe" eyebrow="Stay informed" title="Hear about it first" description="Subscribe to incident updates, or follow the changelog for what shipped." width="content">
        <div className="grid max-w-3xl gap-4">
          <SubscribeCard topic="status" title="Incident updates by email" description="An email when an incident starts, when it is identified and when it is resolved. Nothing else." action="Subscribe" />
        </div>
      </PageSection>
      <CtaBand
        title="Something not working for you?"
        description="If the status says all clear and you disagree, tell us. A person reads it."
        actions={
          <>
            <Link href="/help#contact" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Contact support
            </Link>
            <Link href="/changelog" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Read the changelog
            </Link>
          </>
        }
      />
    </>
  );
}
