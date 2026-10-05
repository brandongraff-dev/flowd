"use client";

import { useState } from "react";
import { Building2, Download, FileText, Layers, ShieldCheck, Users } from "lucide-react";
import { AppIcon, ArtAvatar } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DataTable, KpiRow, PageHeader, Section, StatCard, type DataColumn } from "@/components/shell";
import { Badge, Button, Callout, ConfirmDialog, CopyIconButton, EmptyState, Field, Input, Select, Skeleton, SkeletonGroup, buttonVariants, notify } from "@/components/ui";
import { CONSTANTS, planBreakEven, planPriceCentsMonth, planTakeRate } from "@/lib/engine";
import { useAgency, useBrandWallet, useDemoNow, useMe, useStoreReady } from "@/lib/data";
import type { AgencyClient } from "@/lib/data/selectors/workspace";
import { formatDate, formatMoney, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { csvCell, downloadText, slugOf } from "./fmt";
import { settle } from "./report";

const QUEUE_STALE_HOURS = CONSTANTS.review.stale_after_hours;
const QUEUE_SLA_HOURS = CONSTANTS.review.sla_hours;

function queueState(hours: number | null): { label: string; tone: "neutral" | "sun" | "rose" } {
  if (hours === null) return { label: "Empty", tone: "neutral" };
  if (hours >= QUEUE_SLA_HOURS) return { label: `Overdue, ${Math.round(hours)} h`, tone: "rose" };
  if (hours >= QUEUE_STALE_HOURS) return { label: `Stale, ${Math.round(hours)} h`, tone: "sun" };
  return { label: `${Math.max(1, Math.round(hours))} h`, tone: "neutral" };
}

/** A printable, white-label report. Neutral black and white, the agency's own name in the header, no flowd branding on the page. */
function openReport(client: AgencyClient, preparedBy: string, title: string, now: string): boolean {
  const win = window.open("", "_blank", "noopener=no");
  if (!win) return false;
  const esc = (text: string): string => text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
  const rows = client.apps.map((app) => `<tr><td>${esc(app.name)}</td><td>${esc(app.tagline)}</td></tr>`).join("");
  const queue = queueState(client.oldest_queue_hours).label;
  win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body { font: 15px/1.55 system-ui, sans-serif; color: canvastext; background: canvas; margin: 0; padding: 48px; max-width: 760px; }
    h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; } h2 { font-size: 15px; margin: 32px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: graytext; }
    .meta { color: graytext; margin: 0 0 32px; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { border: 1px solid graytext; border-radius: 12px; padding: 16px; } .card b { display: block; font-size: 24px; letter-spacing: -0.02em; }
    table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: 8px 0; border-bottom: 1px solid graytext; } .foot { margin-top: 40px; color: graytext; font-size: 12px; }
    @media print { body { padding: 0; } }
  </style></head><body>
    <h1>${esc(title)}</h1>
    <p class="meta">${esc(client.brand.name)} · prepared by ${esc(preparedBy)} · ${esc(formatDate(now, "long"))}</p>
    <div class="grid">
      <div class="card"><span>Creator spend, last 30 days</span><b>${esc(formatMoney(client.spend_30d_cents, { cents: "never" }))}</b></div>
      <div class="card"><span>Cost per tracked trial</span><b>${client.cost_per_trial_cents === null ? "Not enough data" : esc(formatMoney(client.cost_per_trial_cents))}</b></div>
      <div class="card"><span>Live bounties</span><b>${client.live_bounties}</b></div>
    </div>
    <h2>Apps</h2><table><tbody>${rows}</tbody></table>
    <h2>Review queue</h2><p>Oldest video waiting: ${esc(queue)}.</p>
    <p class="foot">Spend is creator pay settled in the period. Cost per trial counts tracked trials only (link and code). Figures are from flowd's ledger.</p>
  </body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 300);
  return true;
}

function Gate() {
  const wallet = useBrandWallet();
  const [open, setOpen] = useState(false);
  const breakEven = planBreakEven("pro", "scale");
  const features = [
    { icon: Layers, title: "One roll-up for every client", text: "Spend, cost per trial and review queue age for each client brand, side by side." },
    { icon: Users, title: "Client approval links", text: "Clients approve videos in a private link. No login, no seat." },
    { icon: FileText, title: "White-label reports", text: "A clean report for each client with your name on it, ready to print or save as a PDF." },
  ] as const;
  return (
    <GlassCard padding="lg" className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-[60ch] gap-2">
          <Badge size="lg" tone="sun" className="w-fit" icon={<Building2 />}>
            Scale plan
          </Badge>
          <h2 className="font-display text-title-lg text-fg">Agency workspaces are part of Scale</h2>
          <p className="text-body text-fg-muted">
            You are on {wallet.plan.label}, at {formatMoney(wallet.plan.price_cents_month, { cents: "never" })} a month and a {Math.round(wallet.plan.take_rate * 100)}% fee on creator pay. Scale is {formatMoney(planPriceCentsMonth("scale"), { cents: "never" })} a month with a {Math.round(planTakeRate("scale") * 100)}% fee.
            {breakEven ? ` It costs less than Pro once you spend more than ${formatMoney(breakEven, { cents: "never" })} a month on creators.` : ""}
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)} disabled={wallet.plan.plan === "scale"}>
          Upgrade to Scale
        </Button>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.title} className="grid content-start gap-2.5 rounded-2xl bg-surface-field p-5">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-surface-active text-fg-muted">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <h3 className="text-body-sm font-semibold text-fg">{feature.title}</h3>
              <p className="text-caption text-fg-muted">{feature.text}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-fg-subtle">Your last 30 days: {formatMoney(wallet.spend_30d_cents, { cents: "never" })} of creator pay. Compare plans in Settings before you decide.</p>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Move to Scale?"
        description={`${formatMoney(planPriceCentsMonth("scale"), { cents: "never" })} a month, and a ${Math.round(planTakeRate("scale") * 100)}% fee on new creator pay. Bounties already funded keep the fee they were made with. You can change plan again in Settings.`}
        confirmLabel="Upgrade to Scale"
        onConfirm={async () => {
          const result = await settle(actions.changeBrandPlan({ plan: "scale" }), { title: "You are on Scale", description: "Agency workspaces, client approval links and white-label reports are on." });
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </GlassCard>
  );
}

/** The agency roll-up: client brands side by side, their queues, approval links and a printable white-label report. */
export function AgencyView() {
  const ready = useStoreReady();
  const me = useMe();
  const agency = useAgency();
  const [clientId, setClientId] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const now = useDemoNow();

  const selected = agency.clients.find((client) => client.brand.id === clientId) ?? agency.clients[0];

  const columns: DataColumn<AgencyClient>[] = [
    {
      id: "client",
      header: "Client",
      card: "title",
      minWidth: "13rem",
      sticky: true,
      sortValue: (row) => row.brand.name,
      cell: (row) => (
        <span className="flex items-center gap-3">
          <ArtAvatar art={row.brand.logo} name={row.brand.name} size={32} shape="square" decorative />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-fg">{row.brand.name}</span>
            <span className="truncate text-caption text-fg-subtle">{row.apps.map((app) => app.name).join(", ") || "No apps yet"}</span>
          </span>
        </span>
      ),
    },
    { id: "live", header: "Live bounties", align: "end", sortValue: (row) => row.live_bounties, cell: (row) => row.live_bounties },
    { id: "spend", header: "Spend, 30 d", align: "end", card: "value", sortValue: (row) => row.spend_30d_cents, cell: (row) => formatMoney(row.spend_30d_cents, { cents: "never" }) },
    { id: "cpt", header: "Cost per trial", align: "end", hideBelow: "md", sortValue: (row) => row.cost_per_trial_cents ?? Number.MAX_SAFE_INTEGER, cell: (row) => (row.cost_per_trial_cents === null ? <span className="text-fg-subtle">Not enough data</span> : formatMoney(row.cost_per_trial_cents)) },
    {
      id: "queue",
      header: "Oldest in queue",
      align: "end",
      sortValue: (row) => row.oldest_queue_hours ?? -1,
      cell: (row) => {
        const state = queueState(row.oldest_queue_hours);
        return (
          <Badge size="md" tone={state.tone} variant={state.tone === "neutral" ? "outline" : "soft"}>
            {state.label}
          </Badge>
        );
      },
    },
    {
      id: "link",
      header: "Approval link",
      hideBelow: "lg",
      cell: (row) =>
        row.approval_url ? (
          <span className="flex items-center gap-1.5">
            <code className="max-w-[10rem] truncate font-mono text-code text-fg-muted">{row.approval_url}</code>
            <CopyIconButton value={row.approval_url} label={`Copy approval link for ${row.brand.name}`} />
          </span>
        ) : (
          <span className="text-fg-subtle">None yet</span>
        ),
    },
  ];

  const exportCsv = async (): Promise<void> => {
    const header = ["client", "apps", "live_bounties", "spend_30d_usd", "cost_per_trial_usd", "oldest_in_queue_hours"];
    const plain = (cents: number | null): string => (cents === null ? "" : formatMoney(cents).replace(/[$,]/g, ""));
    const lines = agency.clients.map((client) => [client.brand.name, client.apps.map((app) => app.name).join("; "), client.live_bounties, plain(client.spend_30d_cents), plain(client.cost_per_trial_cents), client.oldest_queue_hours === null ? "" : Math.round(client.oldest_queue_hours)].map(csvCell).join(","));
    downloadText(`${slugOf(me.brand?.name ?? "agency")}-clients.csv`, [header.map(csvCell).join(","), ...lines].join("\r\n"));
    await actions.recordExport({ what: "Agency client roll-up" });
    notify.success("Exported the roll-up");
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader eyebrow="Setup" title="Agency roll-up" description="Every client brand you manage, in one view: spend, results and who is waiting on a review." />

      {!ready ? (
        <SkeletonGroup label="Loading the roll-up" className="grid gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </SkeletonGroup>
      ) : !agency.plan_ok ? (
        <Gate />
      ) : agency.clients.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="inbox"
            title="No client workspaces yet"
            description="Client brands you manage show up here with their spend and queues. To link an existing brand to your agency, email us and we will connect it."
            action={
              <a href="mailto:hello@joinflowd.io?subject=Link%20a%20client%20brand" className={buttonVariants({ variant: "primary" })}>
                Email hello@joinflowd.io
              </a>
            }
          />
        </GlassCard>
      ) : (
        <>
          <KpiRow columns={3}>
            <StatCard label="Spend, last 30 days" cents={agency.totals.spend_30d_cents} hint={`Across ${pluralise(agency.clients.length, "client")}`} />
            <StatCard label="Live bounties" value={agency.totals.live_bounties} hint="Funded and open" />
            <StatCard label="Clients with a queue" value={agency.totals.waiting} hint="Videos waiting on a decision" />
          </KpiRow>

          <Section
            title="Clients"
            description="Open a client to work in their workspace. Queue age turns amber at 48 hours and red at 72."
            actions={
              <Button variant="secondary" leadingIcon={<Download />} onClick={() => void exportCsv()}>
                Export CSV
              </Button>
            }
          >
            <DataTable
              caption="Client brands you manage"
              columns={columns}
              rows={agency.clients}
              getRowId={(row) => row.brand.id}
              stickyHeader={false}
              rowActions={(row) => [
                {
                  id: "open",
                  label: switching === row.brand.id ? "Opening..." : "Open workspace",
                  icon: <AppIcon art={row.brand.logo} name={row.brand.name} size={18} decorative />,
                  onSelect: async () => {
                    setSwitching(row.brand.id);
                    await settle(actions.switchWorkspace({ brand_id: row.brand.id }), `Now viewing ${row.brand.name}`);
                    setSwitching(null);
                  },
                },
              ]}
            />
          </Section>

          <Section title="White-label report" description="A printable report with your name on it. No flowd branding on the page. Print it, or save it as a PDF from the print dialog.">
            <GlassCard padding="md" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <Field label="Client">
                <Select value={selected?.brand.id ?? ""} onValueChange={setClientId} options={agency.clients.map((client) => ({ value: client.brand.id, label: client.brand.name }))} />
              </Field>
              <Field label="Prepared by" hint="Printed in the report header.">
                <Input value={preparedBy} onChange={(event) => setPreparedBy(event.target.value)} placeholder={me.brand?.name ?? "Your agency"} autoComplete="off" />
              </Field>
              <Button
                variant="primary"
                leadingIcon={<FileText />}
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  const ok = openReport(selected, preparedBy.trim() || (me.brand?.name ?? "Your agency"), `${selected.brand.name}: creator marketing report`, now);
                  if (!ok) notify.error("Your browser blocked the report window", { description: "Allow pop-ups for this site, then try again." });
                  else void actions.recordExport({ what: `White-label report for ${selected.brand.name}`, target_kind: "brand", target_id: selected.brand.id });
                }}
              >
                Open report
              </Button>
            </GlassCard>
            <Callout tone="neutral" icon={<ShieldCheck />} title="What the report shows">
              Spend is creator pay settled in the last 30 days. Cost per trial counts tracked trials only, so it never includes estimated installs.
            </Callout>
          </Section>
        </>
      )}
    </div>
  );
}
