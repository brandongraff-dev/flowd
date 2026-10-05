"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell";
import { Badge, Skeleton, SkeletonGroup } from "@/components/ui";
import { useBrandSettings, useStoreReady } from "@/lib/data";
import { BRAND_MEMBER_ROLE_META } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { PlanAndBilling } from "./settings-billing";
import { DangerZone, DefaultRights, NotificationsSection, ProfileSection, ReviewAndCompliance, TaxSection } from "./settings-sections";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "plan", label: "Plan and billing" },
  { id: "notifications", label: "Notifications" },
  { id: "compliance", label: "Review and compliance" },
  { id: "rights", label: "Default rights" },
  { id: "tax", label: "VAT and tax" },
  { id: "danger", label: "Danger zone" },
] as const;

/** Which section is under the top of the viewport, for the in-page nav. Reads positions on scroll; no observers to leak. */
function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const onScroll = (): void => {
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);
  return active;
}

const IDS = SECTIONS.map((section) => section.id);

/** Workspace settings: profile, plan and billing, notifications, review and compliance defaults, default rights, tax and the danger zone. */
export function SettingsView() {
  const ready = useStoreReady();
  const settings = useBrandSettings();
  const active = useActiveSection(IDS);
  const brand = settings.brand;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Setup"
        title="Settings"
        description="Your workspace, your plan, and the rules every bounty starts from."
        meta={
          settings.member ? (
            <Badge size="lg" tone={BRAND_MEMBER_ROLE_META[settings.member.role].tone}>
              You are {BRAND_MEMBER_ROLE_META[settings.member.role].label.toLowerCase()}
            </Badge>
          ) : undefined
        }
      />

      {!ready || !brand ? (
        <SkeletonGroup label="Loading settings" className="grid gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </SkeletonGroup>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="sticky top-24 hidden lg:block">
            <ul className="grid gap-0.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={active === section.id ? "true" : undefined}
                    className={cn("block rounded-lg px-3 py-2 text-body-sm font-medium transition-colors duration-(--fd-dur-fast) ease-standard", active === section.id ? "bg-surface-active text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg")}
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="grid min-w-0 gap-10">
            <section id="profile" aria-label="Profile" className="scroll-mt-24">
              <ProfileSection key={`${brand.tagline}|${brand.website}`} brand={brand} canManage={settings.can_manage} />
            </section>
            <section id="plan" aria-label="Plan and billing" className="grid scroll-mt-24 gap-4">
              <div className="grid gap-1">
                <h2 className="font-display text-title-md text-fg">Plan and billing</h2>
                <p className="max-w-[62ch] text-body-sm text-fg-muted">Creators are always free. You pay a monthly plan plus a fee on creator pay, shown before you fund anything.</p>
              </div>
              <PlanAndBilling />
            </section>
            <section id="notifications" aria-label="Notifications" className="scroll-mt-24">
              <NotificationsSection />
            </section>
            <section id="compliance" aria-label="Review and compliance" className="scroll-mt-24">
              <ReviewAndCompliance key={JSON.stringify([brand.review_sla_hours, brand.timeout_policy, brand.compliance_defaults])} brand={brand} canManage={settings.can_manage} />
            </section>
            <section id="rights" aria-label="Default rights" className="scroll-mt-24">
              <DefaultRights />
            </section>
            <section id="tax" aria-label="VAT and tax" className="scroll-mt-24">
              <TaxSection key={JSON.stringify(brand.billing)} brand={brand} canManage={settings.can_manage} />
            </section>
            <section id="danger" aria-label="Danger zone" className="scroll-mt-24">
              <DangerZone />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
