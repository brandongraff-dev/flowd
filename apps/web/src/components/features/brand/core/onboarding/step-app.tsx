"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { CATEGORIES, CATEGORY_META, type Category } from "@/lib/contract/types";
import { useApps, useDemoNow } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { generateAudit, parseAppInput } from "@/lib/engine";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { notify } from "@/components/ui/toast";

const EXAMPLE = "https://apps.apple.com/us/app/lumi/id6448907919";

/**
 * Step 1: the App Store link. Paste a link or type a name and flowd builds the listing card before anything is saved: name, tagline, category and
 * the features creators can demo, with a generated glyph (never your real icon or anyone's logo). Adding it is one click; a link that is already in
 * a workspace says so and opens that app instead of duplicating it. Apps added earlier and not finished are listed so setup can resume.
 */
export function StepApp({ onAdded, onPick }: { onAdded: (appId: string) => void; onPick: (appId: string) => void }) {
  const now = useDemoNow();
  const apps = useApps();
  const [text, setText] = useState("");
  const [looked, setLooked] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [duplicate, setDuplicate] = useState<AppView | null>(null);
  const [busy, setBusy] = useState(false);

  const unfinished = apps.filter((app) => app.archived_at === undefined && app.health !== "healthy");
  const preview = useMemo(() => (looked ? generateAudit({ input: looked, now, ...(category ? { category } : {}) }) : null), [looked, now, category]);

  const lookUp = (): void => {
    const value = text.trim();
    setDuplicate(null);
    if (value.length < 2) {
      setError("Paste an App Store link or type your app's name.");
      setLooked(null);
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      const parsed = parseAppInput(value);
      if (parsed.store === "other") {
        setError("That is not an App Store link. Paste one that starts with https://apps.apple.com, or type the app's name.");
        setLooked(null);
        return;
      }
      if (parsed.store === "google_play") {
        setError("flowd attributes iOS subscriptions today. Paste your App Store link, or type the app's name.");
        setLooked(null);
        return;
      }
    }
    setError(undefined);
    setCategory(null);
    setLooked(value);
  };

  const add = async (): Promise<void> => {
    if (!looked || !preview) return;
    setBusy(true);
    const result = await actions.addApp({ store_url_or_name: looked, category: category ?? preview.category });
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === "app_exists") {
        const existing = apps.find((app) => app.id === `app_${parseAppInput(looked).slug.replace(/-/g, "")}`);
        setDuplicate(existing ?? null);
      }
      setError(result.error.message);
      return;
    }
    notify.success(`${result.data.app.name} added`, { description: "Next, connect RevenueCat so conversions can be tied to creators." });
    onAdded(result.data.app.id);
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h2 className="font-display text-title-lg text-fg">Paste your App Store link</h2>
        <p className="max-w-[58ch] text-body-sm text-fg-muted">flowd reads the listing, builds your app card and drafts briefs from it. You can edit every detail afterwards.</p>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          lookUp();
        }}
      >
        <Field label="App Store link or app name" error={error} hint={`Example: ${EXAMPLE}`}>
          <Input
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
            }}
            placeholder="https://apps.apple.com/us/app/your-app/id1234567890"
            autoComplete="off"
            inputMode="url"
            leading={<Search />}
            trailing={
              <Button type="submit" variant="secondary" size="sm">
                Look up
              </Button>
            }
          />
        </Field>
        <button type="button" onClick={() => setText(EXAMPLE)} className="w-fit rounded-md text-caption font-semibold text-accent hover:underline">
          Use the example link
        </button>
      </form>

      {duplicate ? (
        <Callout
          tone="info"
          title={`${duplicate.name} is already in this workspace`}
          action={
            <Link href={`/brand/apps/${duplicate.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open {duplicate.name}
            </Link>
          }
        >
          Open it to finish its setup instead of adding it twice.
        </Callout>
      ) : null}

      {preview ? (
        <section aria-label="App card preview" className="grid gap-5 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:p-6">
          <div className="flex items-start gap-4">
            <AppIcon art={preview.icon} name={preview.app_name} size={72} decorative />
            <div className="grid min-w-0 gap-1.5">
              <p className="truncate font-display text-title-md text-fg">{preview.app_name}</p>
              <p className="text-body-sm text-fg-muted">{preview.tagline}</p>
              <p className="text-caption text-fg-subtle">A generated glyph stands in for your icon in the demo.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" hint={preview.category_source === "guess" ? "We guessed from the name. Pick the closest one." : "Matched from the name. Change it if it is wrong."}>
              <Select value={category ?? preview.category} onValueChange={(next) => setCategory(next as Category)} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))} />
            </Field>
            <div className="grid content-start gap-2">
              <p className="text-caption font-semibold text-fg-muted">Features creators can demo</p>
              <ul className="flex flex-wrap gap-1.5">
                {preview.features.slice(0, 4).map((feature) => (
                  <li key={feature}>
                    <Badge tone="neutral" size="md">
                      {feature}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" loading={busy} onClick={add} trailingIcon={<ArrowRight aria-hidden="true" />}>
              Add {preview.app_name}
            </Button>
            <p className="text-caption text-fg-subtle">Adding an app is free. Nothing is charged until you fund a bounty.</p>
          </div>
        </section>
      ) : null}

      {unfinished.length > 0 ? (
        <section aria-label="Apps still being set up" className="grid gap-2.5 border-t border-divider pt-5">
          <h3 className="text-body-sm font-semibold text-fg">Or pick up where you left off</h3>
          <ul className="grid gap-2">
            {unfinished.map((app) => (
              <li key={app.id} className="flex items-center gap-3 rounded-[20px] bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <AppIcon art={app.icon} name={app.name} size={40} decorative />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-body-sm font-semibold text-fg">{app.name}</span>
                  <span className="text-caption text-fg-subtle">{app.health === "needs_attention" ? "An integration needs attention" : "RevenueCat is not connected yet"}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => onPick(app.id)}>
                  Continue setup
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
