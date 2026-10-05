import { Check, Lock } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import type { ArtSeed } from "@/lib/contract/types";
import { cn } from "@/lib/utils";

export interface BadgeMedalProps {
  art: ArtSeed;
  label: string;
  earned: boolean;
  size?: number;
  className?: string;
}

/** An Academy badge: its generated medallion in colour when earned, greyed with a lock when not. The label is always real text beside it. */
export function BadgeMedal({ art, label, earned, size = 56, className }: BadgeMedalProps) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <span className={cn("grid place-items-center rounded-full", earned ? "shadow-glow-mint" : "opacity-45 saturate-0")}>
        <ArtAvatar art={art} name={label} size={size} decorative />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full shadow-[0_0_0_2px_var(--fd-surface)]",
          earned ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-subtle",
        )}
      >
        {earned ? <Check className="size-3 stroke-[3]" /> : <Lock className="size-3 stroke-[2.25]" />}
      </span>
    </span>
  );
}
