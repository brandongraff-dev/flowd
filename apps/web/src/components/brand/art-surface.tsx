import type { ComponentPropsWithRef } from "react";
import { artBox, artShapes, artStops, gradientLine, hsl, type ArtAspect, type ArtSeed, type ArtShape, type Tint } from "./art";

export interface ArtSurfaceProps extends Omit<ComponentPropsWithRef<"svg">, "children" | "viewBox" | "preserveAspectRatio"> {
  art: ArtSeed;
  /** Aspect of the drawing. The SVG still fills its parent (`slice`), so a thumbnail in a 9:16 box uses "9:16". */
  aspect?: ArtAspect;
}

function tintColor(tint: Tint, art: ArtSeed): string {
  switch (tint) {
    case "accent":
      return hsl(art.hue_c, 85, 66);
    case "dark":
      return hsl(art.hue_a, 60, 12);
    default:
      return "#fff";
  }
}

function glintPath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

function renderShape(shape: ArtShape, art: ArtSeed, index: number, ids: { orbAccent: string; orbLight: string }, box: { w: number; h: number; s: number }) {
  switch (shape.kind) {
    case "orb":
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill={`url(#${shape.tint === "accent" ? ids.orbAccent : ids.orbLight})`} opacity={shape.opacity} />;
    case "wave":
      return <path key={index} d={shape.d} fill={tintColor(shape.tint, art)} opacity={shape.opacity} />;
    case "arc":
      return <path key={index} d={shape.d} fill="none" stroke={tintColor(shape.tint, art)} strokeWidth={shape.width} strokeLinecap="round" opacity={shape.opacity} />;
    case "dot":
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill="#fff" opacity={shape.opacity} />;
    case "line":
      return <line key={index} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={tintColor(shape.tint, art)} strokeWidth={shape.width} strokeLinecap="round" opacity={shape.opacity} />;
    case "glint":
      return <path key={index} d={glintPath(shape.cx, shape.cy, shape.r)} fill="#fff" opacity={shape.opacity} />;
    case "band":
      return (
        <rect
          key={index}
          x={-box.w}
          y={box.h / 2 + shape.offset * box.s - (shape.thickness * box.s) / 2}
          width={box.w * 3}
          height={shape.thickness * box.s}
          fill={tintColor(shape.tint, art)}
          opacity={shape.opacity}
        />
      );
    default:
      return null;
  }
}

/**
 * Generated art from an ArtSeed, as SVG: the three-stop 135 degree gradient and the seeded pattern (orbs, waves, rings, grid,
 * spark, stripes). Decorative (`aria-hidden`): the owning entity supplies the accessible name. Pure, so it renders on the
 * server and is identical on every client. Fills its parent; give the parent the size and radius.
 */
export function ArtSurface({ art, aspect = "1:1", className, ...props }: ArtSurfaceProps) {
  const box = artBox(aspect);
  const key = `fdart-${art.seed}-${art.hue_a}-${art.hue_b}-${art.hue_c}-${aspect.replace(":", "x")}`;
  const ids = { bg: `${key}-bg`, orbAccent: `${key}-oa`, orbLight: `${key}-ol` };
  const stops = artStops(art);
  const line = gradientLine(box.w, box.h);
  const shapes = artShapes(art, box);

  return (
    <svg
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className ?? "block size-full"}
      {...props}
    >
      <defs>
        <linearGradient id={ids.bg} gradientUnits="userSpaceOnUse" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}>
          <stop offset="0" stopColor={stops.a} />
          <stop offset="0.55" stopColor={stops.b} />
          <stop offset="1" stopColor={stops.c} />
        </linearGradient>
        <radialGradient id={ids.orbAccent}>
          <stop offset="0" stopColor={tintColor("accent", art)} stopOpacity={0.95} />
          <stop offset="0.45" stopColor={tintColor("accent", art)} stopOpacity={0.4} />
          <stop offset="1" stopColor={tintColor("accent", art)} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={ids.orbLight}>
          <stop offset="0" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.32} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={box.w} height={box.h} fill={`url(#${ids.bg})`} />
      {art.pattern === "stripes" ? <g transform={`rotate(-35 ${box.w / 2} ${box.h / 2})`}>{shapes.map((shape, index) => renderShape(shape, art, index, ids, box))}</g> : shapes.map((shape, index) => renderShape(shape, art, index, ids, box))}
    </svg>
  );
}
