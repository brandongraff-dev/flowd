/**
 * Attribution at approval: the deterministic tracking link (always) and a promo code from the app's offer-code pool (when one is free).
 *
 * Apple caps active offer codes at 10 per subscription SKU, so codes are pooled and rotated, never one per creator forever; the link is the
 * fallback that always works (CPA pays on link and code only).
 */

import type { App, AttributionLink, Bounty, Creator, OfferCode } from "@/lib/contract/types";
import { addDays, assignOfferCode, deepLink, promoCodeText, shortUrl, trackingCode } from "@/lib/engine";
import { pad, slug } from "../ids";
import type { Tx } from "./tx";

/** The app's deep-link scheme: its first name token ("lumi" for "Lumi", "wordwave" for "Wordwave"). */
export const schemeOf = (app: Pick<App, "name">): string => slug(app.name).split("-")[0] || "app";

/** The subscription SKU the app's pool is mostly made of (the annual plan), or null when the app has no pool yet. */
function skuOf(pool: readonly OfferCode[]): { sku: string; offer_name: string } | null {
  const counts = new Map<string, { n: number; offer_name: string }>();
  for (const c of pool) {
    const cur = counts.get(c.sku) ?? { n: 0, offer_name: c.offer_name };
    counts.set(c.sku, { n: cur.n + 1, offer_name: cur.offer_name });
  }
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
  return best ? { sku: best[0], offer_name: best[1].offer_name } : null;
}

export interface IssuedTracking {
  link: AttributionLink;
  /** The promo code assigned, when the pool had room. */
  promo_code?: string;
  /** What the pool decided ("assign_available", "create_new", "rotate", "link_only", "reuse"). */
  code_action: string;
}

/** Issues the tracking link and, when possible, a promo code for an approved submission. Idempotent per (creator, bounty): a second call reuses the link. */
export function issueTracking(tx: Tx, p: { creator: Creator; bounty: Bounty; app: App }): IssuedTracking {
  const { creator, bounty, app } = p;
  const existing = tx.all("attribution_links").find((l) => l.creator_id === creator.id && l.bounty_id === bounty.id);
  if (existing) return { link: existing, promo_code: existing.promo_code, code_action: "reuse" };

  const taken = new Set(tx.all("attribution_links").map((l) => l.code));
  const code = trackingCode({ creator_handle: creator.handle, app_slug: slug(app.name), taken });

  const pool = tx.all("offer_code_pool").filter((c) => c.app_id === app.id);
  const sku = skuOf(pool);
  let promo: string | undefined;
  let action = "link_only";
  const linkId = `lnk_${code.replace(/-/g, "_")}`;
  if (sku) {
    const ended = tx.all("bounties").filter((b) => b.app_id === app.id && (b.status === "ended" || b.status === "settled")).map((b) => b.id);
    const decision = assignOfferCode({ pool, app_id: app.id, sku: sku.sku, creator_id: creator.id, bounty_id: bounty.id, now: tx.now, desired_code: promoCodeText(creator.handle, slug(app.name)), ended_bounty_ids: ended });
    action = decision.action;
    if (decision.action === "reuse" || decision.action === "assign_available") {
      promo = decision.code.code;
      tx.patch("offer_code_pool", decision.code.id, { status: "assigned", assigned_creator_id: creator.id, assigned_bounty_id: bounty.id, assigned_link_id: linkId, assigned_at: tx.now });
    } else if (decision.action === "create_new" || decision.action === "rotate") {
      if (decision.action === "rotate") tx.patch("offer_code_pool", decision.retire.id, { status: "retired" });
      promo = decision.new_code;
      const stem = `occ_${slug(app.name).replace(/-/g, "")}_`;
      let n = pool.length + 1;
      while (tx.get("offer_code_pool", `${stem}${pad(n, 3)}`)) n += 1;
      tx.put("offer_code_pool", {
        id: `${stem}${pad(n, 3)}`,
        app_id: app.id,
        sku: sku.sku,
        offer_name: sku.offer_name,
        code: decision.new_code,
        status: "assigned",
        assigned_creator_id: creator.id,
        assigned_bounty_id: bounty.id,
        assigned_link_id: linkId,
        assigned_at: tx.now,
        redemptions: 0,
        max_redemptions: 25_000,
        valid_from: tx.now,
        valid_until: addDays(tx.now, 365),
        rotation_due_at: addDays(tx.now, 90),
        created_at: tx.now,
      });
    }
  }
  const link: AttributionLink = {
    id: linkId,
    creator_id: creator.id,
    bounty_id: bounty.id,
    app_id: app.id,
    code,
    short_url: shortUrl(code),
    deep_link: deepLink(schemeOf(app), code),
    ...(promo ? { promo_code: promo } : {}),
    status: "active",
    created_at: tx.now,
    clicks: 0,
    installs: 0,
    trials: 0,
    paid: 0,
  };
  tx.put("attribution_links", link);
  return { link, promo_code: promo, code_action: action };
}
