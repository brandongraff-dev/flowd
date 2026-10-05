"use client";

import { useMemo, useState } from "react";
import { Download, Link2, Share2 } from "lucide-react";
import { Button, Callout, CopyField, SegmentedControl, Switch, notify } from "@/components/ui";
import type { Tier, Wrapped } from "@/lib/contract/types";
import { links } from "@/lib/constants";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRun } from "../shared/run-action";
import { buildShareSvg, SHARE_SIZE, svgDataUrl, svgToPng, type ShareFormat } from "./share-image";

export interface SharePanelProps {
  wrapped: Wrapped;
  handle: string;
  tier: Tier;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Share your month: the Earnings Card exactly as it will be saved (9:16 or 1:1), the typical-creator median always on it, a proof link anyone
 * can open, and "hide amounts" for a card that shows only your tier. The proof link is created on demand and can be revoked in Settings.
 */
export function SharePanel({ wrapped, handle, tier, }: SharePanelProps) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [hide, setHide] = useState(false);
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const { busy, run } = useRun();

  const proofUrl = wrapped.proof_id ? links.proof(wrapped.proof_id) : created?.url;
  const svg = useMemo(
    () =>
      buildShareSvg({
        format,
        handle,
        tier,
        period: wrapped.label,
        amountCents: wrapped.total_cleared_cents,
        postsCount: wrapped.posts_count,
        medianCents: wrapped.tier_median_cents,
        proofLabel: proofUrl ?? "joinflowd.io/p/… (create the link)",
        art: wrapped.cards[wrapped.cards.length - 1]?.art ?? wrapped.cards[0]?.art ?? { hue_a: 220, hue_b: 260, hue_c: 180, pattern: "orbs", seed: 1 },
        hideAmount: hide,
      }),
    [format, handle, tier, wrapped, proofUrl, hide],
  );
  const size = SHARE_SIZE[format];

  const createProof = async (): Promise<void> => {
    const data = await run("proof", () => actions.shareProof({ month: wrapped.period_start.slice(0, 7), anonymous: hide }));
    if (data) {
      setCreated({ url: data.url });
      notify.success("Proof link is ready", { description: "Anyone with it can verify the amount against the ledger. You can revoke it any time." });
    }
  };

  const download = async (): Promise<void> => {
    const blob = await svgToPng(svg, size.w, size.h);
    const base = `flowd-${wrapped.label.toLowerCase().replace(/\s+/g, "-")}-${format}`;
    if (blob) saveBlob(blob, `${base}.png`);
    else saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
    notify.success("Earnings Card saved", { description: hide ? "Amounts are hidden on this card." : "It carries the typical-creator median and your proof link." });
  };

  const share = async (): Promise<void> => {
    if (!proofUrl) return;
    const data = { title: `My ${wrapped.label} on flowd`, text: "Verified on the ledger. The typical creator's number is on the card too.", url: `https://${proofUrl}` };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
      } catch {
        // The person closed the share sheet: nothing to report.
      }
    } else {
      await navigator.clipboard?.writeText(data.url).catch(() => undefined);
      notify.success("Link copied", { description: "Paste it anywhere." });
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<ShareFormat> aria-label="Card shape" size="sm" value={format} onValueChange={setFormat} options={[{ value: "story", label: "Story 9:16" }, { value: "square", label: "Square 1:1" }]} />
      </div>
      <div className={cn("mx-auto w-full overflow-hidden rounded-2xl bg-bg-sunken shadow-float", format === "story" ? "max-w-[15rem]" : "max-w-[20rem]")}>
        {/* A data-URL SVG: a generated image of this very recap, the same file that Download writes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUrl(svg)} alt={`Earnings Card preview for ${wrapped.label}${hide ? ", amounts hidden" : ""}`} width={size.w} height={size.h} className="block h-auto w-full" />
      </div>
      <Switch label="Hide amounts" description="The card shows your tier and the typical median, not your number." checked={hide} onCheckedChange={setHide} />
      {proofUrl ? <CopyField aria-label="Proof link" value={proofUrl} /> : null}
      <div className="flex flex-wrap gap-2.5">
        <Button variant="primary" leadingIcon={<Download />} onClick={() => void download()}>
          Save image
        </Button>
        {proofUrl ? (
          <Button variant="secondary" leadingIcon={<Share2 />} onClick={() => void share()}>
            Share link
          </Button>
        ) : (
          <Button variant="secondary" leadingIcon={<Link2 />} loading={busy === "proof"} onClick={() => void createProof()}>
            Create proof link
          </Button>
        )}
      </div>
      <Callout tone="info" title="The median is always on the card">
        Your number never travels without the typical creator&rsquo;s. Results vary, and the proof page checks the amount against the ledger.
      </Callout>
    </div>
  );
}
