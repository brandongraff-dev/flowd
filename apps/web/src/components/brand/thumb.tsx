import type { ComponentPropsWithRef, ReactNode } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtAspect, ArtSeed } from "./art";
import { AppIcon } from "./app-icon";
import { ArtSurface } from "./art-surface";

const ASPECT_CSS: Record<ArtAspect, string> = { "9:16": "9 / 16", "1:1": "1 / 1", "16:9": "16 / 9", "4:5": "4 / 5" };
/** Hook-text size as a share of the thumbnail width (container query units), tuned per aspect so a 9:16 and a 16:9 read alike. */
const HOOK_SIZE: Record<ArtAspect, string> = {
  "9:16": "clamp(13px, 12.5cqw, 32px)",
  "1:1": "clamp(13px, 10.5cqw, 34px)",
  "16:9": "clamp(13px, 6.4cqw, 34px)",
  "4:5": "clamp(13px, 11cqw, 34px)",
};
const RADIUS = { md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" } as const;

/** 83 -> "1:23". */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export interface ThumbProps extends Omit<ComponentPropsWithRef<"div">, "children" | "title" | "onPlay"> {
  /** The video's generated cover (`thumb` on a Post, Submission or Spec). Its `label` is the hook text. */
  art: ArtSeed;
  /** Override the hook text printed on the art (two or three words read best). */
  hook?: string;
  aspect?: ArtAspect;
  /** The app the video is for: a generated icon, top-left. */
  app?: { name: string; art: ArtSeed };
  /** Bottom-left chip: "Hook B", "Needs changes". */
  caption?: ReactNode;
  /** Bottom-right chip, in seconds ("0:21"). */
  durationSec?: number;
  /** Show the play overlay. Defaults to true when `onPlay` is set. */
  play?: boolean;
  /** Makes the whole thumbnail a button that plays the video (the overlay shows). */
  onPlay?: () => void;
  /** Accessible name of the video ("Nap Nest, hook B"). Required when `onPlay` is set. */
  label?: string;
  radius?: keyof typeof RADIUS;
}

/**
 * Generated video thumbnail (BRAND.md 13): the seed's gradient and pattern, big Bricolage hook text, a tiny generated app
 * glyph, a caption chip, a duration chip and an optional play overlay. Text always sits on the 80% ink media scrim, so it
 * clears AA over any seed. Sizes with its container (container-query units): drop it in a grid cell and it scales.
 * Art is decorative; the hook is real text, and `label` names the video for assistive tech.
 */
export function Thumb({ art, hook, aspect = "9:16", app, caption, durationSec, play, onPlay, label, radius = "xl", className, style, ...props }: ThumbProps) {
  const text = hook ?? art.label;
  const showPlay = play ?? Boolean(onPlay);
  const body = (
    <>
      <ArtSurface art={art} aspect={aspect} className="absolute inset-0 block size-full" />
      <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />
      {app ? <AppIcon art={app.art} name={app.name} size={24} decorative className="absolute top-[6cqw] left-[6cqw]" /> : null}
      {showPlay ? (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <span
            className="grid place-items-center rounded-full bg-[color-mix(in_oklab,var(--fd-abyss-1000)_48%,transparent)] text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4),0_6px_20px_-6px_rgb(1_4_20/0.6)] transition-transform duration-(--fd-dur-base) ease-emphasized group-hover:scale-105 group-active:scale-[0.96]"
            style={{ width: "clamp(36px, 20cqw, 60px)", height: "clamp(36px, 20cqw, 60px)" }}
          >
            {/* optical nudge: a play triangle looks centred about 7% right of its geometric centre */}
            <Play className="size-[44%] translate-x-[7%] fill-current" strokeWidth={1.5} />
          </span>
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-[3.5cqw] p-[7cqw] text-left">
        {text ? (
          <span
            className="line-clamp-3 font-display leading-[0.98] font-extrabold tracking-[-0.03em] text-balance text-white [text-shadow:0_2px_14px_rgb(1_4_20/0.55)]"
            style={{ fontSize: HOOK_SIZE[aspect] }}
          >
            {text}
          </span>
        ) : null}
        {caption || durationSec !== undefined ? (
          <span className="flex items-center justify-between gap-2">
            {caption ? (
              <span className="inline-flex h-6 min-w-0 items-center truncate rounded-pill bg-[color-mix(in_oklab,var(--fd-abyss-1000)_62%,transparent)] px-2.5 text-micro font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)] @max-[130px]:hidden">
                <span className="truncate">{caption}</span>
              </span>
            ) : (
              <span />
            )}
            {durationSec !== undefined ? (
              <span className="ml-auto inline-flex h-6 shrink-0 items-center rounded-pill bg-[color-mix(in_oklab,var(--fd-abyss-1000)_62%,transparent)] px-2 text-micro font-semibold text-white tabular-nums shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]">
                {formatDuration(durationSec)}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {/* 1px edge at low opacity: white in dark, black in light (better-ui "image outlines"), never a tinted neutral */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.12)] light:shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)]" />
    </>
  );

  const shared = cn("group @container relative isolate block w-full overflow-hidden text-white", RADIUS[radius], className);
  const sizing = { aspectRatio: ASPECT_CSS[aspect], ...style };

  if (onPlay) {
    return (
      <button type="button" aria-label={label ? `Play ${label}` : "Play video"} onClick={onPlay} className={cn(shared, "cursor-pointer active:scale-[0.99]")} style={sizing} {...(props as ComponentPropsWithRef<"button">)}>
        {body}
      </button>
    );
  }
  return (
    <div role={label ? "img" : undefined} aria-label={label} className={shared} style={sizing} {...props}>
      {body}
    </div>
  );
}
