import type { RefractionMaps } from "./refraction";

export interface GlassDefsProps {
  /** Filter id (valid CSS identifier). Referenced as `backdrop-filter: url(#id)`. */
  id: string;
  maps: RefractionMaps;
}

/**
 * The SVG filter behind one refracting surface: displacement map -> feDisplacementMap (bends the backdrop) -> baked
 * specular rim -> composite. Rendered as a 0x0 absolutely positioned <svg> next to the surface it serves (not
 * `display: none`: other engines have historically ignored resources inside hidden SVG).
 *
 * `color-interpolation-filters="sRGB"` is mandatory: the default linearRGB would corrupt the "128 = no shift" encoding.
 * The filter is not auto-sized to the element, so it uses userSpaceOnUse with the exact map size and is rebuilt on resize.
 */
export function GlassDefs({ id, maps }: GlassDefsProps) {
  const box = { x: 0, y: 0, width: maps.width, height: maps.height } as const;
  return (
    <svg width={0} height={0} aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" {...box} colorInterpolationFilters="sRGB">
          <feImage {...box} href={maps.displacement} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale={maps.scale} xChannelSelector="R" yChannelSelector="G" result="refracted" />
          <feImage {...box} href={maps.specular} preserveAspectRatio="none" result="spec" />
          <feComposite in="spec" in2="refracted" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
