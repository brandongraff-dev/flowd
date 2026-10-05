import Link from "next/link";
import { ArrowRight, Lock, Users } from "lucide-react";
import { ArtSurface } from "@/components/brand";
import { Glass } from "@/components/glass";
import { Badge, Money } from "@/components/ui";
import { ENTRY_STATUS_META, NICHE_META, TOURNAMENT_FORMAT_META, TOURNAMENT_STATUS_META } from "@/lib/contract/types";
import type { TournamentView } from "@/lib/data/selectors";
import { formatInt } from "@/lib/format";
import { whenLine } from "./tournament-meta";

/** A tournament as one link: generated banner with status and format, the sponsor, the pool as the number, entries, the date line and your standing. */
export function TournamentCard({ tournament: t }: { tournament: TournamentView }) {
  const status = TOURNAMENT_STATUS_META[t.status];
  const mine = t.my_entry;
  return (
    <li className="grid">
      <Glass
        layer={1}
        asChild
        className="group/tour grid h-full content-start gap-0 overflow-hidden rounded-2xl transition-transform duration-(--fd-dur-base) ease-out hover:-translate-y-0.5 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <Link href={`/creator/tournaments/${t.id}`}>
          <div className="relative h-32 overflow-hidden">
            <ArtSurface art={t.art} aspect="16:9" />
            <div aria-hidden="true" className="fd-media-scrim absolute inset-0" />
            <div className="absolute inset-x-4 top-3 flex items-center justify-between gap-2">
              <Badge tone={status.tone} variant="solid" size="md">
                {status.label}
              </Badge>
              <Badge tone="neutral" variant="solid" size="md" className="bg-black/55 text-white">
                {TOURNAMENT_FORMAT_META[t.format].label}
              </Badge>
            </div>
            <p className="absolute inset-x-4 bottom-3 truncate text-caption font-semibold text-white/90">Sponsored by {t.sponsor_label}</p>
          </div>
          <div className="grid gap-4 p-5">
            <div className="grid gap-1">
              <h3 className="font-display text-title-sm text-balance text-fg">{t.title}</h3>
              <p className="text-body-sm text-fg-muted">{t.tagline}</p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="grid gap-0.5">
                <span className="text-caption font-medium text-fg-subtle">Prize pool</span>
                <Money cents={t.prize_pool_cents} size="md" decimals="never" icon={false} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-fg-muted">
                <Users aria-hidden="true" className="size-4" />
                {formatInt(t.entries_count)} {t.entries_count === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {t.min_tier ? (
                <Badge tone="neutral" size="md" icon={<Lock />}>
                  {t.min_tier[0].toUpperCase() + t.min_tier.slice(1)}+
                </Badge>
              ) : null}
              {t.niche ? (
                <Badge tone={NICHE_META[t.niche].tone} size="md">
                  {NICHE_META[t.niche].label}
                </Badge>
              ) : null}
              {mine ? (
                <Badge tone={ENTRY_STATUS_META[mine.status].tone} variant="solid" size="md">
                  You: {ENTRY_STATUS_META[mine.status].label.toLowerCase()}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-divider pt-3 text-caption">
              <span className="min-w-0 text-fg-muted">{whenLine(t)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent">
                {t.status === "complete" ? "Results" : mine ? "Open" : t.can_enter ? "Enter" : "View"}
                <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-(--fd-dur-base) ease-out group-hover/tour:translate-x-0.5 motion-reduce:transition-none" />
              </span>
            </div>
          </div>
        </Link>
      </Glass>
    </li>
  );
}
