"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, useStoreReady } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { GlassCard } from "@/components/glass/glass";
import { AppIcon } from "@/components/brand/app-icon";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { CoverageMeter } from "../coverage-meter";
import { StepApp } from "./step-app";
import { StepCodes } from "./step-codes";
import { StepDone } from "./step-done";
import { StepRevenueCat } from "./step-revenuecat";
import { StepSdk } from "./step-sdk";

const STEPS = ["app", "revenuecat", "sdk", "codes", "done"] as const;
type StepId = (typeof STEPS)[number];

const STEP_DEFS: readonly StepperStep[] = [
  { id: "app", label: "App", description: "Your App Store link" },
  { id: "revenuecat", label: "RevenueCat", description: "Tie conversions to creators" },
  { id: "sdk", label: "SDK", description: "Two lines in your app" },
  { id: "codes", label: "Codes", description: "Codes, survey, partners", optional: true },
  { id: "done", label: "Fund", description: "Your first bounty" },
];

/**
 * `/brand/onboarding`: the connect-app wizard. Five steps (app, RevenueCat, SDK, codes, fund), all state in the demo store, so progress persists:
 * leave, come back, and the app, its integrations and its SDK status are where you left them. The step and the app live in the URL (`?step=`,
 * `?app=`), so every step is linkable and the back button works. It ends at the funding call to action.
 */
export function OnboardingWizard() {
  const ready = useStoreReady();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const appId = params.get("app") ?? undefined;
  const app = useApp(appId);
  const rawStep = params.get("step");
  const requested: StepId = (STEPS as readonly string[]).includes(rawStep ?? "") ? (rawStep as StepId) : "app";
  // Without an app only the first step makes sense.
  const step: StepId = app ? requested : "app";
  const index = STEPS.indexOf(step);

  const go = useCallback(
    (next: StepId, nextApp?: string): void => {
      const query = new URLSearchParams();
      const id = nextApp ?? appId;
      if (id) query.set("app", id);
      if (next !== "app") query.set("step", next);
      router.replace(`${pathname}${query.size ? `?${query}` : ""}`, { scroll: false });
    },
    [appId, pathname, router],
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Setup"
        title="Connect your app"
        description="Paste your App Store link, connect RevenueCat and add two lines to your app. Then fund a bounty and let creators compete for it. Progress is saved as you go."
        meta={<DemoTag />}
      />

      <Stepper aria-label="Connect your app" steps={STEP_DEFS} current={index} onStepSelect={(i) => go(STEPS[i] ?? "app")} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <GlassCard as="section" aria-label={`Step ${index + 1}: ${STEP_DEFS[index]?.label ?? ""}`} padding="lg" className="min-w-0">
          {!ready ? (
            <SkeletonGroup label="Loading setup" className="grid gap-5">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton shape="text" className="w-full" />
              <Skeleton className="h-12 w-full" />
            </SkeletonGroup>
          ) : step === "app" ? (
            <StepApp onAdded={(id) => go("revenuecat", id)} onPick={(id) => go("revenuecat", id)} />
          ) : app ? (
            <StepBody app={app} step={step} go={go} />
          ) : null}
        </GlassCard>

        <aside aria-label="Your app so far" className="grid gap-4 xl:sticky xl:top-24">
          {app ? <AppSummary app={app} /> : <WhyConnect />}
        </aside>
      </div>
    </div>
  );
}

function StepBody({ app, step, go }: { app: AppView; step: StepId; go: (next: StepId) => void }) {
  switch (step) {
    case "revenuecat":
      return <StepRevenueCat app={app} onNext={() => go("sdk")} />;
    case "sdk":
      return <StepSdk app={app} onNext={() => go("codes")} />;
    case "codes":
      return <StepCodes app={app} onNext={() => go("done")} />;
    case "done":
      return <StepDone app={app} />;
    default:
      return null;
  }
}

function AppSummary({ app }: { app: AppView }) {
  return (
    <GlassCard padding="md" className="grid gap-4">
      <div className="flex items-center gap-3">
        <AppIcon art={app.icon} name={app.name} size={48} decorative />
        <div className="grid min-w-0">
          <p className="truncate font-display text-title-sm text-fg">{app.name}</p>
          <p className="truncate text-caption text-fg-subtle">{app.tagline}</p>
        </div>
      </div>
      <CoverageMeter share={app.coverage.share} label={app.coverage.label} />
      <ul className="flex flex-wrap gap-1.5" aria-label="Setup status">
        <li>
          <Badge tone={app.integrations.some((i) => i.kind === "revenuecat" && i.status === "connected") ? "mint" : "neutral"} size="sm" dot>
            RevenueCat
          </Badge>
        </li>
        <li>
          <Badge tone={app.sdk_status === "verified" ? "mint" : app.sdk_status === "installed" ? "accent" : "neutral"} size="sm" dot>
            SDK {app.sdk_status.replace("_", " ")}
          </Badge>
        </li>
      </ul>
    </GlassCard>
  );
}

function WhyConnect() {
  return (
    <GlassCard padding="md" className="grid gap-3">
      <h2 className="font-display text-title-sm text-fg">Why connect an app</h2>
      <ul className="grid gap-2.5 text-caption text-fg-muted">
        <li>
          <span className="font-semibold text-fg">Flo drafts from the listing.</span> Brief, hooks and price in about ten seconds.
        </li>
        <li>
          <span className="font-semibold text-fg">CPA needs attribution.</span> Install, trial and paid bonuses pay only on link and code conversions.
        </li>
        <li>
          <span className="font-semibold text-fg">Tracked beats guessed.</span> Anything modelled is labelled Estimated and never pays.
        </li>
      </ul>
    </GlassCard>
  );
}
