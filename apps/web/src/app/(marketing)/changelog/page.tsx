import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getServerState } from "@/lib/store/server";
import { selectChangelog } from "@/lib/data/selectors";
import { formatDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button-variants";
import { GlassCard } from "@/components/glass/glass";
import { CtaBand, HeroAccent, PageHero, SignupActions } from "@/components/features/marketing/pages/kit";
import { ChangelogView, type ChangelogItem } from "@/components/features/marketing/pages/changelog/changelog-view";
import { SubscribeCard } from "@/components/features/marketing/pages/subscribe";

export const metadata = buildMetadata({
  title: "Changelog",
  description: "Every flowd release, newest first, tagged new, improved, fix, trust or money, and filterable by creators and brands.",
  path: "/changelog",
});

export default async function ChangelogPage() {
  const db = await getServerState();
  const entries: ChangelogItem[] = selectChangelog(db, undefined).map((entry) => ({
    id: entry.id,
    date: entry.date,
    title: entry.title,
    body: entry.body,
    tags: entry.tags,
    audience: entry.audience,
    ...(entry.version ? { version: entry.version } : {}),
  }));
  const latest = entries[0];

  return (
    <>
      <PageHero
        eyebrow="Changelog"
        title={
          <>
            What shipped, <HeroAccent>week by week.</HeroAccent>
          </>
        }
        lede="We ship most weeks and write down what changed, in plain English, with the date. Trust and money changes are tagged so you can find the ones that touch your payouts."
        actions={
          <Link href="#entries" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Read the releases
          </Link>
        }
        art={
          <div className="mx-auto grid w-full max-w-[34rem] gap-4 lg:ml-auto">
            {latest ? (
              <GlassCard padding="lg" className="grid gap-3">
                <p className="fd-eyebrow text-fg-subtle">Latest · {formatDate(latest.date, "medium")}</p>
                <h2 className="font-display text-title-lg text-fg">{latest.title}</h2>
                <p className="text-body text-fg-muted">{latest.body}</p>
                {latest.version ? <p className="font-mono text-code text-fg-subtle">v{latest.version}</p> : null}
              </GlassCard>
            ) : null}
            <SubscribeCard topic="changelog" title="Get the releases by email" description="One short email when something ships. No marketing in between." action="Subscribe" />
          </div>
        }
      />
      <ChangelogView entries={entries} />
      <CtaBand title="See it in your own hands." description="Everything in this list is in the demo. Create an account and try it." actions={<SignupActions />} />
    </>
  );
}
