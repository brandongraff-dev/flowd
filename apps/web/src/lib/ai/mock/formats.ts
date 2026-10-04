/**
 * The winning-format library, trimmed to what Flo needs when the caller passes no formats of its own: id, name, beats with timings,
 * length and which hook types pair well. Mirrors the first four rows of the format fixtures (docs/BLUEPRINT.md, "Winning app ad formats").
 */

import type { FloFormat } from "../schemas";

export const FALLBACK_FORMATS: readonly FloFormat[] = [
  {
    id: "tmpl_screen_reaction",
    name: "Screen record + reaction",
    min_duration_s: 18,
    max_duration_s: 30,
    hook_types: ["confession", "curiosity_gap", "pov"],
    faceless: false,
    beats: [
      { beat: "hook", label: "Hook on your face", t_start_s: 0, t_end_s: 2, required: true, tip: "Say the hook while looking at the camera." },
      { beat: "app_reveal", label: "Cut to the app", t_start_s: 2, t_end_s: 4, required: true, tip: "Screen recording full-frame by 0:04." },
      { beat: "demo", label: "Use it for the first time", t_start_s: 4, t_end_s: 14, required: true, tip: "Keep your face cam small in the corner." },
      { beat: "reaction", label: "The wow moment", t_start_s: 14, t_end_s: 18, required: true, tip: "React honestly when the result lands." },
      { beat: "payoff", label: "Show the result", t_start_s: 18, t_end_s: 23, required: true, tip: "Hold the result for two seconds." },
      { beat: "offer", label: "State the trial", t_start_s: 23, t_end_s: 26, required: false, tip: "Once, near the end." },
      { beat: "cta", label: "One call to action", t_start_s: 26, t_end_s: 29, required: true, tip: "Link in bio or your code." },
    ],
  },
  {
    id: "tmpl_hidden_gem",
    name: "Hidden gem",
    min_duration_s: 15,
    max_duration_s: 28,
    hook_types: ["direct_question", "curiosity_gap"],
    faceless: false,
    beats: [
      { beat: "hook", label: "Slept-on hook", t_start_s: 0, t_end_s: 3, required: true, tip: "Sound like you found it, not like you were sent it." },
      { beat: "app_reveal", label: "Show the app", t_start_s: 3, t_end_s: 5, required: true, tip: "On screen by 0:05 at the latest." },
      { beat: "key_feature", label: "The one killer feature", t_start_s: 5, t_end_s: 16, required: true, tip: "One feature, shown, not listed." },
      { beat: "proof", label: "Why it earned a spot", t_start_s: 16, t_end_s: 21, required: false, tip: "A number or a before and after." },
      { beat: "offer", label: "Free to try", t_start_s: 21, t_end_s: 24, required: true, tip: "Say it once." },
      { beat: "cta", label: "One call to action", t_start_s: 24, t_end_s: 27, required: true, tip: "One ask, then stop." },
    ],
  },
  {
    id: "tmpl_confession",
    name: "Confession hook",
    min_duration_s: 18,
    max_duration_s: 30,
    hook_types: ["confession", "specific_number"],
    faceless: false,
    beats: [
      { beat: "hook", label: "Confession", t_start_s: 0, t_end_s: 3, required: true, tip: "One sentence, to camera." },
      { beat: "problem", label: "Why you doubted it", t_start_s: 3, t_end_s: 8, required: true, tip: "Be specific about what you expected." },
      { beat: "app_reveal", label: "Show the app", t_start_s: 8, t_end_s: 10, required: true, tip: "Cut to the screen." },
      { beat: "demo", label: "What changed", t_start_s: 10, t_end_s: 20, required: true, tip: "Show it, then say what it did for you." },
      { beat: "payoff", label: "Where you are now", t_start_s: 20, t_end_s: 25, required: true, tip: "Keep it honest and small." },
      { beat: "cta", label: "One call to action", t_start_s: 25, t_end_s: 28, required: true, tip: "One ask, then stop." },
    ],
  },
  {
    id: "tmpl_problem_solution",
    name: "Problem, solution, result",
    min_duration_s: 18,
    max_duration_s: 28,
    hook_types: ["direct_question", "pov", "specific_number"],
    faceless: false,
    beats: [
      { beat: "problem", label: "The pain in one line", t_start_s: 0, t_end_s: 4, required: true, tip: "This is your hook. Make it feel familiar." },
      { beat: "app_reveal", label: "Show the app", t_start_s: 4, t_end_s: 7, required: true, tip: "Screen recording by 0:07." },
      { beat: "demo", label: "The app solving it", t_start_s: 7, t_end_s: 17, required: true, tip: "One task, start to finish." },
      { beat: "payoff", label: "The result", t_start_s: 17, t_end_s: 23, required: true, tip: "Hold the result on screen." },
      { beat: "offer", label: "Free to try", t_start_s: 23, t_end_s: 26, required: false, tip: "Once, near the end." },
      { beat: "cta", label: "One call to action", t_start_s: 26, t_end_s: 28, required: true, tip: "One ask, then stop." },
    ],
  },
];
