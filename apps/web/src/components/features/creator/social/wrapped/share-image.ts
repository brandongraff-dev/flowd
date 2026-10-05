/**
 * The Earnings Card as an image: a standalone SVG built from the recap (so the preview on screen is exactly what is downloaded), and a
 * PNG render of it. This file is generated art, so it carries its own literal colours (the Mint of the brand's money states and white
 * ink on the recap's seeded gradient); product components never do. The median line and the proof link are always on the card, and
 * "hide amounts" swaps the figure for the tier, as the product promise says.
 */

import type { ArtSeed, Tier } from "@/lib/contract/types";
import { formatMoney } from "@/lib/format";

export type ShareFormat = "story" | "square";

export const SHARE_SIZE: Record<ShareFormat, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: "Story 9:16" },
  square: { w: 1080, h: 1080, label: "Square 1:1" },
};

export interface ShareCardInput {
  format: ShareFormat;
  handle: string;
  tier: Tier;
  /** "September 2026". */
  period: string;
  /** Cleared money for the period, in cents. */
  amountCents: number;
  postsCount: number;
  /** The typical (median) creator at this tier for the same period, in cents. */
  medianCents: number;
  /** "joinflowd.io/p/prf_25086bca" or a placeholder before the proof exists. */
  proofLabel: string;
  art: ArtSeed;
  hideAmount: boolean;
}

const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tierName = (tier: Tier): string => tier[0].toUpperCase() + tier.slice(1);

/** The card as an SVG string. 1080 wide; 1920 tall for stories and 1080 for squares. */
export function buildShareSvg(input: ShareCardInput): string {
  const { w, h } = SHARE_SIZE[input.format];
  const { art } = input;
  const story = input.format === "story";
  const pad = 88;
  const figure = input.hideAmount ? tierName(input.tier) : formatMoney(input.amountCents);
  const figureSize = input.hideAmount ? 220 : 200;
  const top = story ? 520 : 330;
  const font = "Bricolage Grotesque Variable, Bricolage Grotesque, ui-rounded, system-ui, sans-serif";
  const text = "Geist Variable, Geist, system-ui, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Earnings card for ${esc(input.period)}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${art.hue_a} 62% 14%)"/><stop offset="0.55" stop-color="hsl(${art.hue_b} 58% 11%)"/><stop offset="1" stop-color="hsl(${art.hue_c} 55% 9%)"/></linearGradient>
<radialGradient id="o1" cx="0.8" cy="0.12" r="0.7"><stop offset="0" stop-color="hsl(${art.hue_b} 90% 62%)" stop-opacity="0.55"/><stop offset="1" stop-color="hsl(${art.hue_b} 90% 62%)" stop-opacity="0"/></radialGradient>
<radialGradient id="o2" cx="0.1" cy="0.95" r="0.7"><stop offset="0" stop-color="hsl(${art.hue_c} 85% 55%)" stop-opacity="0.4"/><stop offset="1" stop-color="hsl(${art.hue_c} 85% 55%)" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#o1)"/><rect width="${w}" height="${h}" fill="url(#o2)"/>
<text x="${pad}" y="${pad + 56}" font-family="${font}" font-size="64" font-weight="800" fill="#F3F7FF">flowd</text>
<text x="${pad}" y="${top}" font-family="${text}" font-size="46" font-weight="600" fill="#C0CAE0">@${esc(input.handle)} · ${esc(tierName(input.tier))}</text>
<text x="${pad}" y="${top + figureSize * 0.95 + 24}" font-family="${font}" font-size="${figureSize}" font-weight="800" letter-spacing="-6" fill="#18DF9B">${esc(figure)}</text>
<text x="${pad}" y="${top + figureSize * 0.95 + 96}" font-family="${text}" font-size="52" font-weight="500" fill="#F3F7FF">${input.hideAmount ? `${esc(input.period)} on flowd` : `cleared in ${esc(input.period)} · ${input.postsCount} ${input.postsCount === 1 ? "post" : "posts"}`}</text>
<rect x="${pad}" y="${top + figureSize * 0.95 + 150}" width="${w - pad * 2}" height="176" rx="40" fill="#FFFFFF" fill-opacity="0.1"/>
<text x="${pad + 40}" y="${top + figureSize * 0.95 + 218}" font-family="${text}" font-size="42" font-weight="600" fill="#F3F7FF">Typical ${esc(tierName(input.tier))} creator, same period</text>
<text x="${pad + 40}" y="${top + figureSize * 0.95 + 282}" font-family="${font}" font-size="56" font-weight="700" fill="#F3F7FF">${esc(formatMoney(input.medianCents))} median</text>
<text x="${pad}" y="${h - pad - 56}" font-family="${text}" font-size="36" font-weight="500" fill="#C0CAE0">Verified on the ledger. Results vary.</text>
<text x="${pad}" y="${h - pad}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="44" font-weight="500" fill="#F3F7FF">${esc(input.proofLabel)}</text>
</svg>`;
}

/** The SVG as a data URL, for an `<img>` preview. */
export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Renders the SVG to a PNG blob in the browser. Resolves null when the browser cannot (the caller falls back to the SVG file). */
export function svgToPng(svg: string, width: number, height: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return resolve(null);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    image.onerror = () => resolve(null);
    image.src = svgDataUrl(svg);
  });
}
