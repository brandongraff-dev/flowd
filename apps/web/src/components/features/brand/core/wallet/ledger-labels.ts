/** Plain names for ledger accounts ("wallet:br_lumi" is "Your wallet"). Pure; the lookups are passed in so it works on the server and in tests. */

export interface AccountNames {
  /** Bounty id to title. */
  bounties?: ReadonlyMap<string, string>;
  /** Creator id to handle (with or without the @). */
  creators?: ReadonlyMap<string, string>;
}

const PLATFORM: Record<string, string> = {
  fees: "flowd platform fee",
  subscriptions: "flowd subscription",
  processing: "Card processing",
  matching: "flowd matching pool",
  promo: "flowd promotions",
};

const EXTERNAL: Record<string, string> = { card: "Your card", bank: "Your bank account" };

export function accountLabel(account: string, names: AccountNames = {}): string {
  const i = account.indexOf(":");
  if (i <= 0) return account;
  const kind = account.slice(0, i);
  const id = account.slice(i + 1);
  switch (kind) {
    case "wallet":
      return "Your wallet";
    case "escrow":
      return `Escrow: ${names.bounties?.get(id) ?? id}`;
    case "creator": {
      const handle = names.creators?.get(id);
      return handle ? `Creator @${handle.replace(/^@/, "")}` : "Creator";
    }
    case "platform":
      return PLATFORM[id] ?? `flowd ${id}`;
    case "external":
      return EXTERNAL[id] ?? id;
    default:
      return account;
  }
}
