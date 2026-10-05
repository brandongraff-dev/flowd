/**
 * The command-palette index, fed from the demo world: the signed-in persona's own bounties, submissions, posts, lessons and creators, plus pages and
 * actions. `useSearch` (in `@/lib/search`) ranks it; this selector only decides what is in it.
 */

import type { Role } from "@/lib/contract/types";
import { buildSearchIndex } from "@/lib/search/build";
import type { SearchIndex, SearchableBounty, SearchableSubmission } from "@/lib/search/types";
import { defineSelector, groupBy, valuesOf, type Db } from "../select";

const ROLE_OF = { brand: "brand_member", creator: "creator", admin: "admin" } as const satisfies Record<string, Role>;
/** The most entities of one kind in the index (the palette ranks and shows a handful; this keeps the build cheap). */
const CAP = 250;

type SearchDb = Db<"session" | "bounties" | "apps" | "brands" | "creators" | "submissions" | "posts" | "lessons">;

export const selectSearchIndex = defineSelector(["session", "bounties", "apps", "brands", "creators", "submissions", "posts", "lessons"] as const, (db: SearchDb): SearchIndex => {
  const s = db.session;
  const role: Role | null = s.persona ? ROLE_OF[s.persona] : null;
  const bounty = (b: SearchDb["bounties"][string]): SearchableBounty => ({ id: b.id, title: b.title, status: b.status, app_name: db.apps[b.app_id]?.name, brand_name: db.brands[b.brand_id]?.name, category: db.apps[b.app_id]?.category, cpm_cents: b.cpm_cents, funded: b.funded });
  const submission = (x: SearchDb["submissions"][string]): SearchableSubmission => ({ id: x.id, title: x.title, status: x.status, creator_handle: db.creators[x.creator_id]?.handle, bounty_title: db.bounties[x.bounty_id]?.title });

  if (role === "brand_member" && s.brand_id) {
    const brandId = s.brand_id;
    return buildSearchIndex({
      role,
      bounties: groupBy(db.bounties, "brand", (b) => b.brand_id).get(brandId).map(bounty),
      apps: groupBy(db.apps, "brand", (a) => a.brand_id).get(brandId),
      creators: valuesOf(db.creators).slice(0, CAP),
      submissions: groupBy(db.submissions, "brand", (x) => x.brand_id).get(brandId).filter((x) => x.status === "in_review" || x.status === "changes_requested" || x.status === "approved").slice(0, CAP).map(submission),
    });
  }
  if (role === "creator" && s.creator_id) {
    const me = s.creator_id;
    return buildSearchIndex({
      role,
      bounties: valuesOf(db.bounties).filter((b) => b.status === "live" && b.funded && (b.visibility === "open" || b.visibility === "drop")).slice(0, CAP).map(bounty),
      brands: valuesOf(db.brands).filter((b) => b.kind !== "platform").slice(0, CAP).map((b) => ({ id: b.id, name: b.name })),
      submissions: groupBy(db.submissions, "creator", (x) => x.creator_id).get(me).slice(0, CAP).map(submission),
      posts: groupBy(db.posts, "creator", (p) => p.creator_id).get(me).slice(0, CAP).map((p) => ({ id: p.id, title: p.tags.hook_words, bounty_title: db.bounties[p.bounty_id]?.title, status: p.status })),
      lessons: valuesOf(db.lessons).map((l) => ({ slug: l.slug, title: l.title, minutes: l.read_minutes })),
    });
  }
  if (role === "admin") {
    return buildSearchIndex({
      role,
      bounties: valuesOf(db.bounties).slice(0, CAP).map(bounty),
      creators: valuesOf(db.creators).slice(0, CAP),
      brands: valuesOf(db.brands).filter((b) => b.kind !== "platform").map((b) => ({ id: b.id, name: b.name })),
    });
  }
  return buildSearchIndex({ role: null });
});
