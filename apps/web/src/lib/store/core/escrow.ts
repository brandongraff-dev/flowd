/**
 * A bounty's money inside the store: escrow state, Reserved Slots and the live / filled flip.
 *
 * The identity `escrow_funded = reserved + spent + remaining + refunded` is kept by routing every change through the engine's pure helpers
 * (`reserveSlot`, `releaseSlot`, `settleReservation`, `settleBounty`) and writing the result back with `applyEscrow`.
 */

import type { Bounty } from "@/lib/contract/types";
import {
  escrowIdentityHolds,
  escrowStateOf,
  hoursBetween,
  isFunded,
  releaseSlot,
  reservationUnit,
  reserveSlot,
  spotsLeft,
  toMs,
  type EscrowState,
} from "@/lib/engine";
import { ActionError, ensure, type Tx } from "./tx";

/** One reservation unit of a bounty: the per-video cap plus the fee on it. */
export const unitOf = (b: Pick<Bounty, "per_video_cap_cents" | "take_rate">): number => reservationUnit({ per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate });

/** Spots a bounty can still take. */
export const spotsOf = (b: Pick<Bounty, "remaining_cents" | "per_video_cap_cents" | "take_rate">): number =>
  spotsLeft({ remaining_cents: b.remaining_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate });

export const escrowOf = (b: Bounty): EscrowState => escrowStateOf(b);

/**
 * Writes an escrow state back to the bounty, recomputes `funded` and flips live and filled. The identity is checked here so a bug in a caller
 * fails loudly in tests instead of corrupting the ledger.
 */
export function applyEscrow(tx: Tx, bountyId: string, escrow: EscrowState, extra: Partial<Bounty> = {}): Bounty {
  if (!escrowIdentityHolds(escrow)) throw new Error(`Escrow identity broken for ${bountyId}: ${JSON.stringify(escrow)}`);
  const b = tx.must("bounties", bountyId, "Bounty");
  const merged: Bounty = { ...b, ...extra, ...escrow };
  tx.patch("bounties", bountyId, { ...extra, ...escrow, funded: isFunded(merged), updated_at: tx.now });
  return syncCapacity(tx, bountyId);
}

/** live -> filled when no unit is left, filled -> live when one frees up (and the bounty has not ended). */
export function syncCapacity(tx: Tx, bountyId: string): Bounty {
  const b = tx.must("bounties", bountyId, "Bounty");
  const spots = spotsOf(b);
  if (b.status === "live" && spots === 0) {
    const from = b.published_at ?? b.starts_at;
    return tx.patch("bounties", bountyId, { status: "filled", filled_at: tx.now, time_to_fill_hours: Math.round(hoursBetween(from, tx.now) * 10) / 10, updated_at: tx.now });
  }
  if (b.status === "filled" && spots >= 1 && toMs(b.ends_at) > toMs(tx.now)) {
    return tx.patch("bounties", bountyId, { status: "live", updated_at: tx.now });
  }
  return b;
}

/** A submission takes a Reserved Slot. Throws `bounty_filled` when the pool cannot cover one more video. Returns the reserved cents. */
export function reserveFor(tx: Tx, bountyId: string): number {
  const b = tx.must("bounties", bountyId, "Bounty");
  const r = reserveSlot(escrowOf(b), unitOf(b));
  if (!r.ok) throw new ActionError("bounty_filled", "This bounty has no spot left right now.", "A spot opens when a pending video is rejected or withdrawn, or the brand tops up.", 409);
  applyEscrow(tx, bountyId, r.state);
  return r.reserved_cents;
}

/** A rejection, withdrawal, expiry, release or posting gives the reservation back to the pool. */
export function releaseFor(tx: Tx, bountyId: string, reservedCents: number): void {
  if (reservedCents <= 0) return;
  const b = tx.must("bounties", bountyId, "Bounty");
  applyEscrow(tx, bountyId, releaseSlot(escrowOf(b), reservedCents));
}

/** Throws unless the bounty is open for submissions right now (live, or filled when a spot has come back is handled by `syncCapacity`). */
export function ensureOpen(b: Bounty): void {
  ensure(b.funded, "bounty_not_funded", "This bounty is not fully funded yet, so it cannot take submissions.", "The brand has to fund the escrow before it goes live.", 409);
  ensure(b.status === "live", "bounty_closed", b.status === "filled" ? "This bounty is full right now." : `This bounty is ${b.status.replace(/_/g, " ")}.`, b.status === "filled" ? "A spot opens when a pending video is rejected or withdrawn." : undefined, 409);
}
