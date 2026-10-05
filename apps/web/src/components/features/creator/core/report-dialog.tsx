"use client";

import { useState, type ReactElement } from "react";
import { Flag } from "lucide-react";
import { SCAM_REASON_META, type ReportTargetKind, type ScamReason } from "@/lib/contract/types";
import { actions } from "@/lib/store";
import { Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Field, Select, Textarea, notify } from "@/components/ui";

const REASON_HINT: Partial<Record<ScamReason, string>> = {
  pay_to_join: "Asked you to pay to join, apply or unlock a bounty",
  off_platform_chat: "Wants to move the conversation off flowd",
  fake_brand: "Pretends to be a brand or an app it is not",
  burner_account_demand: "Asks you to open a new or throwaway account",
  no_escrow_claim: "Says the work is funded when the bounty is not",
  suspicious_link: "Sent a link that looks unsafe",
};

export interface ReportDialogProps {
  targetKind: ReportTargetKind;
  targetId: string;
  /** What is being reported, in words: "Lumi", "Glow-up reveal". */
  targetLabel: string;
  /** The button that opens it. Default: a quiet "Report" button. */
  trigger?: ReactElement;
}

/**
 * Report a scam: a reason, a sentence or two, and a case id back. Reports go to Ops with a 24-hour triage clock; nothing here penalises the brand until
 * a person has looked. flowd never asks a creator to pay, so "pay to join" is the first reason in the list.
 */
export function ReportDialog({ targetKind, targetId, targetLabel, trigger }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ScamReason>("pay_to_join");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.reportScam({ target_kind: targetKind, target_id: targetId, reason, description });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    setDescription("");
    notify.success("Report sent", { description: `Case ${result.data.report.case_id}. Ops looks at it within 24 hours. You can follow it in Scam Shield.` });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="plain" size="sm" leadingIcon={<Flag />}>
            Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Report {targetLabel}</DialogTitle>
          <DialogDescription>flowd never asks you to pay, and all chat stays in the app. If something here broke that, tell us.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="What happened">
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as ScamReason)}
              options={(Object.keys(SCAM_REASON_META) as ScamReason[]).map((r) => ({ value: r, label: SCAM_REASON_META[r].label, description: REASON_HINT[r] }))}
            />
          </Field>
          <Field label="Tell us in a sentence or two" error={error} hint="Say what you saw and where. Do not include passwords or card numbers.">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={600} showCount placeholder="They asked for $20 to unlock the bounty." />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
