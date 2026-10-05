"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Plus, RotateCcw } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, ConfirmDialog, Field, Input, RadioGroup, RadioGroupItem, RemovableChip, Select, Slider, Switch, buttonVariants, notify } from "@/components/ui";
import { AI_CONTENT_POLICY_META, MUSIC_POLICY_META, type AiContentPolicy, type Brand, type MusicPolicy, type NotificationPrefs, type TimeoutPolicy } from "@/lib/contract/types";
import { buildRightsCard, rightsLines, rightsSummary } from "@/lib/engine";
import { useBounties } from "@/lib/data";
import { formatDate, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { RightsCardList } from "./rights-card-list";
import { settle } from "./report";
import { useMyPrefs } from "./selectors";

/** A card with a title, one line of purpose and a Save row. Every field of a section saves together, so nothing is half-changed. */
function SectionCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <GlassCard padding="md" className="grid gap-5">
      <div className="grid gap-1">
        <h3 className="font-display text-title-sm text-fg">{title}</h3>
        {description ? <p className="max-w-[62ch] text-body-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-3">{footer}</div> : null}
    </GlassCard>
  );
}

/** A list of short strings (banned claims, competitor names) with an add box and removable chips. */
function ChipListEditor({ label, hint, values, onChange, placeholder, max = 12 }: { label: string; hint: string; values: readonly string[]; onChange: (next: readonly string[]) => void; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (): void => {
    const next = draft.trim();
    if (next && !values.some((entry) => entry.toLowerCase() === next.toLowerCase()) && values.length < max) onChange([...values, next]);
    setDraft("");
  };
  return (
    <div className="grid gap-2.5">
      <Field label={label} hint={hint}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          trailing={
            <Button type="button" size="xs" variant="secondary" leadingIcon={<Plus />} onClick={add} disabled={!draft.trim()}>
              Add
            </Button>
          }
        />
      </Field>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {values.map((entry) => (
            <li key={entry}>
              <RemovableChip size="sm" onRemove={() => onChange(values.filter((value) => value !== entry))} removeLabel={`Remove ${entry}`}>
                {entry}
              </RemovableChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProfileSection({ brand, canManage }: { brand: Brand; canManage: boolean }) {
  const [tagline, setTagline] = useState(brand.tagline);
  const [website, setWebsite] = useState(brand.website);
  const [busy, setBusy] = useState(false);
  const dirty = tagline !== brand.tagline || website !== brand.website;
  const urlOk = /^https?:\/\/[^\s]+\.[^\s]+$/i.test(website.trim());

  const save = async (): Promise<void> => {
    setBusy(true);
    await settle(actions.updateBrandSettings({ tagline, website }), "Workspace profile saved");
    setBusy(false);
  };

  return (
    <SectionCard
      title="Workspace profile"
      description="What creators see beside your bounties and on your Brand Scorecard."
      footer={
        <>
          {!canManage ? <p className="mr-auto text-caption text-fg-subtle">Owners and admins can edit this.</p> : null}
          <Button variant="secondary" loading={busy} disabled={!canManage || !dirty || !tagline.trim() || !urlOk} onClick={() => void save()}>
            Save profile
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4">
        <ArtAvatar art={brand.logo} name={brand.name} size={56} shape="square" decorative />
        <div className="grid gap-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-title-sm text-fg">
            {brand.name}
            {brand.verification === "verified" ? (
              <Badge size="md" tone="accent" icon={<BadgeCheck />}>
                Verified business
              </Badge>
            ) : null}
          </p>
          <p className="text-caption text-fg-subtle">
            Workspace since {formatDate(brand.created_at, "medium")} · {brand.country}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Tagline" hint="One line, shown on your bounties.">
          <Input value={tagline} onChange={(event) => setTagline(event.target.value)} disabled={!canManage} maxLength={90} autoComplete="off" />
        </Field>
        <Field label="Website" error={website.trim() !== "" && !urlOk ? "Enter a full address, like https://yourapp.com." : undefined}>
          <Input type="url" inputMode="url" value={website} onChange={(event) => setWebsite(event.target.value)} disabled={!canManage} autoComplete="off" spellCheck={false} />
        </Field>
      </div>
    </SectionCard>
  );
}

const CATEGORIES: readonly { key: string; label: string; text: string; locked?: boolean }[] = [
  { key: "money", label: "Money and escrow", text: "Funding, payouts, low wallet and invoices.", locked: true },
  { key: "reviews", label: "Reviews", text: "Videos waiting, and decisions nearing the deadline." },
  { key: "offers", label: "Offers", text: "Counters, acceptances and expiries." },
  { key: "safety", label: "Safety and disputes", text: "Fraud holds, disputes and rights expiring.", locked: true },
  { key: "tips", label: "Tips and product news", text: "What is new, and what is working for brands like yours." },
];

export function NotificationsSection() {
  const prefs = useMyPrefs();
  const categories = prefs?.categories ?? { money: true, reviews: true, offers: true, safety: true, tips: true };
  const quiet = prefs?.quiet_hours ?? { enabled: false, start: "22:00", end: "08:00", timezone: "UTC" };
  const [start, setStart] = useState(quiet.start);
  const [end, setEnd] = useState(quiet.end);

  const update = async (patch: Partial<Pick<NotificationPrefs, "push" | "email_digest" | "categories" | "quiet_hours" | "batch_non_cash">>): Promise<void> => {
    await settle(actions.updateNotificationPrefs(patch));
  };

  return (
    <SectionCard title="Notifications" description="Money and safety alerts stay on, so you never miss a funding or fraud message. Everything else is yours to tune.">
      <div className="grid divide-y divide-divider">
        <Switch label="Push notifications" description="On your phone and in the browser." checked={prefs?.push ?? true} onCheckedChange={(on) => void update({ push: on })} />
        <Switch label="Weekly email digest" description="Spend, trials and what is waiting, every Monday." checked={prefs?.email_digest ?? true} onCheckedChange={(on) => void update({ email_digest: on })} />
        {CATEGORIES.map((category) => (
          <Switch
            key={category.key}
            label={category.label}
            description={category.locked ? `${category.text} Always on.` : category.text}
            checked={category.locked ? true : (categories[category.key] ?? true)}
            disabled={category.locked}
            onCheckedChange={(on) => void update({ categories: { [category.key]: on } })}
          />
        ))}
        <div className="grid gap-3 py-2">
          <Switch label="Quiet hours" description="Hold non-urgent alerts overnight. Money and safety still come through." checked={quiet.enabled} onCheckedChange={(on) => void update({ quiet_hours: { ...quiet, enabled: on } })} />
          {quiet.enabled ? (
            <div className="grid max-w-md grid-cols-2 gap-4">
              <Field label="From">
                <Input type="time" value={start} onChange={(event) => setStart(event.target.value)} onBlur={() => start !== quiet.start && void update({ quiet_hours: { ...quiet, start } })} />
              </Field>
              <Field label="Until">
                <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} onBlur={() => end !== quiet.end && void update({ quiet_hours: { ...quiet, end } })} />
              </Field>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

export function ReviewAndCompliance({ brand, canManage }: { brand: Brand; canManage: boolean }) {
  const d = brand.compliance_defaults;
  const [sla, setSla] = useState(brand.review_sla_hours);
  const [policy, setPolicy] = useState<TimeoutPolicy>(brand.timeout_policy);
  const [disclosure, setDisclosure] = useState(d.disclosure_text);
  const [banned, setBanned] = useState<readonly string[]>(d.banned_claims);
  const [competitors, setCompetitors] = useState<readonly string[]>(d.competitor_names);
  const [music, setMusic] = useState<MusicPolicy>(d.music_policy);
  const [ai, setAi] = useState<AiContentPolicy>(d.ai_policy);
  const [busy, setBusy] = useState(false);

  const dirty = sla !== brand.review_sla_hours || policy !== brand.timeout_policy || disclosure !== d.disclosure_text || music !== d.music_policy || ai !== d.ai_policy || banned.join("|") !== d.banned_claims.join("|") || competitors.join("|") !== d.competitor_names.join("|");
  const disclosureOk = /#ad\b|#sponsored|paid partnership/i.test(disclosure);

  const save = async (): Promise<void> => {
    setBusy(true);
    await settle(
      actions.updateBrandSettings({ review_sla_hours: sla, timeout_policy: policy, compliance_defaults: { disclosure_text: disclosure.trim(), banned_claims: [...banned], competitor_names: [...competitors], music_policy: music, ai_policy: ai } }),
      "Review and compliance defaults saved",
    );
    setBusy(false);
  };

  return (
    <SectionCard
      title="Review promise and compliance defaults"
      description="Copied onto every new bounty, so each one starts from your rules. Creators see your review promise before they apply."
      footer={
        <>
          {!canManage ? <p className="mr-auto text-caption text-fg-subtle">Owners and admins can edit this.</p> : null}
          <Button variant="secondary" loading={busy} disabled={!canManage || !dirty || !disclosure.trim()} onClick={() => void save()}>
            Save defaults
          </Button>
        </>
      }
    >
      <fieldset disabled={!canManage} className="grid gap-6">
        <div className="grid gap-3">
          <Field label={`Decide within ${sla} hours`} hint="Missing it counts against your Brand Scorecard. The platform default is 72 hours.">
            <Slider aria-label="Review promise in hours" min={12} max={72} step={6} value={[sla]} onValueChange={([next]) => setSla(next)} format={(value) => `${value} h`} />
          </Field>
          <div className="grid gap-2">
            <p id="timeout-label" className="text-body-sm font-medium text-fg">
              If the deadline passes
            </p>
            <RadioGroup aria-labelledby="timeout-label" value={policy} onValueChange={(next) => setPolicy(next as TimeoutPolicy)} className="grid gap-2 sm:grid-cols-2">
              <RadioGroupItem id="policy-escalate" value="escalate" variant="card" label="Escalate to the owner" description="Flag the video and nudge the owner. Nothing is approved without a person." />
              <RadioGroupItem id="policy-clean" value="approve_if_clean" variant="card" label="Approve if clean" description="Videos that pass every check are approved at the deadline. Anything flagged stays in the queue." />
            </RadioGroup>
          </div>
        </div>

        <div className="grid gap-5 border-t border-divider pt-5">
          <Field label="Disclosure wording" error={!disclosureOk && disclosure.trim() ? "Include #ad or paid partnership, so every post carries a clear disclosure." : undefined} hint="Added automatically to every creator's caption.">
            <Input value={disclosure} onChange={(event) => setDisclosure(event.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <ChipListEditor label="Banned claims" hint="Phrases creators must not say. Press Enter to add." values={banned} onChange={setBanned} placeholder="guaranteed results" />
          <ChipListEditor label="Competitor apps" hint="Apps that must not appear in a video." values={competitors} onChange={setCompetitors} placeholder="Another app's name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Music">
              <Select value={music} onValueChange={(next) => setMusic(next as MusicPolicy)} options={(Object.keys(MUSIC_POLICY_META) as MusicPolicy[]).map((key) => ({ value: key, label: MUSIC_POLICY_META[key].label }))} />
            </Field>
            <Field label="AI-generated content">
              <Select value={ai} onValueChange={(next) => setAi(next as AiContentPolicy)} options={(Object.keys(AI_CONTENT_POLICY_META) as AiContentPolicy[]).map((key) => ({ value: key, label: AI_CONTENT_POLICY_META[key].label }))} />
            </Field>
          </div>
        </div>
      </fieldset>
    </SectionCard>
  );
}

export function DefaultRights() {
  const card = buildRightsCard();
  return (
    <SectionCard title="Default rights" description="Every new bounty and offer starts here. You adjust the Rights Card per bounty in the builder, and creators always read it before they commit.">
      <RightsCardList lines={rightsLines(card)} summary={rightsSummary(card)} />
      <div>
        <Link href="/brand/bounties/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Set rights on a new bounty
        </Link>
      </div>
    </SectionCard>
  );
}

export function TaxSection({ brand, canManage }: { brand: Brand; canManage: boolean }) {
  const b = brand.billing;
  const [legal, setLegal] = useState(b.legal_name);
  const [email, setEmail] = useState(b.billing_email);
  const [vat, setVat] = useState(b.vat_id ?? "");
  const [po, setPo] = useState(b.po_required);
  const [center, setCenter] = useState(b.cost_center ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const dirty = legal !== b.legal_name || email !== b.billing_email || vat !== (b.vat_id ?? "") || po !== b.po_required || center !== (b.cost_center ?? "");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const save = async (): Promise<void> => {
    if (!emailOk) {
      setError("Enter a valid billing email.");
      return;
    }
    setError(undefined);
    setBusy(true);
    await settle(actions.updateBrandSettings({ billing: { legal_name: legal.trim(), billing_email: email.trim(), vat_id: vat.trim(), po_required: po, cost_center: center.trim() } }), "Billing details saved");
    setBusy(false);
  };

  return (
    <SectionCard
      title="VAT and tax information"
      description="Printed on every invoice. EU businesses add a VAT ID so reverse charge applies. flowd is not a tax adviser."
      footer={
        <>
          {!canManage ? <p className="mr-auto text-caption text-fg-subtle">Owners and admins can edit this.</p> : null}
          <Button variant="secondary" loading={busy} disabled={!canManage || !dirty || !legal.trim()} onClick={() => void save()}>
            Save billing details
          </Button>
        </>
      }
    >
      <fieldset disabled={!canManage} className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Legal name">
            <Input value={legal} onChange={(event) => setLegal(event.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Billing email" error={error}>
            <Input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </Field>
          <Field label="VAT ID" optional hint="For example DE123456789.">
            <Input value={vat} onChange={(event) => setVat(event.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Cost centre" optional hint="Added to invoices.">
            <Input value={center} onChange={(event) => setCenter(event.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Switch label="Require a PO number on invoices" description="Finance can add it on each invoice before it is final." checked={po} onCheckedChange={setPo} />
      </fieldset>
    </SectionCard>
  );
}

/** Things you can undo, and one that is not offered in the demo, with the reason. */
export function DangerZone() {
  const live = useBounties({ brand: "mine", status: "live" });
  const [pausing, setPausing] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <GlassCard padding="md" className="grid gap-5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-rose)_35%,transparent)]">
      <div className="grid gap-1">
        <h3 className="font-display text-title-sm text-fg">Danger zone</h3>
        <p className="text-body-sm text-fg-muted">These affect the whole workspace. Pausing is reversible from Bounties.</p>
      </div>
      <ul className="grid divide-y divide-divider">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="grid gap-0.5">
            <p className="text-body-sm font-semibold text-fg">Pause every live bounty</p>
            <p className="text-caption text-fg-subtle">{live.length === 0 ? "Nothing is live right now." : `${pluralise(live.length, "live bounty", "live bounties")} stop taking new videos. Videos in review are still decided and paid.`}</p>
          </div>
          <Button variant="danger" disabled={live.length === 0} onClick={() => setPausing(true)}>
            Pause all
          </Button>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="grid gap-0.5">
            <p className="text-body-sm font-semibold text-fg">Reset the demo</p>
            <p className="text-caption text-fg-subtle">Discards every change made in this browser and restores the starting demo world. You stay signed in.</p>
          </div>
          <Button variant="danger" leadingIcon={<RotateCcw />} onClick={() => setResetting(true)}>
            Reset demo data
          </Button>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="grid gap-0.5">
            <p className="text-body-sm font-semibold text-fg">Close this workspace</p>
            <p className="max-w-[56ch] text-caption text-fg-subtle">Closing settles escrow, returns unspent money and reconciles the ledger, so we do it with you. Email hello@joinflowd.io from your account address.</p>
          </div>
          <Button variant="ghost" disabled aria-disabled="true">
            Handled by support
          </Button>
        </li>
      </ul>

      <ConfirmDialog
        open={pausing}
        onOpenChange={setPausing}
        title={`Pause ${pluralise(live.length, "bounty", "bounties")}?`}
        description="Creators cannot start new videos on a paused bounty. Resume each one from Bounties whenever you are ready."
        confirmLabel="Pause all"
        tone="danger"
        onConfirm={async () => {
          const results = await Promise.all(live.map((bounty) => actions.pauseBounty({ bounty_id: bounty.id, reason: "Paused from workspace settings" })));
          const failed = results.filter((result) => !result.ok);
          if (failed.length > 0 && !failed[0].ok) notify.error(`${pluralise(failed.length, "bounty", "bounties")} could not be paused`, { description: failed[0].error.message });
          else notify.success(`Paused ${pluralise(results.length, "bounty", "bounties")}`, { description: "Resume them from Bounties." });
        }}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset all demo data?"
        description="Every bounty, offer, bid and setting you changed in this browser is discarded, and the demo returns to its starting state."
        confirmLabel="Reset demo data"
        tone="danger"
        onConfirm={async () => {
          await actions.resetDemo();
          notify.success("Demo reset", { description: "Back to the starting world." });
        }}
      />
      <Callout tone="neutral" title="Demo data">
        Resetting only affects this browser. Nothing here is real money.
      </Callout>
    </GlassCard>
  );
}
