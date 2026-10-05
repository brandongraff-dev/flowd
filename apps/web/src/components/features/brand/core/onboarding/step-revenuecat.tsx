"use client";

import { useState } from "react";
import { ArrowRight, CircleCheck, FlaskConical, Plug } from "lucide-react";
import type { AppView } from "@/lib/data/selectors";
import { useDemoNow } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyField } from "@/components/ui/copy-button";
import { notify } from "@/components/ui/toast";

/**
 * Step 2: RevenueCat. One click connects it and issues the webhook URL and a signing secret. The secret is shown ONCE (copy it now; afterwards only
 * its last four characters are kept, which is how the real product behaves). Then a test event proves events flow and are matched, with the
 * result in words. Nothing is faked: the buttons run the same store actions the rest of the dashboard uses.
 */
export function StepRevenueCat({ app, onNext }: { app: AppView; onNext: () => void }) {
  const now = useDemoNow();
  const rc = app.integrations.find((integration) => integration.kind === "revenuecat");
  const connected = rc !== undefined && rc.status !== "disconnected";
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async (): Promise<void> => {
    setBusy("connect");
    setError(null);
    const result = await actions.connectIntegration({ kind: "revenuecat", app_id: app.id });
    setBusy(null);
    if (!result.ok) {
      setError(`${result.error.message} ${result.error.hint ?? ""}`.trim());
      return;
    }
    setSecret(result.data.webhook_secret ?? null);
    notify.success("RevenueCat connected", { description: "Copy the signing secret now: it is shown once." });
  };

  const test = async (): Promise<void> => {
    if (!rc) return;
    setBusy("test");
    const result = await actions.testIntegration({ integration_id: rc.id });
    setBusy(null);
    if (result.ok) notify.success("Test event received and matched", { description: "Events are flowing from RevenueCat to flowd." });
    else notify.error(result.error.message, { description: result.error.hint });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h2 className="font-display text-title-lg text-fg">Connect RevenueCat</h2>
        <p className="max-w-[60ch] text-body-sm text-fg-muted">
          RevenueCat tells flowd when a subscriber starts a trial or pays. flowd ties it to the creator behind the link or code, and that is what lets a bounty pay creators per install, trial and paid subscription.
        </p>
      </div>

      {error ? (
        <Callout tone="rose" title="RevenueCat did not connect" role="alert">
          {error}
        </Callout>
      ) : null}

      {!connected ? (
        <div className="grid gap-4 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:p-6">
          <ol className="grid gap-2.5 text-body-sm text-fg-muted">
            <li>1. Connect here. flowd creates a webhook URL and a signing secret for {app.name}.</li>
            <li>2. In RevenueCat, open Project settings, then Integrations, then Webhooks, and paste both.</li>
            <li>3. Send a test event to confirm it works.</li>
          </ol>
          <div>
            <Button variant="primary" size="lg" loading={busy === "connect"} leadingIcon={<Plug aria-hidden="true" />} onClick={connect}>
              Connect RevenueCat
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="mint" icon={<CircleCheck aria-hidden="true" />}>
              Connected
            </Badge>
            <span className="text-caption text-fg-subtle">
              {rc.events_24h} events in 24 h{rc.last_event_at ? `, last ${formatRelative(rc.last_event_at, now, { style: "short" })}` : ""}
            </span>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <p className="text-caption font-semibold text-fg-muted">Webhook URL</p>
              <CopyField value={rc.webhook_url ?? ""} aria-label="Webhook URL" />
            </div>
            <div className="grid gap-1.5">
              <p className="text-caption font-semibold text-fg-muted">Signing secret</p>
              {secret ? (
                <>
                  <CopyField value={secret} aria-label="Signing secret" />
                  <p className="text-caption text-fg-subtle">Shown once. After you leave this page only the last four characters are kept.</p>
                </>
              ) : (
                <p className="rounded-xl bg-surface-raised px-4 py-3 font-mono text-code text-fg-muted">
                  whsec_••••••••{rc.secret_last4 ?? ""}
                  <span className="ml-3 font-sans text-caption text-fg-subtle">Stored, not shown again.</span>
                </p>
              )}
            </div>
          </div>
          <p className="text-caption text-fg-muted">{rc.health_note}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" loading={busy === "test"} leadingIcon={<FlaskConical aria-hidden="true" />} onClick={test}>
              Send a test event
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-fg-subtle">{connected ? "Next: add two lines to your app so the creator travels with the purchase." : "You can come back to this later; bounties that pay on views work without it."}</p>
        <Button variant={connected ? "primary" : "secondary"} trailingIcon={<ArrowRight aria-hidden="true" />} onClick={onNext}>
          {connected ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
