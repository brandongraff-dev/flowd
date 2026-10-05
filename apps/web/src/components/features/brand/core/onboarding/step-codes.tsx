"use client";

import { ArrowRight, Plug } from "lucide-react";
import { INTEGRATION_STATUS_META, type IntegrationKind } from "@/lib/contract/types";
import { useAttributionKit } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { actions } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Progress } from "@/components/ui/progress";
import { notify } from "@/components/ui/toast";
import { useState } from "react";

const MMPS: readonly { kind: Extract<IntegrationKind, "appsflyer" | "adjust" | "branch">; label: string }[] = [
  { kind: "appsflyer", label: "AppsFlyer" },
  { kind: "adjust", label: "Adjust" },
  { kind: "branch", label: "Branch" },
];

const SURVEY_TEMPLATE = `How did you hear about us?
- A creator's video on TikTok
- A creator's video on Instagram
- A creator's video on YouTube
- A friend or family member
- Search or the App Store
- Somewhere else`;

/**
 * Step 4: the code pool, the survey and an optional MMP. Apple allows 10 active offer codes per subscription SKU, so flowd rotates a pool and the
 * deterministic link is always the fallback. The post-install survey adds self-reported installs as Estimated; a mobile measurement partner adds
 * matched installs, also Estimated. Only link and code conversions are Tracked, and only Tracked ones pay a CPA bonus.
 */
export function StepCodes({ app, onNext }: { app: AppView; onNext: () => void }) {
  const kit = useAttributionKit(app.id);
  const [busy, setBusy] = useState<string | null>(null);
  const mmpConnected = (kind: IntegrationKind): boolean => app.integrations.some((integration) => integration.kind === kind && integration.status === "connected");

  const connect = async (kind: (typeof MMPS)[number]["kind"], label: string): Promise<void> => {
    setBusy(kind);
    const result = await actions.connectIntegration({ kind, app_id: app.id });
    setBusy(null);
    if (result.ok) notify.success(`${label} connected`, { description: "Matched installs show beside the Tracked ones, labelled Estimated." });
    else notify.error(result.error.message, { description: result.error.hint });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h2 className="font-display text-title-lg text-fg">Offer codes, survey and partners</h2>
        <p className="max-w-[60ch] text-body-sm text-fg-muted">Codes and links are what flowd counts as Tracked. Everything on this step is optional context that sits beside them, labelled Estimated.</p>
      </div>

      <section aria-label="Offer-code pool" className="grid gap-3">
        <h3 className="text-body-sm font-semibold text-fg">Offer-code pool</h3>
        {kit.pool.length === 0 ? (
          <p className="rounded-[20px] bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            No codes yet. Create offer codes for your subscription SKU in App Store Connect; flowd then rotates up to 10 active codes per SKU and falls back to the tracking link for everyone else.
          </p>
        ) : (
          <ul className="grid gap-2.5">
            {kit.pool.map((entry) => (
              <li key={entry.sku} className="grid gap-2 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-code font-semibold text-fg">{entry.sku}</span>
                  <span className="text-caption text-fg-muted">
                    {entry.health.active} of {entry.health.cap} active codes · {entry.health.free_slots} free
                  </span>
                </div>
                <Progress value={entry.health.active} max={entry.health.cap} tone={entry.health.at_cap ? "ember" : "accent"} size="sm" aria-label={`${entry.sku} active codes`} valueText={`${entry.health.active} of ${entry.health.cap} active codes`} />
                <p className="text-caption text-fg-subtle">
                  {entry.offer_name}. {entry.health.stale > 0 ? `${entry.health.stale} stale code${entry.health.stale === 1 ? "" : "s"} should be retired.` : "No stale codes."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Post-install survey" className="grid gap-3">
        <h3 className="text-body-sm font-semibold text-fg">Post-install survey template</h3>
        <div className="relative rounded-[20px] bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <pre tabIndex={0} aria-label="Survey template" className="overflow-x-auto p-5 pr-28 font-sans text-body-sm whitespace-pre-wrap text-fg">
            {SURVEY_TEMPLATE}
          </pre>
          <div className="absolute top-3 right-3">
            <CopyButton value={SURVEY_TEMPLATE} variant="secondary" size="sm" label="Copy" />
          </div>
        </div>
        <p className="text-caption text-fg-subtle">Self-reported answers add installs as Estimated. They never pay a bonus.</p>
      </section>

      <section aria-label="Measurement partners" className="grid gap-3">
        <h3 className="flex items-center gap-2 text-body-sm font-semibold text-fg">
          Mobile measurement partner <span className="text-caption font-normal text-fg-subtle">Optional</span>
        </h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {MMPS.map((mmp) => {
            const on = mmpConnected(mmp.kind);
            const integration = app.integrations.find((i) => i.kind === mmp.kind);
            return (
              <li key={mmp.kind} className="grid content-between gap-3 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <div className="grid gap-1">
                  <span className="text-body-sm font-semibold text-fg">{mmp.label}</span>
                  {integration ? (
                    <Badge tone={INTEGRATION_STATUS_META[integration.status].tone} size="sm" dot className="w-fit">
                      {INTEGRATION_STATUS_META[integration.status].label}
                    </Badge>
                  ) : (
                    <span className="text-caption text-fg-subtle">Not connected</span>
                  )}
                </div>
                <Button variant={on ? "ghost" : "secondary"} size="sm" disabled={on} loading={busy === mmp.kind} leadingIcon={<Plug aria-hidden="true" />} onClick={() => void connect(mmp.kind, mmp.label)}>
                  {on ? "Connected" : "Connect"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex justify-end">
        <Button variant="primary" trailingIcon={<ArrowRight aria-hidden="true" />} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
