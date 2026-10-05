import { applyHookFix, scoreHook, scoreHookText, type HookObservations, type Scored } from "@/lib/engine";

/**
 * The example take every Studio picture on the marketing site is drawn from. The numbers are not typed in: they come from the engine's `scoreHook`
 * (the checklist behind the real Hook Score) run on measured observations, and the "after" is the same observations with the one-tap
 * "move the app reveal" fix applied. So the band, the points and every reason on the page are what the product would show for this take.
 */
export const DEMO_APP = "Nap Nest";

/** The hook line. It scores an A as text (a confession plus a curiosity gap) in `scoreHookText`. */
export const DEMO_HOOK = "I deleted five sleep apps. Here's the one I kept.";

export const DEMO_SCRIPT = [DEMO_HOOK, "Number three fixed my 2 a.m. wake-ups.", "Nap Nest tells you when to wind down.", "Free for seven days, link below. #ad"] as const;

/** What the on-device coach would measure in the first seconds of this take: strong except for a late app reveal. */
export const DEMO_OBSERVATIONS: HookObservations = {
  lands_ms: 1800,
  onscreen_ms: 600,
  spoken_matches_onscreen: true,
  face_ms: 300,
  faceless: false,
  app_ms: 14_000,
  interrupt_ms: 900,
  hook_type_known: true,
  hook_type_above_median: false,
  speech_ms: 400,
  captions_in_safe_zone: true,
};

export const HOOK_BEFORE: Scored = scoreHook(DEMO_OBSERVATIONS);
export const HOOK_AFTER: Scored = scoreHook(applyHookFix(DEMO_OBSERVATIONS, "move_app_reveal"));
export const HOOK_TEXT_SCORE = scoreHookText(DEMO_HOOK);

export interface DemoReason {
  /** "0:01". */
  at: string;
  text: string;
  ok: boolean;
  fix?: string;
}

const timecode = (ms: number | undefined): string => {
  const seconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** The three reasons shown beside the ring: hook timing, the face, and the app reveal (the one that changes). */
export function reasonsOf(card: Scored): DemoReason[] {
  return (["hook_lands_2s", "face_early", "app_visible_3s"] as const).flatMap((id) => {
    const item = card.items.find((candidate) => candidate.id === id);
    if (!item) return [];
    return [{ at: timecode(item.at_ms), text: item.reason.replace(/\.$/, "").replace(/(\d+\.\d)s\b/, "$1 s"), ok: item.passed, ...(item.fix ? { fix: item.fix } : {}) }];
  });
}
