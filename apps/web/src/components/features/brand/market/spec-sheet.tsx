"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, FileVideo, Lock, TriangleAlert } from "lucide-react";
import { Thumb, ArtAvatar, TierBadge, formatDuration } from "@/components/brand";
import { Badge, Button, Callout, Select, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, buttonVariants } from "@/components/ui";
import { CATEGORY_META, FORMAT_ID_META, HOOK_TYPE_META } from "@/lib/contract/types";
import { rightsLines, rightsSummary } from "@/lib/engine";
import { useBrandWallet } from "@/lib/data";
import type { SpecView } from "@/lib/data/selectors/market";
import { formatDate, formatMoney } from "@/lib/format";
import { actions } from "@/lib/store";
import { RightsCardList } from "./rights-card-list";
import { settle } from "./report";
import { BandChip } from "./spec-bits";

/** Preview and licence of one spec. The price breakdown is shown before the button, and the wallet is checked first. */
export function SpecSheet({ spec, onClose }: { spec: SpecView | null; onClose: () => void }) {
  return (
    <Sheet open={spec !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent>{spec ? <SpecBody key={spec.id} spec={spec} onClose={onClose} /> : null}</SheetContent>
    </Sheet>
  );
}

function SpecBody({ spec, onClose }: { spec: SpecView; onClose: () => void }) {
  const wallet = useBrandWallet();
  const terms = [30, 60, 90, 180].filter((days) => days <= spec.paid_ads_days);
  const [days, setDays] = useState(String(spec.paid_ads_days));
  const [busy, setBusy] = useState(false);
  const price = spec.brand_price_cents ?? spec.price_cents;
  const fee = price - spec.price_cents;
  const short = Math.max(0, price - wallet.wallet.available_cents);
  const lines = rightsLines(spec.rights_card);

  const license = async (): Promise<void> => {
    setBusy(true);
    const result = await settle(actions.licenseSpec({ spec_id: spec.id, paid_ads_days: Number(days) }), (data) => ({
      title: "Licensed",
      description: `${formatMoney(data.brand_cost_cents)} paid. Rights run until ${data.license.ends_at ? formatDate(data.license.ends_at, "medium") : "the end of the term"}. Find it in Rights Vault.`,
    }));
    setBusy(false);
    if (result.ok) onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{spec.title}</SheetTitle>
        <SheetDescription>
          @{spec.creator.handle} · {CATEGORY_META[spec.category].label}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-6">
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-4">
          <Thumb art={spec.art} aspect="9:16" hook={spec.hook_text} durationSec={Math.round(spec.video.duration_ms / 1000)} label={`Preview of ${spec.title}`} />
          <div className="grid gap-3">
            <p className="text-body-sm text-fg-muted">{spec.description}</p>
            <div className="flex flex-wrap items-center gap-2">
              <BandChip label="Flow" band={spec.flow_band} points={spec.flow_points} />
              <BandChip label="Hook" band={spec.hook_band} points={spec.hook_points} />
            </div>
            <p className="text-micro text-fg-subtle">Checklist scores. They get smarter as bounties settle, and they are not a prediction of views.</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {spec.format ? <Badge size="md">{FORMAT_ID_META[spec.format.id].label}</Badge> : null}
              <Badge size="md">{HOOK_TYPE_META[spec.hook_type].label} hook</Badge>
              {spec.exclusive ? (
                <Badge size="md" tone="sun">
                  Exclusive
                </Badge>
              ) : null}
              {spec.status === "first_refusal" ? (
                <Badge size="md" tone="accent">
                  First refusal
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-field p-4">
          <div className="grid gap-0.5">
            <dt className="flex items-center gap-1 text-caption text-fg-subtle">
              <CheckCircle2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              QA passed
            </dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{spec.qa_pass}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="flex items-center gap-1 text-caption text-fg-subtle">
              <CircleAlert aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Warnings
            </dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{spec.qa_warn}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="flex items-center gap-1 text-caption text-fg-subtle">
              <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Fails
            </dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{spec.qa_fail}</dd>
          </div>
        </dl>

        <div className="grid gap-1 text-body-sm text-fg-muted">
          <p className="flex items-center gap-2">
            <FileVideo aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
            {formatDuration(Math.round(spec.video.duration_ms / 1000))} · {spec.video.width}×{spec.video.height} · {spec.video.has_captions ? "captions on" : "no captions"} · app on screen at {(spec.tags.time_to_app_reveal_ms / 1000).toFixed(1)} s
          </p>
          <p className="flex items-center gap-2">
            <ArtAvatar art={spec.creator.avatar} name={spec.creator.display_name} size={20} decorative />
            <Link href={`/brand/creators/${spec.creator.handle}`} className="hover:underline">
              @{spec.creator.handle}
            </Link>
            <TierBadge tier={spec.creator.tier} size={20} decorative />
            <span className="text-fg-subtle">· {spec.stats.licenses} {spec.stats.licenses === 1 ? "licence" : "licences"}</span>
          </p>
        </div>

        <RightsCardList lines={lines} summary={rightsSummary(spec.rights_card)} />

        {terms.length > 1 ? (
          <div className="grid gap-2">
            <p className="text-body-sm font-medium text-fg">Paid-ad term</p>
            <Select
              aria-label="Paid-ad term"
              value={days}
              onValueChange={setDays}
              options={terms.map((term) => ({ value: String(term), label: term === spec.paid_ads_days ? `${term} days, included in the price` : `${term} days` }))}
            />
            <p className="text-caption text-fg-subtle">A shorter term does not lower the price. Renewals are 25% of the licence fee per extra 30 days.</p>
          </div>
        ) : null}

        <dl className="grid gap-2 rounded-xl bg-surface-field p-4 text-body-sm" aria-label="Price">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">Creator licence fee</dt>
            <dd className="font-medium text-fg tabular-nums">{formatMoney(spec.price_cents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">flowd fee on your plan</dt>
            <dd className="font-medium text-fg tabular-nums">{formatMoney(fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
            <dt className="flex items-center gap-1.5 font-semibold text-fg">
              <Lock aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={2} />
              Total from your wallet
            </dt>
            <dd className="font-display text-figure-md text-fg tabular-nums">{formatMoney(price)}</dd>
          </div>
          <p className="text-micro text-fg-subtle">The creator is paid the licence fee and it clears with their next run. Wallet available: {formatMoney(wallet.wallet.available_cents)}.</p>
        </dl>

        {short > 0 ? (
          <Callout tone="sun" title={`Add ${formatMoney(short)} to license this`} action={<Link href="/brand/wallet" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add funds</Link>}>
            Your wallet does not cover the licence yet.
          </Callout>
        ) : null}
        {spec.blocked_reason ? (
          <Callout tone={spec.licensed_by_me ? "mint" : "info"} title={spec.licensed_by_me ? "You license this video" : "Not available to you right now"}>
            {spec.blocked_reason}
          </Callout>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" loading={busy} disabled={!spec.can_license || short > 0} onClick={() => void license()}>
          {spec.can_license ? `License for ${formatMoney(price, { cents: "never" })}` : spec.licensed_by_me ? "Licensed" : "Not available"}
        </Button>
      </SheetFooter>
    </>
  );
}
