import Link from "next/link";
import { Download, GitPullRequestDraft, KeyRound, Plug, Radio, Sparkles, Timer, Wallet } from "lucide-react";
import { WEBHOOK_EVENT_TYPE_META, type WebhookEventType } from "@/lib/contract/types";
import { buttonVariants } from "@/components/ui/button-variants";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { FactCard, Footnote, IconTile, PageSection } from "../kit";
import { CodeBlock } from "./code-block";
import { TryIt } from "./try-it";
import type { ApiFacts } from "./developers-data";

export const CURL_CREATE = `curl https://api.joinflowd.io/api/v1/bounties \\
  -H "Authorization: Bearer fd_test_YOUR_KEY" \\
  -H "Idempotency-Key: glowup-oct-launch" \\
  -H "Content-Type: application/json" \\
  -d '{
    "app_id": "app_lumi",
    "title": "Glow-up reels",
    "budget_cents": 50000,
    "cpm_cents": 240
  }'`;

export const RESPONSE_CREATE = `{
  "id": "bnty_...",
  "status": "draft",
  "funded": false,
  "budget_cents": 50000,
  "cpm_cents": 240,
  "take_rate": 0.12,
  "fee_reserve_cents": 6000
}`;

const FUND_ERROR = `// POST /bounties/{id}/fund with a "write" key
{
  "code": "forbidden",
  "message": "This key cannot move money.",
  "hint": "Create a key with the financial scope."
}`;

const MCP_REQUEST = `{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "get_funnel",
    "arguments": { "bounty_id": "bnty_lumi_glowup" }
  }
}`;

const MCP_RESPONSE = `{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Bounty bnty_lumi_glowup: 410,000 views, 700 tracked installs, 112 trials, 41 paid. Cost $520.00. Cost per trial $4.64."
      }
    ],
    "isError": false
  }
}`;

/* ── conventions ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const SCOPES = [
  { scope: "read", tone: "neutral" as const, can: "Look at anything in the workspace: bounties, submissions, posts, the funnel and the ledger.", calls: ["GET /bounties", "GET /bounties/{id}/funnel", "GET /ledger"] },
  { scope: "write", tone: "accent" as const, can: "Create and edit drafts, lint a brief, add feedback. Decisions are recorded as drafts for a person to confirm.", calls: ["POST /bounties", "POST /bounties/lint", "POST /submissions/{id}/feedback"] },
  { scope: "financial", tone: "sun" as const, can: "Move money: fund, publish, top up. The only scope that can spend.", calls: ["POST /bounties/{id}/fund", "POST /bounties/{id}/publish", "POST /bounties/{id}/top-up"] },
];

export function ConventionsSection() {
  return (
    <PageSection
      id="conventions"
      eyebrow="Conventions"
      title="Built so a script cannot spend money by accident"
      description="Three rules you can hold in your head: scopes, drafts and integer cents."
    >
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-3">
          {SCOPES.map((item) => (
            <GlassCard key={item.scope} padding="lg" className="grid content-start gap-4">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={item.tone} size="lg">
                  {item.scope}
                </Badge>
                <KeyRound aria-hidden="true" className="size-5 text-fg-subtle" strokeWidth={1.75} />
              </div>
              <p className="text-body text-fg">{item.can}</p>
              <ul className="grid gap-1.5">
                {item.calls.map((call) => (
                  <li key={call} className="font-mono text-code text-fg-muted">
                    {call}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FactCard>
            <IconTile tone="accent">
              <GitPullRequestDraft />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Drafts by default</h3>
            <p className="text-body-sm text-fg-muted">A write made with a key is a draft. Publishing, funding and anything that moves money needs the financial scope, and a person can always review a draft in the dashboard first.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="mint">
              <Wallet />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Integer cents, with a date</h3>
            <p className="text-body-sm text-fg-muted">Money is whole cents in fields ending in <span className="font-mono text-code text-fg">_cents</span>. Every earning carries its Money Clock state, a dated ETA and a reason. No endpoint returns formatted money.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="violet">
              <Timer />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Idempotent where it counts</h3>
            <p className="text-body-sm text-fg-muted">Funding, top-ups, decisions, payouts and claims accept an Idempotency-Key header. Send the same key twice and you get the first response back, not a second charge.</p>
          </FactCard>
        </div>
      </div>
    </PageSection>
  );
}

/* ── first call ────────────────────────────────────────────────────────────────────────────────────────────────────── */

export function FirstCallSection() {
  return (
    <PageSection
      id="first-call"
      eyebrow="Your first call"
      title="Create a draft, then decide whether to fund it"
      description="Keys start with fd_test_ in the sandbox and fd_live_ in production. Keys are shown once and stored as a hash."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <CodeBlock label="curl · create a draft bounty" code={CURL_CREATE} />
          <CodeBlock label="Response · 201" code={RESPONSE_CREATE} />
        </div>
        <div className="grid content-start gap-4">
          <CodeBlock label="A write key cannot fund" code={FUND_ERROR} />
          <TryIt />
        </div>
      </div>
      <Footnote className="mt-6">Examples are shortened. Errors always look like code, message and hint, with a stable snake_case code you can switch on.</Footnote>
    </PageSection>
  );
}

/* ── endpoint groups ───────────────────────────────────────────────────────────────────────────────────────────────── */

const GROUPS = [
  { name: "Bounties", calls: ["GET, POST /bounties", "POST /bounties/lint", "POST /bounties/price", "POST /bounties/{id}/fund"], note: "Brief Lint and Pay Math use the same rules as the builder. Unfunded publish returns 409 bounty_not_funded." },
  { name: "Submissions and review", calls: ["GET /review/queue", "POST /submissions/{id}/decision", "POST /submissions/{id}/feedback", "GET, PUT /review/rules"], note: "A rejection needs a reason code and evidence, or you get 422 reason_required." },
  { name: "Posts and ledger", calls: ["GET /posts", "GET /posts/{id}/ledger", "POST /posts/{id}/dispute", "GET /ledger"], note: "Snapshots, sources and exclusion causes. The ledger is double-entry and settlement is idempotent." },
  { name: "Wallet and payouts", calls: ["GET /wallet", "GET /payouts", "GET /payouts/preview", "POST /payouts/instant"], note: "Money Clock states with ETAs and reasons, and the instant fee quoted first." },
  { name: "Market", calls: ["GET /market/clearing", "POST /market/suggest"], note: "Quartiles, expected fill time and a confidence figure." },
  { name: "Attribution", calls: ["GET /r/{code}", "POST /attribution/events", "POST /webhooks/revenuecat", "GET /attribution/health"], note: "Source and confidence labels. Outcome pay only on link and code." },
  { name: "Rights and promotion", calls: ["GET /rights", "POST /rights/{id}/renew", "POST /promotions"], note: "Expiry alerts at 30, 14 and 7 days, and creator consent for ads." },
  { name: "Scoring and tools", calls: ["POST /score/hook", "POST /score/flow", "POST /tools/hook-score", "POST /tools/app-audit"], note: "Checklist scores with timecoded reasons. The public tools need no auth." },
  { name: "Developers", calls: ["GET, POST /api-keys", "GET, POST /webhook-endpoints", "POST /mcp"], note: "Scopes, signed webhooks and the MCP server." },
];

export function EndpointsSection({ facts }: { facts: ApiFacts }) {
  return (
    <PageSection
      id="endpoints"
      eyebrow="Endpoints"
      title="Nine groups, one money model"
      description={`${facts.paths} paths and ${facts.operations} operations in the spec. These are the groups you will touch first.`}
      actions={
        <a href="/openapi.yaml" download className={buttonVariants({ variant: "secondary", size: "md" })}>
          <Download aria-hidden="true" />
          OpenAPI spec ({Math.round(facts.specKb / 100) / 10} MB)
        </a>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <GlassCard key={group.name} padding="md" className="grid content-start gap-3">
            <h3 className="font-display text-title-sm text-fg">{group.name}</h3>
            <ul className="grid gap-1">
              {group.calls.map((call) => (
                <li key={call} className="font-mono text-code text-fg-muted">
                  {call}
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-fg-muted">{group.note}</p>
          </GlassCard>
        ))}
      </div>
    </PageSection>
  );
}

/* ── webhooks ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

const EVENT_GROUPS: ReadonlyArray<{ title: string; events: readonly WebhookEventType[] }> = [
  { title: "Bounties", events: ["bounty_funded", "bounty_live", "bounty_filled", "bounty_ended"] },
  { title: "Submissions", events: ["submission_created", "submission_approved", "submission_changes_requested", "submission_rejected"] },
  { title: "Posts and money", events: ["post_live", "post_window_closed", "post_cleared", "conversion_tracked", "invoice_paid", "wallet_low"] },
  { title: "Ads and rights", events: ["ad_live", "ad_fatigued", "rights_expiring", "dispute_opened"] },
];

export function WebhooksSection({ facts }: { facts: ApiFacts }) {
  return (
    <PageSection
      id="webhooks"
      eyebrow="Webhooks"
      title={`${facts.webhookEvents} events, signed and retried`}
      description="Subscribe an endpoint to the events you care about. Deliveries are signed so you can trust them, and retried so you do not miss them."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <GlassCard padding="lg" className="grid gap-6 sm:grid-cols-2">
          {EVENT_GROUPS.map((group) => (
            <div key={group.title} className="grid content-start gap-2.5">
              <p className="fd-eyebrow text-fg-subtle">{group.title}</p>
              <ul className="grid gap-1.5">
                {group.events.map((event) => (
                  <li key={event} className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="font-mono text-code text-fg">{event}</span>
                    <span className="text-caption text-fg-subtle">{WEBHOOK_EVENT_TYPE_META[event].label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-4">
          <IconTile tone="info">
            <Radio />
          </IconTile>
          <h3 className="font-display text-title-md text-fg">Verify before you trust</h3>
          <p className="text-body-sm text-fg-muted">
            Each delivery carries <span className="font-mono text-code text-fg">X-Flowd-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</span>, an HMAC-SHA256 made with your endpoint&apos;s secret. Check it, and reject deliveries with an old timestamp.
          </p>
          <p className="text-body-sm text-fg-muted">Failed deliveries retry with exponential backoff, and every attempt is listed in the endpoint&apos;s delivery log.</p>
        </GlassCard>
      </div>
    </PageSection>
  );
}

/* ── MCP ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const MCP_TOOLS = [
  { name: "create_bounty", text: "Create a draft bounty from a brief. Always a draft." },
  { name: "fund_bounty", text: "Fund a bounty's escrow from the wallet. Needs the financial scope. Idempotent." },
  { name: "list_submissions", text: "List submissions, newest first, by bounty or status." },
  { name: "decide_submission", text: "Approve, request changes or reject. A rejection needs a reason code and evidence." },
  { name: "get_funnel", text: "Views to paid for a bounty, tracked versus estimated, with cost per stage." },
] as const;

export function McpSection({ facts }: { facts: ApiFacts }) {
  return (
    <PageSection
      id="mcp"
      eyebrow="MCP server"
      title="Let an assistant run the busywork"
      description={`Connect an MCP-capable assistant to flowd with a brand API key and ask in plain language: launch a $500 bounty for my app. ${facts.mcpTools} tools, JSON-RPC 2.0, the same scopes as the REST API.`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <GlassCard padding="lg" className="grid gap-4">
            <div className="flex items-center gap-3">
              <IconTile tone="violet">
                <Sparkles />
              </IconTile>
              <h3 className="font-display text-title-md text-fg">&ldquo;Launch a $500 bounty for my app.&rdquo;</h3>
            </div>
            <ol className="grid gap-2.5 text-body-sm text-fg-muted">
              <li className="flex gap-3">
                <span aria-hidden="true" className="fd-figure w-5 shrink-0 font-bold text-accent">1</span>
                <span>
                  The assistant calls <span className="font-mono text-code text-fg">create_bounty</span>. You get a draft with the fee, the all-in CPM and any Brief Lint findings.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="fd-figure w-5 shrink-0 font-bold text-accent">2</span>
                <span>You review it in the dashboard, or the assistant reads it back to you.</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="fd-figure w-5 shrink-0 font-bold text-accent">3</span>
                <span>
                  Only a key with the <span className="font-mono text-code text-fg">financial</span> scope can call <span className="font-mono text-code text-fg">fund_bounty</span>. Without it the draft waits for a person.
                </span>
              </li>
            </ol>
          </GlassCard>
          <ul className="grid gap-2" aria-label="MCP tools">
            {MCP_TOOLS.map((tool) => (
              <li key={tool.name} className="grid gap-0.5 rounded-2xl bg-surface-field px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-4">
                <p className="font-mono text-code font-medium text-fg">{tool.name}</p>
                <p className="text-body-sm text-fg-muted">{tool.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-4">
          <CodeBlock label="POST /mcp · tools/call" code={MCP_REQUEST} />
          <CodeBlock label="Response" code={MCP_RESPONSE} />
        </div>
      </div>
    </PageSection>
  );
}

/* ── limits and sandbox ────────────────────────────────────────────────────────────────────────────────────────────── */

const LIMITS = [
  { plan: "Free", rpm: "60" },
  { plan: "Pro", rpm: "600" },
  { plan: "Scale", rpm: "3,000" },
];

export function LimitsSection() {
  return (
    <PageSection
      id="limits"
      eyebrow="Limits and errors"
      title="Predictable limits, stable error codes"
      description="Go over a limit and you get a 429 rate_limited with a Retry-After header, never a silent drop."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <GlassCard padding="lg" className="grid content-start gap-4">
          <div className="flex items-center gap-3">
            <IconTile tone="ember">
              <Timer />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Requests per minute</h3>
          </div>
          <dl className="grid gap-3">
            {LIMITS.map((row) => (
              <div key={row.plan} className="flex items-baseline justify-between gap-4 border-b border-divider pb-3 last:border-b-0 last:pb-0">
                <dt className="text-body font-semibold text-fg">{row.plan}</dt>
                <dd className="fd-figure text-figure-md text-fg">{row.rpm}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-fg-subtle">API access is part of Pro and Scale. Lists use cursor pagination: limit up to 200, then the next cursor.</p>
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-4">
          <div className="flex items-center gap-3">
            <IconTile tone="rose">
              <Plug />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Errors you can switch on</h3>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["validation_failed", "422"],
              ["reason_required", "422"],
              ["bounty_not_funded", "409"],
              ["pool_exhausted", "409"],
              ["tax_info_missing", "409"],
              ["identity_check_required", "409"],
              ["tier_locked", "403"],
              ["rate_limited", "429"],
            ].map(([code, status]) => (
              <li key={code} className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-field px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <span className="font-mono text-code text-fg">{code}</span>
                <span className="font-mono text-code text-fg-subtle">{status}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </PageSection>
  );
}

export function SandboxSection({ facts }: { facts: ApiFacts }) {
  return (
    <PageSection id="sandbox" eyebrow="Sandbox" title="Get a key and try it" description="Create a workspace, open Developers in the dashboard and make a sandbox key. It acts as your brand, on the demo world.">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Get a sandbox key
        </Link>
        <a href="/openapi.yaml" download className={buttonVariants({ variant: "secondary", size: "lg" })}>
          <Download aria-hidden="true" />
          Download the OpenAPI spec
        </a>
        <p className="text-caption text-fg-subtle">OpenAPI 3.1 · {facts.specKb.toLocaleString("en-US")} KB · generated from the same contract the apps use.</p>
      </div>
    </PageSection>
  );
}
