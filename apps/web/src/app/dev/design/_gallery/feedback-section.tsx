"use client";

import { useState } from "react";
import { Banknote, RotateCcw, Trash2 } from "lucide-react";
import { Aurora } from "@/components/glass";
import { Banner, Button, Callout, ToastCard, notify, type NotifyTone } from "@/components/ui";
import { Cols, Panel, Row, Section } from "./kit";

const PREVIEWS: ReadonlyArray<{ tone: NotifyTone; title: string; description: string; action?: string }> = [
  { tone: "money", title: "Payout flowd", description: "$62.40 cleared to your Wallet." },
  { tone: "success", title: "Bounty is live", description: "Funded with $5,000 in escrow. Creators can claim it now." },
  { tone: "error", title: "Hook too slow", description: "Your first 3 seconds scored C. Try a sharper open.", action: "Retake" },
  { tone: "warning", title: "Rights expire in 7 days", description: "Nap Nest paid-ad usage ends Oct 10. Renew at 25% of base." },
  { tone: "flo", title: "Flo rewrote your hook", description: "Three options are in your drafts." },
  { tone: "neutral", title: "Take autosaved", description: "Resume it anywhere." },
];

export function FeedbackSection() {
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const hide = (id: string): void => setDismissed((current) => [...current, id]);

  const fakeSave = (fail: boolean): Promise<string> =>
    new Promise((resolve, reject) => {
      setTimeout(() => (fail ? reject(new Error("offline")) : resolve("rate-card-7")), 1400);
    });

  return (
    <Section
      id="feedback"
      eyebrow="Feedback"
      title="Say what happened, then what to do next."
      description="Callouts live in the flow; toasts are glass that floats above it. Errors stay until dismissed, undo replaces confirmation for anything reversible, and celebration is reserved for money a creator has earned."
    >
      <Cols>
        <Panel title="Callouts" note="A fill, not glass, so they work inside cards, sheets and toasts. Always an icon and words.">
          <div className="grid gap-3">
            {!dismissed.includes("info") ? (
              <Callout tone="info" title="Pending is real money on a timer." onDismiss={() => hide("info")}>
                It clears when views are verified, 72 hours after posting. <a href="#feedback">How the Money Clock works</a>
              </Callout>
            ) : null}
            <Callout tone="mint" title="Funded. Your bounty can go live.">
              $5,000 is held in escrow and released only for verified views.
            </Callout>
            <Callout tone="sun" title="Rights expire in 7 days" action={<Button size="xs" variant="secondary">Renew</Button>}>
              Paid-ad usage for “Wind-down routine hook” ends Oct 10.
            </Callout>
            <Callout tone="ember" title="Daily Drop closes at 16:00 UTC">
              5 of 8 spots left. These are real counts.
            </Callout>
            <Callout tone="rose" role="alert" title="That video missed the brief" action={<Button size="xs" variant="danger">Read feedback</Button>}>
              No #ad in the first 3 seconds. You have one revision round left.
            </Callout>
            <Callout tone="violet" title="Flo can tighten this script">
              Save about 6 seconds without losing the offer.
            </Callout>
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Banners" note="One slim line for page-level notices. Sit at the top of the content area.">
            <div className="grid gap-2.5">
              <Banner tone="accent" action={<Button size="xs" variant="secondary">Verify now</Button>}>
                Verify your identity to cash out. Takes about 2 minutes.
              </Banner>
              <Banner tone="sun" onDismiss={() => undefined}>
                Weekly payouts move to Friday 18:00 UTC this week.
              </Banner>
              <Banner tone="mint">Your first bounty is matched up to $500.</Banner>
            </div>
          </Panel>

          <Panel title="Toasts" note="Fire real ones. They stack, pause on hover and when the tab is hidden, and swipe away.">
            <Row>
              <Button size="sm" variant="mint" leadingIcon={<Banknote />} onClick={() => notify.money("Payout flowd", { cents: 6240, description: "cleared to your Wallet" })}>
                Money
              </Button>
              <Button size="sm" variant="secondary" onClick={() => notify.success("Bounty is live", { description: "Funded with $5,000 in escrow." })}>
                Success
              </Button>
              <Button size="sm" variant="secondary" onClick={() => notify.error("Couldn't submit", { description: "You're offline. Your take is saved." })}>
                Error
              </Button>
              <Button size="sm" variant="secondary" leadingIcon={<Trash2 />} onClick={() => notify.undo("Post removed", { onUndo: () => notify.success("Post restored") })}>
                Undo
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<RotateCcw />}
                onClick={() => {
                  notify.promise(fakeSave(false), { loading: "Saving rate card", success: "Rate card saved", error: "Couldn't save. Try again." }).catch(() => undefined);
                }}
              >
                Promise
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  notify.promise(fakeSave(true), { loading: "Saving rate card", success: "Rate card saved", error: "Couldn't save. You're offline." }).catch(() => undefined);
                }}
              >
                Promise (fails)
              </Button>
              <Button size="sm" variant="plain" onClick={() => notify.dismiss()}>
                Dismiss all
              </Button>
            </Row>
          </Panel>
        </div>
      </Cols>

      <div className="relative isolate overflow-hidden rounded-[36px] p-4 sm:p-8">
        <Aurora variant="contained" drift={false} />
        <div className="relative grid gap-5">
          <div className="grid gap-1">
            <h3 className="font-display text-title-sm text-fg">Toast bodies, static</h3>
            <p className="text-caption text-fg-muted">The same card on the L2 glass material (<code className="font-mono text-code">.glass.fd-toast</code>), over the aurora. Product code calls notify.*.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PREVIEWS.map((preview) => (
              <div key={preview.title} className="glass fd-toast relative w-full max-w-[22.25rem]">
                <ToastCard
                  tone={preview.tone}
                  title={preview.title}
                  description={preview.description}
                  action={preview.action ? { label: preview.action, onClick: () => undefined } : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
