import type { ScoreBand } from "@/lib/contract/types";
import { SCORE_BAND_META } from "@/lib/contract/types";
import { bandDescriptor } from "@/lib/engine";
import { Badge } from "@/components/ui";

/** "Flow B · Solid · 82": the band as a letter AND a word and the points, so it never rests on colour alone. */
export function BandChip({ label, band, points }: { label: string; band: ScoreBand; points: number }) {
  return (
    <Badge size="lg" tone={SCORE_BAND_META[band].tone} variant="soft" title={`${label} Score, a checklist score: ${SCORE_BAND_META[band].meaning ?? ""}`}>
      <span className="font-semibold">{label}</span>
      <span className="font-display font-extrabold">{band}</span>
      <span className="font-normal opacity-80">
        {bandDescriptor(band)} · {points}
      </span>
    </Badge>
  );
}
