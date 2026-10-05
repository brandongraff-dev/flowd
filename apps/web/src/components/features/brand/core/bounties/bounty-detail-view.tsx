"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ellipsis, ListChecks, Pause, Pencil, Play, Settings2, WalletMinimal } from "lucide-react";
import { BOUNTY_STATUS_META, VISIBILITY_META } from "@/lib/contract/types";
import { useBountyDetail, useStoreReady } from "@/lib/data";
import type { BountyDetail } from "@/lib/data/selectors";
import { formatDaysLeft, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { DomainStatusPill } from "@/components/brand/domain-status";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notify } from "@/components/ui/toast";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { BrandNotFoundState } from "../page-states";
import { useUrlParam } from "../common";
import { CreatorsTab } from "./detail-creators";
import { FunnelTab } from "./detail-funnel";
import { OverviewTab } from "./detail-overview";
import { SettingsTab } from "./detail-settings";
import { SubmissionsTab } from "./detail-submissions";
import { FundBountyDialog } from "./fund-bounty-dialog";

const TABS = ["overview", "submissions", "funnel", "creators", "settings"] as const;
type DetailTab = (typeof TABS)[number];

/**
 * `/brand/bounties/[id]`: one bounty in five tabs (`?tab=`): Overview (status, Funded, pool, reserved, settled, left, fill, SLA, brief, rights), Submissions
 * (with flags, and where every post is in settlement, and clawbacks), Funnel, Creators and Settings (pause, extend, top up, close, feature pin). A
 * draft sends you back to the builder; a bounty waiting on money offers the funding sheet right here.
 */
export function BountyDetailView({ id }: { id: string }) {
  const ready = useStoreReady();
  const detail = useBountyDetail(id);

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the bounty" className="grid gap-8">
        <div className="grid gap-3">
          <Skeleton shape="text" className="h-3 w-24" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton shape="text" className="w-2/3" />
        </div>
        <Skeleton className="h-10 w-96" shape="pill" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-[28px]" />
          <Skeleton className="h-80 rounded-[28px]" />
        </div>
      </SkeletonGroup>
    );
  }
  if (!detail) {
    return <BrandNotFoundState title="That bounty is not in this workspace" description="It may belong to another workspace, or the link is old. Your bounties are listed under Bounties." backHref="/brand/bounties" backLabel="Back to bounties" />;
  }
  return (
    <Suspense fallback={null}>
      <Detail detail={detail} />
    </Suspense>
  );
}

function Detail({ detail }: { detail: BountyDetail }) {
  const router = useRouter();
  const { bounty } = detail;
  const [tab, setTab] = useUrlParam<DetailTab>("tab", TABS, "overview");
  const [fundOpen, setFundOpen] = useState(false);
  const status = BOUNTY_STATUS_META[bounty.status];
  const isDraft = bounty.status === "draft";
  const needsFunding = bounty.status === "awaiting_funding";
  const inReview = detail.review.in_review;

  const pause = async (): Promise<void> => {
    const result = await actions.pauseBounty({ bounty_id: bounty.id });
    if (result.ok) notify.undo("Bounty paused", { description: "No new submissions. Videos in review are still decided and paid.", onUndo: () => void actions.resumeBounty({ bounty_id: bounty.id }) });
    else notify.error(result.error.message, { description: result.error.hint });
  };
  const resume = async (): Promise<void> => {
    const result = await actions.resumeBounty({ bounty_id: bounty.id });
    if (result.ok) notify.success("Bounty resumed");
    else notify.error(result.error.message, { description: result.error.hint });
  };

  const primary = isDraft ? (
    <Link href={`/brand/bounties/new?draft=${bounty.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
      <Pencil aria-hidden="true" />
      Continue in the builder
    </Link>
  ) : needsFunding ? (
    <Button variant="primary" leadingIcon={<WalletMinimal aria-hidden="true" />} onClick={() => setFundOpen(true)}>
      Fund to go live
    </Button>
  ) : inReview > 0 ? (
    <Link href={`/brand/review?bounty=${bounty.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
      <ListChecks aria-hidden="true" />
      Review {pluralise(inReview, "video")}
    </Link>
  ) : null;

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as DetailTab)} variant="underline" className="grid gap-8">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <AppIcon art={bounty.app.icon} name={bounty.app.name} size={20} decorative />
            {bounty.app.name}
          </span>
        }
        title={bounty.title}
        description={bounty.brief.summary}
        actions={
          <>
            {primary}
            {bounty.status === "live" || bounty.status === "filled" ? (
              <Button variant="secondary" leadingIcon={<Pause aria-hidden="true" />} onClick={pause}>
                Pause
              </Button>
            ) : null}
            {bounty.status === "paused" ? (
              <Button variant="secondary" leadingIcon={<Play aria-hidden="true" />} onClick={resume}>
                Resume
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="secondary" label="More actions" icon={<Ellipsis />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={<Settings2 />} onSelect={() => setTab("settings")}>
                  Settings and money
                </DropdownMenuItem>
                <DropdownMenuItem icon={<ListChecks />} onSelect={() => router.push(`/brand/review?bounty=${bounty.id}`)}>
                  Open the review queue
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<WalletMinimal />} onSelect={() => router.push("/brand/wallet?tab=ledger")}>
                  See it in the ledger
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        meta={
          <>
            {bounty.funded && ["live", "scheduled", "paused", "filled"].includes(bounty.status) ? <StatusPill status="funded" size="lg" /> : null}
            {needsFunding ? <StatusPill status="unfunded" size="lg" /> : null}
            {bounty.status !== "awaiting_funding" ? <DomainStatusPill meta={status} value={bounty.status} size="lg" /> : null}
            <Badge tone="neutral" size="lg">
              {bounty.type_label}
            </Badge>
            <Badge tone="neutral" variant="outline" size="lg">
              {VISIBILITY_META[bounty.visibility].label}
            </Badge>
            {bounty.is_open ? (
              <Badge tone="neutral" size="lg">
                {formatDaysLeft(bounty.ends_at)}
              </Badge>
            ) : null}
            {bounty.decides_in ? (
              <Badge tone="neutral" variant="outline" size="lg">
                {bounty.decides_in}
              </Badge>
            ) : null}
            <DemoTag />
          </>
        }
        tabs={
          <TabsList aria-label="Bounty sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="submissions" count={detail.submissions.length}>
                Submissions
              </TabsTrigger>
              <TabsTrigger value="funnel">Funnel</TabsTrigger>
              <TabsTrigger value="creators" count={detail.creators.length}>
                Creators
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        }
      />

      <TabsContent value="overview" className="mt-0 min-w-0">
        <OverviewTab detail={detail} onFund={() => setFundOpen(true)} />
      </TabsContent>
      <TabsContent value="submissions" className="mt-0 min-w-0">
        <SubmissionsTab detail={detail} />
      </TabsContent>
      <TabsContent value="funnel" className="mt-0 min-w-0">
        <FunnelTab detail={detail} />
      </TabsContent>
      <TabsContent value="creators" className="mt-0 min-w-0">
        <CreatorsTab detail={detail} />
      </TabsContent>
      <TabsContent value="settings" className="mt-0 min-w-0">
        <SettingsTab detail={detail} onFund={() => setFundOpen(true)} />
      </TabsContent>

      <FundBountyDialog bounty={bounty} open={fundOpen} onOpenChange={setFundOpen} />
    </Tabs>
  );
}
