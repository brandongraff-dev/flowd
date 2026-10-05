import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectCreatorWallet } from "@/lib/data/selectors";
import { DEMO_IDS } from "@/lib/constants";
import type { ArtSeed } from "@/components/brand/art";

export interface WalletRowDto {
  id: string;
  label: string;
  appName: string;
  appArt: ArtSeed;
  amountCents: number;
  state: "pending" | "cleared" | "paid" | "accruing" | "held" | "reversed";
  /** "Clears Sat 2:00 PM UTC", or the reason when there is no date. */
  when: string;
}

export interface AppPageData {
  handle: string;
  clearedCents: number;
  pendingCents: number;
  /** "Fri 6:00 PM" style label of the next free weekly payout, or null. */
  nextPayoutAt: string | null;
  rows: readonly WalletRowDto[];
}

/** The numbers inside the phone mock-up: the demo creator's real wallet from the demo world, so the screen on the page is the screen in the app. */
export const getAppPageData = cache(async (): Promise<AppPageData> => {
  const db = await getServerState();
  const wallet = selectCreatorWallet(db, { creator: DEMO_IDS.creator.creatorId });
  const rows: WalletRowDto[] = wallet.rows
    .filter((row) => row.app !== undefined)
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      label: row.label,
      appName: row.app?.name ?? "App",
      appArt: row.app?.icon ?? { hue_a: 250, hue_b: 210, hue_c: 180, pattern: "grid", seed: 7 },
      amountCents: row.amount_cents,
      state: row.state,
      when: row.description.eta_label ?? row.description.reason_label,
    }));
  return {
    handle: DEMO_IDS.creator.handle,
    clearedCents: wallet.summary.cleared_cents,
    pendingCents: wallet.summary.pending_cents,
    nextPayoutAt: wallet.next_payout?.at ?? null,
    rows,
  };
});
