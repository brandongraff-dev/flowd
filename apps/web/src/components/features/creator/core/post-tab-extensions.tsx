import type { ReactNode } from "react";
import type { PostLedger, PostView } from "@/lib/data/selectors";

/** What a tab of the post page receives: the post with its joins and its View Ledger (the heavy snapshot and conversion tables load on demand). */
export interface PostTabContext {
  post: PostView;
  ledger: PostLedger;
}

/** One tab of `/creator/posts/[id]`. `id` is the `?tab=` value, so a tab is linkable. */
export interface PostTabDef {
  id: string;
  label: string;
  render: (context: PostTabContext) => ReactNode;
}

/**
 * EXTENSION POINT for the post page's tabs. `post-detail.tsx` renders `[Overview, View Ledger, Money, ...EXTRA_POST_TABS]` in this order.
 *
 * web-insights-cr-admin adds the **Autopsy** tab here (docs/ROUTES.md section 7: `/creator/posts/[id]?tab=autopsy`, three drivers marked "likely driver,
 * not proof", the money-vs-viral quadrant and a beat-anchored fix). Append one entry; nothing else on the page changes:
 *
 * ```tsx
 * export const EXTRA_POST_TABS: readonly PostTabDef[] = [
 *   { id: "autopsy", label: "Autopsy", render: ({ post }) => <PostAutopsy postId={post.id} /> },
 * ];
 * ```
 */
export const EXTRA_POST_TABS: readonly PostTabDef[] = [];
