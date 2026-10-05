import { Check, ShieldCheck } from "lucide-react";
import { ArtSurface } from "@/components/brand";
import { Badge, Money } from "@/components/ui";
import type { Wrapped, WrappedCard } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import "./wrapped.css";

/** The figure's type size follows its length, so "$1,210.82" and a quoted hook both fit the card. */
function figureClass(figure: string): string {
  if (figure.length <= 9) return "text-display-xl";
  if (figure.length <= 16) return "text-display-md";
  return "text-title-lg";
}

function Compare({ wrapped }: { wrapped: Wrapped }) {
  const max = Math.max(wrapped.total_cleared_cents, wrapped.tier_median_cents, 1);
  const rows = [
    { id: "you", label: "You", cents: wrapped.total_cleared_cents, strong: true },
    { id: "typical", label: `Typical ${wrapped.tier[0].toUpperCase()}${wrapped.tier.slice(1)} (median)`, cents: wrapped.tier_median_cents, strong: false },
  ];
  return (
    <ul className="grid gap-3" aria-label="You against the typical creator">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-body-sm text-white">
            <span className="font-semibold">{row.label}</span>
            <Money cents={row.cents} size="sm" icon={false} className="text-white" />
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/20">
            <div className={cn("h-full rounded-full", row.strong ? "bg-white" : "bg-white/60")} style={{ width: `${Math.max(3, Math.round((row.cents / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface StoryCardProps {
  card: WrappedCard;
  wrapped: Wrapped;
  /** The content of the final "share" card, supplied by the viewer. */
  children?: React.ReactNode;
}

/**
 * One story card: the recap's generated art, a scrim so white text always clears AA, the title, one hero figure and one sentence.
 * The typical-creator card draws you against the median in two bars, direct-labelled. The trials card names what it counts.
 */
export function StoryCard({ card, wrapped, children }: StoryCardProps) {
  return (
    <div className="relative isolate size-full overflow-hidden rounded-[inherit] text-white">
      <div className="absolute inset-0 -z-10">
        <ArtSurface art={card.art} aspect="9:16" />
        <div aria-hidden="true" className="absolute inset-0 bg-black/10" />
        <div aria-hidden="true" className="fd-media-scrim absolute inset-0" />
      </div>
      <div className="flex size-full flex-col justify-end gap-4 p-6 pt-24 sm:p-7 sm:pt-24">
        <p key={`${card.kind}-title`} className="fd-story-rise text-body font-semibold tracking-wide text-white/85 uppercase" data-delay="0">
          {card.title}
        </p>
        {card.kind === "share" ? (
          children
        ) : (
          <>
            {card.figure ? (
              <p key={`${card.kind}-figure`} className={cn("fd-story-rise font-display leading-[0.98] font-extrabold tracking-tight text-balance text-white", figureClass(card.figure))} data-delay="1">
                {card.figure}
              </p>
            ) : null}
            {card.kind === "typical" ? <Compare wrapped={wrapped} /> : null}
            <p key={`${card.kind}-caption`} className="fd-story-rise max-w-[34ch] text-body-lg text-pretty text-white/90" data-delay="2">
              {card.caption}
            </p>
            {card.kind === "earnings" ? (
              <Badge tone="mint" variant="solid" size="lg" icon={<Check />} className="w-fit">
                Cleared, not pending
              </Badge>
            ) : null}
            {card.kind === "trials" ? (
              <Badge tone="neutral" variant="solid" size="lg" icon={<ShieldCheck />} className="w-fit bg-white text-black">
                Tracked only
              </Badge>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
