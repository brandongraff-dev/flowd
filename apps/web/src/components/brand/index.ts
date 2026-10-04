/**
 * flowd brand pieces. Import from "@/components/brand". All pure SVG/CSS (no images, no remote assets) and server-renderable.
 *
 *   <Logo/> (lockup | stacked | mark | wordmark, theme-aware)   <FlowdAppIcon/>
 *   <TierBadge/>  <TierChip/>                                    five medallions, Bronze to Elite
 *   <ArtAvatar/>  <ArtAvatarStack/>  <AppIcon/>  <Thumb/>        generated from an ArtSeed (the contract's art description)
 *   <PlatformGlyph/>  <PlatformLabel/>                           generic TikTok / Instagram / YouTube text marks
 *   <DomainStatusPill meta={BOUNTY_STATUS_META.live}/>           the contract's enum maps as design-system status pills
 *
 * Rules: art is decorative (`aria-hidden`), the owning entity supplies the accessible name; text on generated art sits on a
 * scrim sized so white clears AA; fictional glyphs only, never a real logo, photo or app icon.
 */

export { Logo, FlowdAppIcon, type LogoProps, type LogoVariant, type LogoTone, type FlowdAppIconProps } from "./logo";
export { TierBadge, TierChip, TIER_LABEL, TIER_ORDER, type TierBadgeProps, type TierChipProps, type TierName } from "./tier-badge";
export { ArtAvatar, ArtAvatarStack, type ArtAvatarProps, type ArtAvatarStackProps } from "./avatar";
export { AppIcon, type AppIconProps } from "./app-icon";
export { Thumb, formatDuration, type ThumbProps } from "./thumb";
export { ArtSurface, type ArtSurfaceProps } from "./art-surface";
export { PlatformGlyph, PlatformLabel, platformName, type PlatformGlyphProps, type PlatformLabelProps, type PlatformKey } from "./platform-glyph";
export { DomainStatusPill, statusGlyph, type DomainStatusPillProps, type EnumMetaLike } from "./domain-status";
export {
  artBox,
  artFromName,
  artShapes,
  artStops,
  hashString,
  inkAlphaForWhiteText,
  mulberry32,
  type ArtAspect,
  type ArtPattern,
  type ArtSeed,
} from "./art";
