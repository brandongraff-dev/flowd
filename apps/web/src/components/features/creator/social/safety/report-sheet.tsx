"use client";

import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button, Callout, Field, Input, Select, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, notify } from "@/components/ui";
import { REPORT_TARGET_KIND_META, SCAM_REASON_META, SCAM_REASONS, REPORT_TARGET_KINDS, type ReportTargetKind, type ScamReason } from "@/lib/contract/types";
import { useInbox, useOffers } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { actions } from "@/lib/store";
import { useRun } from "../shared/run-action";

/** Something in the inbox you can report with one tap: the thread or offer it came from. */
export interface ReportTarget {
  kind: ReportTargetKind;
  id: string;
  /** Plain words for the list ("Offer from Lumi: Glow-up hooks"). */
  label: string;
}

export interface ReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects what is being reported (the inbox passes the open conversation). */
  defaultTarget?: ReportTarget;
  /** The reason to start on. */
  defaultReason?: ScamReason;
}

const OTHER = "other";
const REASON_HINT: Partial<Record<ScamReason, string>> = {
  pay_to_join: "They asked you to pay, buy something or send money to take part.",
  off_platform_chat: "They asked you to move to WhatsApp, Telegram, email or DMs.",
  fake_brand: "The brand is not who it says it is, or is not Verified.",
  burner_account_demand: "They want a new or dedicated account just for them.",
  no_escrow_claim: "They say it is funded but it is not, or want to pay outside flowd.",
  suspicious_link: "A link you did not expect, or one that is not joinflowd.io.",
  harassment: "Messages that are abusive, threatening or relentless.",
};

/**
 * Report something that looks off. Say what it is, pick why, describe it in a sentence or two. A person on the flowd team replies within
 * 24 hours, and the case shows in "My reports" with its status. Reporting never costs you anything and never hurts a creator or brand
 * that did nothing wrong: reports are checked by a human before anyone is actioned.
 */
export function ReportSheet({ open, onOpenChange, defaultTarget, defaultReason = "pay_to_join" }: ReportSheetProps) {
  const offers = useOffers();
  const inbox = useInbox();
  const [target, setTarget] = useState<string>(defaultTarget ? `${defaultTarget.kind}:${defaultTarget.id}` : OTHER);
  const [otherKind, setOtherKind] = useState<ReportTargetKind>("brand");
  const [otherId, setOtherId] = useState("");
  const [reason, setReason] = useState<ScamReason>(defaultReason);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();

  const options = useMemo(() => {
    const list: { value: string; label: string; kind: ReportTargetKind; id: string }[] = [];
    if (defaultTarget) list.push({ value: `${defaultTarget.kind}:${defaultTarget.id}`, label: defaultTarget.label, kind: defaultTarget.kind, id: defaultTarget.id });
    for (const offer of offers) {
      const value = `offer:${offer.id}`;
      if (!list.some((item) => item.value === value)) list.push({ value, label: `Offer from ${offer.brand?.name ?? "a brand"}: ${offer.title}`, kind: "offer", id: offer.id });
    }
    for (const thread of inbox.threads.slice(0, 8)) {
      const value = `message:${thread.id}`;
      if (!list.some((item) => item.value === value)) list.push({ value, label: `Conversation: ${thread.title}`, kind: "message", id: thread.id });
    }
    return list;
  }, [offers, inbox.threads, defaultTarget]);

  const submit = async (): Promise<void> => {
    const chosen = options.find((item) => item.value === target);
    const kind = chosen?.kind ?? otherKind;
    const id = chosen?.id ?? otherId.trim();
    if (!chosen && id.length === 0) {
      setError("Say who or what you are reporting: a brand, a bounty, a person or an offer.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Tell us what happened in a sentence or two.");
      return;
    }
    setError(undefined);
    const data = await run("report", () => actions.reportScam({ target_kind: kind, target_id: id, reason, description }));
    if (!data) return;
    notify.success(`Report ${data.report.case_id} sent`, { description: `We reply by ${formatDate(data.report.sla_due_at, "weekday")}. You can follow it in My reports.` });
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Report something</SheetTitle>
          <SheetDescription>A person on the flowd team reads every report and replies within 24 hours. You will not be charged, and nobody is actioned without a human check.</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-5">
          <Field label="What are you reporting?">
            <Select
              value={target}
              onValueChange={setTarget}
              groups={[
                ...(options.length > 0 ? [{ label: "From your inbox", options: options.map((item) => ({ value: item.value, label: item.label })) }] : []),
                { label: "Something else", options: [{ value: OTHER, label: "A brand, bounty or person not listed" }] },
              ]}
            />
          </Field>
          {target === OTHER ? (
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field label="It is a">
                <Select value={otherKind} onValueChange={(next) => setOtherKind(next as ReportTargetKind)} options={REPORT_TARGET_KINDS.map((kind) => ({ value: kind, label: REPORT_TARGET_KIND_META[kind].label }))} />
              </Field>
              <Field label="Name or id" hint="A brand name, @handle or the id in the link.">
                <Input value={otherId} onChange={(event) => setOtherId(event.target.value)} placeholder="Brand name or @handle" autoComplete="off" />
              </Field>
            </div>
          ) : null}
          <Field label="Why?" hint={REASON_HINT[reason]}>
            <Select value={reason} onValueChange={(next) => setReason(next as ScamReason)} options={SCAM_REASONS.map((value) => ({ value, label: SCAM_REASON_META[value].label }))} />
          </Field>
          <Field label="What happened?" error={error}>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={600} showCount placeholder="They asked for a $20 starter fee before I could start the bounty." />
          </Field>
          <Callout tone="info" title="Never send money, codes or passwords">
            flowd never asks you to pay, and never asks for your password or a verification code. If someone does, that is the report.
          </Callout>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={<ShieldAlert />} loading={busy === "report"} onClick={() => void submit()}>
            Send report
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
