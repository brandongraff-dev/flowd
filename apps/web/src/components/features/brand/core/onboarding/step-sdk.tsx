"use client";

import { ArrowRight, CircleCheck, Clock } from "lucide-react";
import { SDK_STATUS_META } from "@/lib/contract/types";
import { useAttributionKit } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Step 3: the SDK snippet. Two lines in your app write the creator and bounty onto the RevenueCat subscriber, so a purchase made a week later is
 * still tied to the right creator. Swift and Kotlin, each with a copy button. The status says what flowd has seen, and says when it will call the
 * SDK verified: on the first purchase that carries a creator.
 */
export function StepSdk({ app, onNext }: { app: AppView; onNext: () => void }) {
  const kit = useAttributionKit(app.id);
  const status = SDK_STATUS_META[app.sdk_status];
  const scheme = app.name.toLowerCase().split(/[^a-z0-9]+/)[0] || "app";
  const snippets = kit.snippets;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h2 className="font-display text-title-lg text-fg">Add the SDK snippet</h2>
        <p className="max-w-[60ch] text-body-sm text-fg-muted">
          A tracking link such as <span className="font-mono text-code text-fg">joinflowd.io/r/MAYA-{scheme.toUpperCase()}</span> opens your app with the creator attached. These two lines hand that creator to RevenueCat, so the purchase is tied to them even days later.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone={app.sdk_status === "verified" ? "mint" : app.sdk_status === "installed" ? "accent" : "neutral"} icon={app.sdk_status === "verified" ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />} size="md">
          SDK {status.label.toLowerCase()}
        </Badge>
        <p className="text-caption text-fg-subtle">{status.meaning ?? ""} flowd marks it verified on the first purchase that arrives with a creator attached.</p>
      </div>

      {snippets.swift === "" ? (
        <Skeleton className="h-40 w-full rounded-[20px]" />
      ) : (
        <Tabs defaultValue="swift">
          <TabsList aria-label="SDK language">
            <TabsTrigger value="swift">Swift</TabsTrigger>
            <TabsTrigger value="kotlin">Kotlin</TabsTrigger>
          </TabsList>
          <TabsContent value="swift">
            <Snippet code={snippets.swift} language="Swift" />
          </TabsContent>
          <TabsContent value="kotlin">
            <Snippet code={snippets.kotlin} language="Kotlin" />
          </TabsContent>
        </Tabs>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-fg-subtle">The link itself works without the SDK; installs are still Tracked from the link and code.</p>
        <Button variant="primary" trailingIcon={<ArrowRight aria-hidden="true" />} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Snippet({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative rounded-[20px] bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <pre tabIndex={0} aria-label={`${language} snippet`} className="overflow-x-auto p-5 pr-28 font-mono text-code leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
      <div className="absolute top-3 right-3">
        <CopyButton value={code} variant="secondary" size="sm" label={`Copy ${language}`} copiedLabel="Copied" />
      </div>
    </div>
  );
}
