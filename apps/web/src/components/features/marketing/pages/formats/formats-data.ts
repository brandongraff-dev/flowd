import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectHookLibrary, selectTemplates } from "@/lib/data/selectors";
import { CATEGORY_META, CTA_TYPE_META, HOOK_TYPES, HOOK_TYPE_META, NICHE_META, type HookType } from "@/lib/contract/types";
import type { ArtSeed } from "@/components/brand/art";

/** The demo app the whole library is filled for, so a visitor reads real sentences instead of `{app}`. Fictional. */
export const DEMO_APP = { name: "Lumi", feature: "one-tap relight", category: "photo editing", goal: "editing photos", noun: "photo editor", activity: "photos" } as const;

export interface FormatBeatDto {
  id: string;
  label: string;
  start: number;
  end: number;
  required: boolean;
  tip: string;
}

export interface FormatDto {
  id: string;
  name: string;
  summary: string;
  rank: number;
  difficulty: "easy" | "medium" | "hard";
  faceless: boolean;
  minSeconds: number;
  maxSeconds: number;
  beats: readonly FormatBeatDto[];
  whyItWorks: string;
  hookTypes: readonly HookType[];
  categories: readonly string[];
  niches: readonly string[];
  ctas: readonly string[];
  script: string;
  shots: readonly string[];
  stats: { settledPosts: number; medianViews: number; trialRate: number; approvalRate: number };
  art: ArtSeed;
  /** Opens the format in Studio (creators). A signed-out visitor is sent to sign in first and returned here. */
  studioHref: string;
  /** Library hooks that fit this format, best first. */
  hookIds: readonly string[];
}

export interface HookDto {
  id: string;
  type: HookType;
  typeLabel: string;
  /** The template with the demo app filled in. */
  text: string;
  whenToUse: string;
  uses: number;
  trialRate: number;
  avgScore: number;
  formats: readonly string[];
}

export interface FormatsPageData {
  formats: readonly FormatDto[];
  hooks: readonly HookDto[];
  hookTypes: ReadonlyArray<{ type: HookType; label: string; formats: number; hooks: number }>;
  totals: { settledPosts: number; hooks: number };
}

/** The format and hook library for `/formats`, read once per request on the server and filled for the demo app. */
export const getFormatsData = cache(async (): Promise<FormatsPageData> => {
  const db = await getServerState();
  const fill = { app: DEMO_APP.name, feature: DEMO_APP.feature, category: DEMO_APP.category, goal: DEMO_APP.goal, number: "7", noun: DEMO_APP.noun, activity: DEMO_APP.activity, outcome: "a clean edit", pain: "three apps for one edit", days: "7" };
  const templates = selectTemplates(db, undefined);
  const hookRows = selectHookLibrary(db, { fill });

  const hooks: HookDto[] = hookRows.map((hook) => ({
    id: hook.id,
    type: hook.hook_type,
    typeLabel: HOOK_TYPE_META[hook.hook_type].label,
    text: hook.filled,
    whenToUse: hook.when_to_use,
    uses: hook.stats.uses,
    trialRate: hook.stats.trial_rate,
    avgScore: hook.stats.avg_hook_score,
    formats: hook.applies_to,
  }));

  const formats: FormatDto[] = templates.map((format) => ({
    id: format.id,
    name: format.name,
    summary: format.summary,
    rank: format.rank,
    difficulty: format.difficulty,
    faceless: format.faceless,
    minSeconds: format.min_duration_s,
    maxSeconds: format.max_duration_s,
    beats: format.beats.map((beat) => ({ id: beat.beat, label: beat.label, start: beat.t_start_s, end: beat.t_end_s, required: beat.required, tip: beat.tip })),
    whyItWorks: format.why_it_works,
    hookTypes: format.hook_types,
    categories: format.best_for_categories.map((category) => CATEGORY_META[category].label),
    niches: format.best_for_niches.map((niche) => NICHE_META[niche].label),
    ctas: format.recommended_cta.map((cta) => CTA_TYPE_META[cta].label),
    script: format.example_script.replaceAll("{app}", DEMO_APP.name).replaceAll("{feature}", DEMO_APP.feature),
    shots: format.shot_list.map((shot) => shot.replaceAll("{app}", DEMO_APP.name).replaceAll("{feature}", DEMO_APP.feature)),
    stats: { settledPosts: format.stats.settled_posts, medianViews: format.stats.median_views, trialRate: format.stats.trial_rate, approvalRate: format.stats.approval_rate },
    art: format.art,
    studioHref: format.remix_href,
    hookIds: hooks.filter((hook) => hook.formats.includes(format.id)).slice(0, 3).map((hook) => hook.id),
  }));

  return {
    formats,
    hooks,
    hookTypes: HOOK_TYPES.map((type) => ({ type, label: HOOK_TYPE_META[type].label, formats: formats.filter((format) => format.hookTypes.includes(type)).length, hooks: hooks.filter((hook) => hook.type === type).length })),
    totals: { settledPosts: formats.reduce((sum, format) => sum + format.stats.settledPosts, 0), hooks: hooks.length },
  };
});
