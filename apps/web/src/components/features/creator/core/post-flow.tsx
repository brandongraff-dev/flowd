"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import type { Platform } from "@/lib/contract/types";
import type { SubmissionView } from "@/lib/data/selectors";
import { PLATFORM_META } from "@/lib/contract/types";
import { actions } from "@/lib/store";
import { GlassCard } from "@/components/glass";
import { Button, Callout, Checkbox, CopyField, Field, Input, SegmentedControl, Textarea, buttonVariants, notify } from "@/components/ui";
import { useMyAccounts } from "./selectors";

/**
 * Posting an approved video (F-087). The disclosure is locked into the caption, the tracking link and the promo code are ready to copy, and the post is
 * attached once you have put it on your own account: that opens the 72-hour view window. Nothing here posts for you; flowd never holds your login.
 */
export function PostFlow({ sub }: { sub: SubmissionView }) {
  const router = useRouter();
  const accounts = useMyAccounts();
  const platforms = sub.bounty.deliverables.platforms;
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? "tiktok");
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");
  const [labelOn, setLabelOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const connected = accounts.filter((a) => a.platform === platform && a.status === "connected");
  const account = connected.find((a) => a.primary) ?? connected[0];
  const { brief } = sub.bounty;
  const preview = [brief.disclosure_text, caption.trim(), brief.hashtags.filter((h) => !brief.disclosure_text.includes(h)).join(" "), sub.link?.short_url].filter(Boolean).join(" ");

  const post = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.attachPost({
      submission_id: sub.id,
      platform,
      ...(account ? { social_account_id: account.id } : {}),
      caption: caption.trim(),
      ...(url.trim() ? { url: url.trim() } : {}),
      platform_label_on: labelOn,
    });
    setBusy(false);
    if (!result.ok) {
      setError(`${result.error.message}${result.error.hint ? ` ${result.error.hint}` : ""}`);
      return;
    }
    notify.success("Post attached. The 72-hour window is open", { description: "Views count from now. Your Money Clock shows an estimate with a date." });
    router.push(`/creator/posts/${result.data.post.id}`);
  };

  return (
    <GlassCard padding="lg" className="grid gap-5" aria-labelledby="post-title">
      <div className="grid gap-1">
        <h2 id="post-title" className="font-display text-title-md text-fg">
          Post it
        </h2>
        <p className="text-body-sm text-fg-muted">Post the approved video on your own account with the caption below. Then attach it here, and the 72-hour view window starts.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tracking link">
          <CopyField value={sub.link?.short_url ?? "Link appears after approval"} aria-label="Tracking link" />
        </Field>
        <Field label="Promo code" hint={sub.link?.promo_code ? "Say it once. The link works without it." : "This bounty uses the link only."}>
          <CopyField value={sub.link?.promo_code ?? "Link only"} aria-label="Promo code" />
        </Field>
      </div>

      {platforms.length > 1 ? (
        <Field label="Where you posted">
          <SegmentedControl aria-label="Platform" value={platform} onValueChange={setPlatform} options={platforms.map((p) => ({ value: p, label: PLATFORM_META[p].label }))} />
        </Field>
      ) : null}
      {!account ? (
        <Callout tone="sun" title={`Link a ${PLATFORM_META[platform].label} account first`} action={<Link href="/creator/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>Open Settings</Link>}>
          Linking is read-only. It lets flowd count your views and match you to bounties.
        </Callout>
      ) : (
        <p className="text-caption text-fg-muted">Posting from @{account.handle} on {PLATFORM_META[platform].label}.</p>
      )}

      <div className="grid gap-3">
        <p className="flex items-center gap-2 rounded-xl bg-surface-field px-3.5 py-2.5 text-caption font-medium text-fg shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <Lock aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={2} />
          <span>
            Disclosure, locked: <span className="font-semibold">{brief.disclosure_text}</span>
          </span>
        </p>
        <Field label="Your caption" optional hint="The disclosure, hashtags and your link are added if they are missing.">
          <Textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={3} maxLength={300} showCount placeholder="Day one with the app. The sleep sounds are the part I use most." />
        </Field>
        <div className="grid gap-1 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-micro font-medium text-fg-subtle">What goes out</p>
          <p className="text-body-sm text-fg">{preview}</p>
        </div>
        <Checkbox label={`I switched on ${PLATFORM_META[platform].label}'s paid-partnership label`} description="Some platforms require it as well as #ad. It helps your video stay up." checked={labelOn} onCheckedChange={(on) => setLabelOn(on === true)} />
        <Field label="Link to your post" optional hint="Paste the address of the post. In the demo we make one if you leave it empty.">
          <Input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@you/video/…" />
        </Field>
      </div>

      {error ? (
        <Callout tone="rose" role="alert" title="That didn't go through">
          {error}
        </Callout>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[46ch] text-caption text-fg-subtle">Views count for 72 hours from now, then a view check, then your money clears on the next 2 PM UTC run. Removing the post before the window closes means no pay for it.</p>
        <Button variant="primary" size="lg" loading={busy} disabled={!account} trailingIcon={<ArrowRight />} onClick={() => void post()}>
          I posted it
        </Button>
      </div>
    </GlassCard>
  );
}
