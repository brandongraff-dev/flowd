"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { DemoTag } from "@/components/shell/demo-banner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from "@/components/ui";
import { PageSection } from "../kit";
import type { ComponentStatus, Incident, StatusComponent, StatusPageData, UptimeDay } from "./status-data";

const STATUS_LABEL: Record<ComponentStatus, string> = { operational: "Operational", degraded: "Degraded", outage: "Outage" };
const BAR: Record<ComponentStatus, string> = { operational: "bg-mint-solid", degraded: "bg-sun-solid", outage: "bg-rose-solid" };

export function StatusBadge({ status, size = "md" }: { status: ComponentStatus; size?: "md" | "lg" }) {
  const Icon = status === "operational" ? CircleCheck : status === "degraded" ? CircleAlert : CircleX;
  return (
    <Badge tone={status === "operational" ? "mint" : status === "degraded" ? "sun" : "rose"} size={size} icon={<Icon aria-hidden="true" />}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const pct = (value: number): string => `${value >= 99.995 ? "100" : value.toFixed(value >= 99.9 ? 2 : 1)}%`;

/** Ninety daily bars, oldest first. Hover or touch a bar to read the day; the list of non-operational days under it is the keyboard and screen-reader version. */
function UptimeBars({ days, name }: { days: readonly UptimeDay[]; name: string }) {
  const [focus, setFocus] = useState<UptimeDay | null>(null);
  const issues = days.filter((day) => day.status !== "operational");
  const average = days.reduce((sum, day) => sum + day.uptime, 0) / days.length;
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={`${name}: ${pct(average)} uptime over the last ${days.length} days. ${issues.length === 0 ? "Every day was fully operational." : `${issues.length} ${issues.length === 1 ? "day was" : "days were"} not fully operational.`}`}
        className="flex h-9 items-stretch gap-[2px]"
        onPointerLeave={() => setFocus(null)}
      >
        {days.map((day) => (
          <span
            key={day.date}
            aria-hidden="true"
            onPointerEnter={() => setFocus(day)}
            onPointerDown={() => setFocus(day)}
            className={cn("min-w-0 flex-1 rounded-[2px] transition-opacity duration-(--fd-dur-fast) ease-standard", BAR[day.status], focus && focus.date !== day.date && "opacity-45")}
          />
        ))}
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-caption text-fg-subtle" aria-hidden="true">
        <span>{formatDate(days[0]?.date ?? "", "short")}</span>
        <span className="font-semibold text-fg-muted tabular-nums">{focus ? `${formatDate(focus.date, "medium")}: ${pct(focus.uptime)} up` : ""}</span>
        <span>Today</span>
      </div>
      {issues.length > 0 ? (
        <details className="text-caption text-fg-muted">
          <summary className="inline-flex min-h-8 cursor-pointer items-center font-medium text-accent underline-offset-4 hover:underline">
            Days with an issue ({issues.length})
          </summary>
          <ul className="mt-2 grid gap-1">
            {issues.map((day) => (
              <li key={day.date} className="flex flex-wrap gap-x-3">
                <span className="font-semibold text-fg tabular-nums">{formatDate(day.date, "medium")}</span>
                <span>{pct(day.uptime)} up</span>
                <span>{STATUS_LABEL[day.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ComponentCard({ component }: { component: StatusComponent }) {
  return (
    <li>
      <GlassCard padding="lg" className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="grid gap-1">
            <h3 className="font-display text-title-md text-fg">{component.name}</h3>
            <p className="text-body-sm text-fg-muted">{component.detail}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="fd-figure text-body-sm font-semibold text-fg-muted tabular-nums">{pct(component.uptime90)} · 90 days</p>
            <StatusBadge status={component.status} />
          </div>
        </div>
        {component.note ? <p className="text-body-sm text-fg">{component.note}</p> : null}
        <UptimeBars days={component.days} name={component.name} />
      </GlassCard>
    </li>
  );
}

export function ComponentsSection({ data }: { data: StatusPageData }) {
  return (
    <PageSection id="components" eyebrow="Components" title="What is running, and how it has run" description="Five things we hold ourselves to. Each bar is a day over the last 90; green is fully operational." actions={<DemoTag />}>
      <div className="grid gap-4">
        <ul className="grid gap-4">{data.components.map((component) => <ComponentCard key={component.id} component={component} />)}</ul>
        <p className="text-caption text-fg-subtle">
          Uptime is the share of each day a component was fully working. Review SLAs read live numbers from the demo world; the other components&apos; histories are generated, because the demo has no real servers to measure. Next payout run: {formatDateTime(data.live.nextRunAt)}, {data.live.nextRunPayouts} creators{data.live.nextRunHeld > 0 ? `, ${data.live.nextRunHeld} held for a named reason` : ""}.
        </p>
      </div>
    </PageSection>
  );
}

function IncidentItem({ incident, name }: { incident: Incident; name: string }) {
  return (
    <AccordionItem value={incident.id}>
      <AccordionTrigger description={`${name} · ${formatDate(incident.date, "medium")} · ${incident.minutes} min`}>{incident.title}</AccordionTrigger>
      <AccordionContent>
        <ol className="grid gap-3 border-l border-divider pl-5">
          {incident.updates.map((update) => (
            <li key={update.at} className="relative grid gap-0.5">
              <span aria-hidden="true" className={cn("absolute top-1.5 -left-[25px] size-2 rounded-full", update.state === "Resolved" ? "bg-mint-solid" : "bg-fg-subtle")} />
              <p className="text-caption font-semibold text-fg">
                {update.state} <span className="font-normal text-fg-subtle">· {formatDateTime(update.at)}</span>
              </p>
              <p className="text-body-sm text-fg-muted">{update.text}</p>
            </li>
          ))}
        </ol>
      </AccordionContent>
    </AccordionItem>
  );
}

export function IncidentsSection({ data }: { data: StatusPageData }) {
  const names = Object.fromEntries(data.components.map((component) => [component.id, component.name]));
  const open = data.components.filter((component) => component.status !== "operational").length;
  return (
    <PageSection id="incidents" eyebrow="Incident history" title="What went wrong, in order" description="Past incidents with the timeline we posted at the time, newest first. We write them in plain words and say what it cost you, if anything.">
      <div className="grid gap-4">
        <GlassCard padding="md">
          <Accordion variant="plain" type="single" collapsible defaultValue={data.incidents[0]?.id}>
            {[...data.incidents]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((incident) => (
                <IncidentItem key={incident.id} incident={incident} name={names[incident.componentId] ?? "System"} />
              ))}
          </Accordion>
        </GlassCard>
        <p className="text-caption text-fg-subtle">
          {open > 0 ? `${open} ${open === 1 ? "component is" : "components are"} degraded right now; ${open === 1 ? "it is" : "they are"} not a posted incident because no outage has been declared. ` : "No incident is open. "}
          Incident entries are demo data. A late review is tracked per brand on its public Scorecard, not here.
        </p>
      </div>
    </PageSection>
  );
}
