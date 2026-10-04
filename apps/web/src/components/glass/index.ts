/**
 * The Liquid Glass material. Import from "@/components/glass".
 *
 *   L0  <Aurora/>            the living background (CSS orbs; one per page)        <AuroraShader/>  optional WebGL hero version
 *   L1  <GlassCard/>         quiet content glass (low blur, high fill, always AA)
 *   L2  <GlassBar/> <GlassPill/>  floating controls: real glass with pointer sheen
 *   L3  <GlassPanel/>        sheets, modals, popovers: thick glass over a scrim
 *       <LiquidLens/>        L2/L3 + Chromium-only refraction, for at most three hero surfaces per page
 *
 * Rules (CONVENTIONS section 2): glass never samples glass (nested `<Glass>` flattens itself), max two layers in a region,
 * no opacity/filter/mask/clip-path/blend/will-change on an ancestor of glass, text on glass is `fg*` only and AA against
 * the brightest aurora pixel, and every surface honours Reduce glass (`<ReduceGlassSwitch/>`), reduced motion and contrast.
 */

export {
  Glass,
  GlassCard,
  GlassBar,
  GlassPill,
  GlassPanel,
  MediaScrim,
  type GlassProps,
  type GlassLayer,
  type GlassTint,
  type GlassPadding,
  type GlassCardProps,
  type GlassBarProps,
  type GlassPillProps,
  type GlassPanelProps,
  type MediaScrimProps,
  type LensOptions,
} from "./glass";
export { LiquidLens, type LiquidLensProps } from "./liquid-lens";
export { GlassDefs, type GlassDefsProps } from "./lens/glass-defs";
export { useLiquidLens, MAX_LENSES, type LensState } from "./lens/use-liquid-lens";
export { supportsSvgBackdropFilter } from "./lens/refraction";
export { useGlassNesting, type GlassNesting } from "./glass-context";
export { Aurora, type AuroraProps } from "./aurora";
export { AuroraShader, type AuroraShaderProps } from "./aurora-shader";
export { ReduceGlassSwitch, type ReduceGlassSwitchProps } from "./reduce-glass-switch";
export {
  REDUCE_GLASS_BOOT_SCRIPT,
  REDUCE_GLASS_STORAGE_KEY,
  isReduceGlassOn,
  prefersReducedTransparency,
  setReduceGlass,
  systemReducesTransparency,
} from "./reduce-glass";
export { usePointerSheen, type PointerSheenHandlers } from "@/lib/hooks/use-pointer-sheen";
export { useReduceGlass, type ReduceGlassState } from "@/lib/hooks/use-reduce-glass";
