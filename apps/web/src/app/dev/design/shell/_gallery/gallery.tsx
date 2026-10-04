"use client";

import { Badge } from "@/components/ui";
import { GalleryChrome } from "../../charts/_gallery/chrome";
import { BrandSection } from "./brand-section";
import { DataSection } from "./data-section";
import { FrameSection } from "./frame-section";
import { MarketingSection } from "./marketing-section";

const NAV = [
  { id: "frame", label: "Frame" },
  { id: "data", label: "Numbers and tables" },
  { id: "marketing", label: "Marketing and delight" },
  { id: "brand", label: "Brand pieces" },
] as const;

/** The /dev/design/shell gallery: the app frame, page and data primitives, marketing and delight pieces, and the brand kit. */
export function ShellGallery() {
  return (
    <GalleryChrome
      area="shell"
      nav={NAV}
      eyebrow="Shell · composites · brand"
      title={
        <>
          The frame around the work, <span className="fd-gradient-text">and the moments in it.</span>
        </>
      }
      intro="The app shell and page primitives, stat tiles, the data table, timelines, phone mock-ups, a payout ticker, the payout-arrives celebration, and the brand kit: logo, tier medallions and everything generated from a seed."
      badges={
        <>
          <Badge tone="accent">Calm for brands, vivid for creators</Badge>
          <Badge tone="mint" dot>
            Confetti only for earned outcomes
          </Badge>
          <Badge tone="violet">Reduced-motion safe</Badge>
          <Badge tone="neutral">Tables become cards</Badge>
        </>
      }
    >
      <FrameSection />
      <DataSection />
      <MarketingSection />
      <BrandSection />
    </GalleryChrome>
  );
}
