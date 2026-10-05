import type { ReactNode } from "react";
import { ArtAvatar, TierBadge, type TierName } from "@/components/brand";
import type { Creator } from "@/lib/contract/types";
import { cn } from "@/lib/utils";

export interface PersonProps {
  creator: Pick<Creator, "handle" | "display_name" | "avatar" | "tier">;
  /** Avatar diameter in px (default 40). */
  size?: number;
  /** Mark the signed-in creator. */
  you?: boolean;
  /** Show the tier medallion after the handle. */
  tier?: boolean;
  /** A line under the handle (a niche, a role, a rank note). Defaults to the display name. */
  detail?: ReactNode;
  className?: string;
}

/** A creator in a list: generated avatar, `@handle` (the identity), a quiet second line, optionally the tier medallion. */
export function Person({ creator, size = 40, you = false, tier = false, detail, className }: PersonProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <ArtAvatar art={creator.avatar} name={creator.display_name} size={size} decorative />
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body-sm font-semibold text-fg">@{creator.handle}</span>
          {you ? <span className="hidden shrink-0 rounded-pill bg-accent-soft px-1.5 py-px text-micro font-semibold text-accent sm:inline-block">You</span> : null}
          {tier ? <TierBadge tier={creator.tier as TierName} size={20} className="shrink-0" /> : null}
        </span>
        <span className="truncate text-caption text-fg-subtle">{detail ?? creator.display_name}</span>
      </span>
    </span>
  );
}
