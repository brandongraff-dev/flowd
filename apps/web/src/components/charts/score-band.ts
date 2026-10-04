/** The checklist score bands (contract SCORE_BAND_META): A 85+, B 70 to 84, C 55 to 69, D 40 to 54, E under 40. Pure, so server components can use it. */

export type ScoreBandLetter = "A" | "B" | "C" | "D" | "E";

export interface BandSpec {
  letter: ScoreBandLetter;
  /** Lower bound (inclusive) of the band. Mirrors the contract's SCORE_BAND_META: A 85+, B 70, C 55, D 40, E below. */
  from: number;
  word: string;
  /** Text-safe token for the arc (3:1 against the track on both themes). */
  color: string;
}

const BANDS: readonly BandSpec[] = [
  { letter: "A", from: 85, word: "Strong", color: "var(--fd-mint)" },
  { letter: "B", from: 70, word: "Good", color: "var(--fd-accent)" },
  { letter: "C", from: 55, word: "Okay", color: "var(--fd-info)" },
  { letter: "D", from: 40, word: "Needs work", color: "var(--fd-ember)" },
  { letter: "E", from: 0, word: "Fix before posting", color: "var(--fd-rose)" },
];

/** Band of a 0-100 checklist score (A 85+, B 70-84, C 55-69, D 40-54, E under 40). */
export function scoreBand(score: number): BandSpec {
  return BANDS.find((band) => score >= band.from) ?? (BANDS[BANDS.length - 1] as BandSpec);
}
