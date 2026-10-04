"use client";

import { Badge } from "@/components/ui";
import { GalleryChrome } from "./chrome";
import { CompareSection } from "./compare-section";
import { FiguresSection } from "./figures-section";
import { TimeSection } from "./time-section";

const NAV = [
  { id: "time", label: "Over time" },
  { id: "compare", label: "Compare" },
  { id: "figures", label: "Figures" },
] as const;

/** The /dev/design/charts gallery: every chart in dark and light, with the interaction layer live. */
export function ChartsGallery() {
  return (
    <GalleryChrome
      area="charts"
      nav={NAV}
      eyebrow="Charts · dataviz"
      title={
        <>
          Money charts, <span className="fd-gradient-text">built to be read.</span>
        </>
      }
      intro="Custom SVG on d3-scale and d3-shape. Thin marks, hairline grids, a validated colour-blind-safe palette, tooltips that list every series, the same details from the keyboard, a table twin for every chart, and a draw-in that respects reduced motion."
      badges={
        <>
          <Badge tone="accent">Validated palette</Badge>
          <Badge tone="violet">Tracked vs Estimated</Badge>
          <Badge tone="mint" dot>
            Table view on every chart
          </Badge>
          <Badge tone="neutral">Arrow-key tooltips</Badge>
        </>
      }
    >
      <TimeSection />
      <CompareSection />
      <FiguresSection />
    </GalleryChrome>
  );
}
