"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useApp, useBounty, useInvoice, useMe } from "@/lib/data";
import { humanize } from "@/lib/format";
import { routeFor } from "@/lib/search/routes";
import { brandNav } from "./brand-nav";
import { BrandWorkspaceSwitcher } from "./brand-workspace-switcher";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { flattenNav } from "./nav";

const NAV_LABELS: ReadonlyMap<string, string> = new Map(flattenNav(brandNav()).map((entry) => [entry.href, entry.label]));

/** Names looked up from the store for the ids in a path. Anything missing falls back to a humanised id. */
export interface CrumbNames {
  workspace?: string;
  bounty?: string;
  app?: string;
  invoice?: string;
}

/** Which entity ids a `/brand/...` path carries (so the shell reads only those rows). */
export function crumbIds(pathname: string): { bounty?: string; app?: string; invoice?: string } {
  const [, second, third, fourth] = (pathname.split("?")[0] ?? "").split("/").filter(Boolean);
  return {
    ...(second === "bounties" && third && third !== "new" ? { bounty: third } : {}),
    ...(second === "apps" && third ? { app: third } : {}),
    ...(second === "wallet" && third === "invoices" && fourth ? { invoice: fourth } : {}),
  };
}

/**
 * The trail for any `/brand/...` path: workspace, then each segment named after the nav entry for it (so "Funnel Doctor" is "Funnel Doctor"
 * everywhere), then the entity's own name for an id ("Glow-up reveal", "FD-2026-0042"). The last item is the current page. Pure.
 */
export function buildBrandCrumbs(pathname: string, names: CrumbNames = {}): BreadcrumbItem[] {
  const parts = (pathname.split("?")[0] ?? "").split("/").filter(Boolean);
  const root: BreadcrumbItem = { label: names.workspace ?? "Workspace", href: "/brand" };
  if (parts.length <= 1) return [root, { label: "Overview" }];

  const trail: BreadcrumbItem[] = [root];
  let href = "";
  parts.forEach((part, index) => {
    href += `/${part}`;
    if (index === 0) return;
    const last = index === parts.length - 1;
    // `/brand/wallet/invoices` is not a page: the invoice crumb names itself ("Invoice FD-2026-0042").
    if (part === "invoices" && !last) return;

    let label: string | undefined;
    if (href === "/brand/insights") label = last ? "Money Map" : "Insights";
    else if (part === "new" && parts[index - 1] === "bounties") label = "New bounty";
    else if (parts[index - 1] === "bounties" && index === 2) label = names.bounty ?? "Bounty";
    else if (parts[index - 1] === "apps" && index === 2) label = names.app ?? "App";
    else if (parts[index - 1] === "invoices") label = names.invoice ? `Invoice ${names.invoice}` : "Invoice";
    else label = NAV_LABELS.get(href) ?? routeFor(href)?.label;
    trail.push({ label: label ?? (part.includes("_") ? humanize(part.replace(/^[a-z]+_/, "")) : humanize(part)), ...(last ? {} : { href }) });
  });
  return trail;
}

/**
 * The brand shell's top-bar trail, resolved from the current path and the store. It leads with the workspace and app switcher (the first
 * crumb of every trail), then the rest of the path.
 */
export function BrandBreadcrumbs() {
  const pathname = usePathname();
  const me = useMe();
  const ids = crumbIds(pathname);
  const bounty = useBounty(ids.bounty);
  const app = useApp(ids.app);
  const invoice = useInvoice(ids.invoice);
  const items = useMemo(
    () => buildBrandCrumbs(pathname, { workspace: me.brand?.name, bounty: bounty?.title, app: app?.name, invoice: invoice?.number }),
    [pathname, me.brand?.name, bounty?.title, app?.name, invoice?.number],
  );
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
      <BrandWorkspaceSwitcher />
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-disabled" strokeWidth={1.75} />
      <Breadcrumbs items={items.slice(1)} className="min-w-0 flex-1" />
    </div>
  );
}
