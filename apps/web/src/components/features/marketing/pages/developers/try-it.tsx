"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Badge, Button, Callout } from "@/components/ui";
import { CodeBlock } from "./code-block";

type Result = { ok: true; status: number; ms: number; body: string } | { ok: false; message: string };

/**
 * A live request against this site's own demo API. The demo build serves the same paths as production from `/api/v1` with an in-memory world, so a
 * visitor can see a real response without a key. If the route is not there, or the network fails, the card says so and does not pretend.
 */
export function TryIt({ path = "/api/v1/health" }: { path?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const send = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    const started = performance.now();
    try {
      const response = await fetch(path, { headers: { Accept: "application/json" } });
      const text = await response.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Not JSON: show it as it came.
      }
      setResult({ ok: true, status: response.status, ms: Math.round(performance.now() - started), body: pretty.length > 1800 ? `${pretty.slice(0, 1800)}\n…` : pretty });
    } catch {
      setResult({ ok: false, message: "The demo API did not answer. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard padding="lg" className="grid content-start gap-5">
      <div className="grid gap-1">
        <h3 className="font-display text-title-md text-fg">Try it, no key needed</h3>
        <p className="text-body-sm text-fg-muted">
          This site serves the same paths as production from <span className="font-mono text-code text-fg">/api/v1</span>, backed by an in-memory demo world. Responses carry <span className="font-mono text-code text-fg">X-Flowd-Demo: 1</span>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" loading={busy} leadingIcon={<Play />} onClick={() => void send()}>
          Send GET {path}
        </Button>
        {result?.ok ? (
          <Badge tone={result.status < 300 ? "mint" : "sun"} size="lg">
            {result.status} · {result.ms} ms
          </Badge>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className={cn(!result && "sr-only")}>
        {result?.ok ? <CodeBlock code={result.body} label="Response" /> : null}
        {result && !result.ok ? (
          <Callout tone="sun" title="No answer from the demo API">
            {result.message}
          </Callout>
        ) : null}
      </div>
    </GlassCard>
  );
}
