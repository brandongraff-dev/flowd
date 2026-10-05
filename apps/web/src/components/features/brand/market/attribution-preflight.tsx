"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CircleX, Route, Search } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Chip, ChipGroup, Field, Input } from "@/components/ui";
import type { App, Integration } from "@/lib/contract/types";
import { useMe, useTrackingLanding } from "@/lib/data";
import type { TrackingLanding } from "@/lib/data/selectors/public";
import { cn } from "@/lib/utils";
import { useMyLinks } from "./selectors";

type Verdict = "pass" | "warn" | "fail";

interface Check {
  id: string;
  label: string;
  verdict: Verdict;
  detail: string;
}

const CODE = /^[a-z0-9][a-z0-9_-]{2,39}$/;

/** Pulls the tracking code out of a pasted link or a bare code. Returns an error when it cannot be a flowd link. */
export function parseTrackingInput(raw: string): { code: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: "Paste a tracking link or a code, like joinflowd.io/r/maya-lumi7." };
  let rest = text.replace(/^https?:\/\//i, "").split(/[?#]/)[0] ?? "";
  if (rest.includes("/")) {
    const [host, ...path] = rest.split("/");
    if (host?.toLowerCase() !== "joinflowd.io") return { error: "That link is not on joinflowd.io. Tracking links look like joinflowd.io/r/<code>." };
    if (path[0] !== "r" || !path[1]) return { error: "Tracking links have the form joinflowd.io/r/<code>." };
    rest = path[1];
  }
  const code = rest.replace(/\/$/, "").toLowerCase();
  return CODE.test(code) ? { code } : { error: "Codes use lowercase letters, numbers, dashes and underscores, from 3 to 40 characters." };
}

function checksFor(code: string, landing: TrackingLanding, brandId: string | undefined, app: App | undefined, rc: Integration | undefined): Check[] {
  const mine = landing.valid && landing.app?.brand_id === brandId;
  const checks: Check[] = [{ id: "format", label: "Link format", verdict: "pass", detail: `joinflowd.io/r/${code} is a valid tracking link shape.` }];
  if (!landing.valid || !mine || !landing.link) {
    checks.push({ id: "resolve", label: "Link resolves to one of your apps", verdict: "fail", detail: landing.valid ? "That code is not one of your workspace's links." : "No active link uses that code. Check the spelling, or the creator's link may be paused." });
    return checks;
  }
  const link = landing.link;
  const linkApp = landing.app ?? app;
  checks.push({ id: "resolve", label: "Link resolves to one of your apps", verdict: "pass", detail: `${linkApp?.name ?? "Your app"} · tracking @${landing.creator?.handle ?? "creator"}. ${link.clicks} clicks so far.` });
  checks.push({ id: "store", label: "App Store button", verdict: landing.store_url ? "pass" : "fail", detail: landing.store_url ? "The landing page sends viewers to your App Store listing carrying the deferred link." : "No store listing is attached to this app." });
  checks.push({ id: "deep", label: "Deferred deep link", verdict: landing.deep_link ? "pass" : "fail", detail: landing.deep_link ? `${landing.deep_link} is read on first open and attached to the purchase.` : "No deep link is set, so the creator cannot be attached after install." });
  checks.push({
    id: "promo",
    label: "Offer code fallback",
    verdict: landing.promo_code ? "pass" : "warn",
    detail: landing.promo_code ? `${landing.promo_code} is shown on the landing page, so a viewer who skips the link can still be matched.` : "No offer code on this link. If the deferred link is lost, the install is only Estimated.",
  });
  const sdk = linkApp?.sdk_status ?? "not_installed";
  checks.push({ id: "sdk", label: "SDK attaches the creator", verdict: sdk === "verified" ? "pass" : sdk === "installed" ? "warn" : "fail", detail: sdk === "verified" ? "Installed and verified: the creator is set on the subscriber." : sdk === "installed" ? "Installed, but not verified yet. Send a test event to confirm." : "Not installed. Add the two-line snippet below." });
  checks.push({ id: "rc", label: "RevenueCat webhook", verdict: rc?.status === "connected" ? "pass" : rc ? "warn" : "fail", detail: rc?.status === "connected" ? `Connected. ${rc.events_24h} events in 24 hours.` : rc ? "Connected but needs attention. Send a test event." : "Not connected, so trials and paid conversions cannot be tied to this link." });
  return checks;
}

const BROWSERS = [
  { id: "tiktok", name: "TikTok in-app browser", note: "The landing page opens inside TikTok. The Get the app button leaves it for the App Store. Apps cannot open automatically from here, by design." },
  { id: "instagram", name: "Instagram in-app browser", note: "The landing page opens in Instagram's viewer. Viewers tap Get the app, or use the offer code shown on the page." },
  { id: "youtube", name: "YouTube app", note: "Links in descriptions open in the system browser, and Shorts links open in-app. Both reach the same landing page." },
  { id: "system", name: "Safari or Chrome", note: "The universal link opens the App Store, or your app if it is installed, with the creator attached." },
] as const;

const ICON = { pass: CheckCircle2, warn: CircleAlert, fail: CircleX } as const;
const TONE = { pass: "text-mint", warn: "text-sun", fail: "text-rose" } as const;
const WORD = { pass: "Pass", warn: "Check", fail: "Fix" } as const;

/**
 * Link preflight: paste a tracking link or code and see every step a viewer's tap depends on. It checks configuration (the link, the store
 * target, the deferred link, the code, the SDK, the webhook); it does not send a real tap and it never counts as a click.
 */
export function PreflightTester({ app, rc }: { app: App | undefined; rc: Integration | undefined }) {
  const me = useMe();
  const samples = useMyLinks(app?.id);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const landing = useTrackingLanding(submitted ?? undefined);

  const checks = useMemo(() => (submitted ? checksFor(submitted, landing, me.brand?.id, app, rc) : []), [submitted, landing, me.brand?.id, app, rc]);
  const failing = checks.filter((check) => check.verdict === "fail").length;
  const warning = checks.filter((check) => check.verdict === "warn").length;
  const overall: Verdict = failing > 0 ? "fail" : warning > 0 ? "warn" : "pass";
  const sdk = landing.valid ? (landing.app?.sdk_status ?? "not_installed") : "not_installed";
  const pathVerdict: Verdict = !landing.valid || failing > 0 ? "fail" : sdk === "verified" && rc?.status === "connected" ? "pass" : "warn";

  const run = (raw: string): void => {
    const parsed = parseTrackingInput(raw);
    if ("error" in parsed) {
      setError(parsed.error);
      setSubmitted(null);
      return;
    }
    setError(undefined);
    setText(raw);
    setSubmitted(parsed.code);
  };

  return (
    <GlassCard padding="md" className="grid content-start gap-5">
      <div className="grid gap-1">
        <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
          <Route aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.75} />
          Link preflight
        </h3>
        <p className="text-body-sm text-fg-muted">Check a creator&apos;s link before their video goes live. It looks at configuration only, and never counts as a click.</p>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(text);
        }}
      >
        <Field label="Tracking link or code" error={error}>
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="joinflowd.io/r/maya-lumi7" autoComplete="off" spellCheck={false} leading={<Search />} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Run preflight
          </Button>
          {samples.length > 0 ? (
            <ChipGroup aria-label="Example links">
              {samples.map((sample) => (
                <Chip key={sample.link.id} size="sm" selected={submitted === sample.link.code} onSelectedChange={() => run(`joinflowd.io/r/${sample.link.code}`)}>
                  {sample.link.code}
                </Chip>
              ))}
            </ChipGroup>
          ) : null}
        </div>
      </form>

      {submitted ? (
        <div className="grid gap-4" role="status" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 text-body-sm">
            <Badge size="lg" tone={overall === "pass" ? "mint" : overall === "warn" ? "sun" : "rose"} icon={overall === "pass" ? <CheckCircle2 /> : overall === "warn" ? <CircleAlert /> : <CircleX />}>
              {overall === "pass" ? "Ready to post" : overall === "warn" ? `${warning} to check` : `${failing} to fix`}
            </Badge>
            <span className="text-fg-muted">
              <code className="font-mono text-code text-fg">joinflowd.io/r/{submitted}</code>
            </span>
          </p>
          <ul className="grid gap-2">
            {checks.map((check) => {
              const Icon = ICON[check.verdict];
              return (
                <li key={check.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 rounded-xl bg-surface-field p-3">
                  <Icon aria-hidden="true" className={cn("mt-0.5 size-5", TONE[check.verdict])} strokeWidth={1.75} />
                  <div className="grid gap-0.5">
                    <p className="text-body-sm font-semibold text-fg">{check.label}</p>
                    <p className="text-caption text-fg-muted">{check.detail}</p>
                  </div>
                  <span className={cn("text-caption font-semibold", TONE[check.verdict])}>{WORD[check.verdict]}</span>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-2.5">
            <h4 className="text-body-sm font-semibold text-fg">What a tap does, by where the viewer is</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {BROWSERS.map((browser) => {
                const Icon = ICON[pathVerdict];
                return (
                  <li key={browser.id} className="grid gap-1.5 rounded-xl bg-surface-field p-3">
                    <p className="flex items-center justify-between gap-2 text-body-sm font-semibold text-fg">
                      {browser.name}
                      <span className={cn("inline-flex items-center gap-1 text-caption", TONE[pathVerdict])}>
                        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        {WORD[pathVerdict]}
                      </span>
                    </p>
                    <p className="text-caption text-fg-muted">{browser.note}</p>
                  </li>
                );
              })}
            </ul>
            <p className="text-micro text-fg-subtle">If the deferred link is lost in any of these, the offer code or the post-install survey still attach the install, as Estimated.</p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-surface-field p-4 text-caption text-fg-subtle">Paste a link to see each step: the link, the store target, the deferred link, the offer code, the SDK and the webhook.</p>
      )}
    </GlassCard>
  );
}
