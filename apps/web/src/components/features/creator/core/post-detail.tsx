"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PLATFORM_META } from "@/lib/contract/types";
import { usePost, usePostLedger, useStoreReady } from "@/lib/data";
import { formatClockEta } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { GlassCard } from "@/components/glass";
import { PageHeader } from "@/components/shell";
import { Badge, EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, buttonVariants } from "@/components/ui";
import { PostStatusPill } from "./post-parts";
import { EXTRA_POST_TABS, type PostTabDef } from "./post-tab-extensions";
import { LedgerTab, MoneyTab, OverviewTab } from "./post-tabs";
import { useUrlState } from "./use-url-state";

/**
 * The tabs of `/creator/posts/[id]`, in order. Add a tab by appending to `EXTRA_POST_TABS` in `post-tab-extensions.tsx` (the Autopsy tab does); a tab is
 * linkable through `?tab=<id>`, and an unknown `?tab=` falls back to Overview.
 */
export const POST_TABS: readonly PostTabDef[] = [
  { id: "overview", label: "Overview", render: (context) => <OverviewTab {...context} /> },
  { id: "ledger", label: "View Ledger", render: (context) => <LedgerTab {...context} /> },
  { id: "money", label: "Money", render: (context) => <MoneyTab {...context} /> },
  ...EXTRA_POST_TABS,
];

/** `/creator/posts/[id]`: the post with its View Ledger, its money path and dispute, and the cap and clawback effects. */
export function PostDetail({ postId }: { postId: string }) {
  const ready = useStoreReady();
  const post = usePost(postId);
  const ledger = usePostLedger(postId);
  const url = useUrlState();
  const now = useNow();
  const requested = url.get("tab");
  const tab = POST_TABS.some((t) => t.id === requested) ? (requested as string) : "overview";

  if (!ready) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-24 w-full max-w-xl" />
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-96 w-full rounded-[28px]" />
      </div>
    );
  }
  if (!post) {
    return (
      <GlassCard>
        <EmptyState
          art="search"
          headingAs="h1"
          title="That post isn't here"
          description="It may belong to another account, or the link is old. Your posts are all in one list."
          action={
            <Link href="/creator/posts" className={buttonVariants({ variant: "primary" })}>
              Back to posts
            </Link>
          }
        />
      </GlassCard>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        breadcrumbs={
          <Link href="/creator/posts" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-caption font-semibold text-fg-muted hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
            Posts
          </Link>
        }
        eyebrow={`${PLATFORM_META[post.platform].label} post`}
        title={post.bounty.title}
        description={
          <>
            {post.app.name} · posted {formatClockEta(post.posted_at, { now })} UTC · “{post.tags.hook_words}…”
          </>
        }
        meta={
          <>
            <PostStatusPill status={post.status} />
            {post.dispute ? (
              <Badge tone="ember" size="md">
                Dispute {post.dispute.status.replace(/_/g, " ")}
              </Badge>
            ) : null}
            {post.is_winner ? (
              <Badge tone="sun" size="md">
                Winner
              </Badge>
            ) : null}
          </>
        }
      />

      <Tabs variant="underline" value={tab} onValueChange={(value) => url.set({ tab: value === "overview" ? null : value })}>
        <TabsList aria-label="Post sections">
          {POST_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {POST_TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-6">
            {tab === t.id ? t.render({ post, ledger }) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
