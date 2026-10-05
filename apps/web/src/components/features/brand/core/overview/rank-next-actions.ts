import type { BrandOverview } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";

export interface RankedAction {
  id: string;
  title: string;
  /** What and why, in one or two sentences, with the sample size where a number is involved. */
  detail: string;
  href: string;
  /** The label of the one-tap action. */
  cta: string;
  /** Higher ranks first. */
  score: number;
}

/** The base rank of the store's own suggestions: money and decisions that block creators first, then setup, then growth. */
const BASE_SCORE: Record<string, { score: number; cta: string }> = {
  queue: { score: 90, cta: "Open the queue" },
  wallet: { score: 80, cta: "Top up" },
  draft: { score: 70, cta: "Finish draft" },
  connect: { score: 65, cta: "Connect" },
  launch: { score: 60, cta: "Start a bounty" },
  promote: { score: 40, cta: "Promote" },
};

/**
 * The ranked next-best-actions for the overview. Three sources, merged and sorted:
 *  1. the store's own suggestions (clear the queue, top up, finish a draft, connect attribution, launch, promote),
 *  2. a rehire signal from the creator league (cost per trial across at least two settled posts, with the sample size named),
 *  3. a price signal when a live bounty pays under the category's p25 CPM (it will fill slower, and the Market view says by how much).
 *
 * Every number named in a detail line is in the data the page already shows, and a small sample is said to be small. When the Insights layer
 * publishes its own ranked feed, merge it into `extra`: this function only sorts and trims.
 */
export function rankNextActions(overview: BrandOverview, extra: readonly RankedAction[] = [], limit = 4): RankedAction[] {
  const out: RankedAction[] = overview.next_actions.map((action) => {
    const base = BASE_SCORE[action.id] ?? { score: 50, cta: "Open" };
    return { id: action.id, title: action.title, detail: action.detail, href: action.href, cta: base.cta, score: base.score };
  });

  const league = overview.funnel?.league ?? [];
  const overall = overview.funnel?.stats.cost_per_trial_cents ?? null;
  const best = league.find((row) => row.creator && row.n >= 2 && row.cost_per_trial_cents !== null && row.funnel.trials >= 5);
  if (best?.creator && best.cost_per_trial_cents !== null && overall !== null && best.cost_per_trial_cents < overall) {
    out.push({
      id: `rehire-${best.creator.id}`,
      title: `Rehire @${best.creator.handle}`,
      detail: `${formatMoney(best.cost_per_trial_cents)} per trial across ${best.n} posts, against ${formatMoney(overall)} for the workspace. A small sample: judge it again after the next post.`,
      href: `/brand/creators/${best.creator.handle}`,
      cta: "View creator",
      score: 55,
    });
  }

  const market = overview.market;
  if (market && !market.thin_market) {
    const cheap = overview.live_bounties.find((b) => b.cpm_cents > 0 && b.cpm_cents < market.stats.p25_cpm_cents && b.hours_left > 24);
    if (cheap) {
      out.push({
        id: `price-${cheap.id}`,
        title: `Review the price on "${cheap.title}"`,
        detail: `It pays ${formatMoney(cheap.cpm_cents)} per 1,000 views. The ${market.label} median is ${formatMoney(market.stats.clearing_cpm_cents)} and a quarter of bounties pay under ${formatMoney(market.stats.p25_cpm_cents)}, so it fills slower.`,
        href: "/brand/market",
        cta: "Open Market",
        score: 62,
      });
    }
  }

  return [...out, ...extra]
    .sort((a, b) => b.score - a.score)
    .filter((action, index, all) => all.findIndex((x) => x.id === action.id) === index)
    .slice(0, limit);
}
