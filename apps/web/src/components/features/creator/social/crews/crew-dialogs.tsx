"use client";

import { useState } from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, Slider, Switch, notify } from "@/components/ui";
import { NICHES, NICHE_META, type Niche } from "@/lib/contract/types";
import type { CrewView } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";
import { actions } from "@/lib/store";
import { useRun } from "../shared/run-action";

export interface CreateCrewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultNiche: Niche;
}

/** Start a crew (Gold and above). The name rule and the weekly goal are stated up front; refusals from the store show in the field that caused them. */
export function CreateCrewDialog({ open, onOpenChange, defaultNiche }: CreateCrewDialogProps) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [niche, setNiche] = useState<Niche>(defaultNiche);
  const [isOpen, setIsOpen] = useState(true);
  const [goal, setGoal] = useState(25_000);
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();

  const submit = async (): Promise<void> => {
    if (name.trim().length < 3 || name.trim().length > 32) {
      setError("A crew name is 3 to 32 characters.");
      return;
    }
    setError(undefined);
    const data = await run("create", () => actions.createCrew({ name, tagline, niche, open: isOpen, weekly_goal_cents: goal }));
    if (!data) return;
    notify.success(`${data.crew.name} is live`, { description: `Share code ${data.crew.invite_code}. Crews need 3 members to unlock the weekly goal bonus.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Start a crew</DialogTitle>
          <DialogDescription>A crew is 3 to 20 creators with a shared board and a weekly goal. flowd pays the bonus; members never do.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          <Field label="Crew name" hint="3 to 32 characters." error={error}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Sunday Resetters" autoComplete="off" />
          </Field>
          <Field label="Tagline" optional>
            <Input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={80} placeholder="Plan the week, film the week." autoComplete="off" />
          </Field>
          <Field label="Niche">
            <Select value={niche} onValueChange={(next) => setNiche(next as Niche)} options={NICHES.map((n) => ({ value: n, label: NICHE_META[n].label }))} />
          </Field>
          <Field label={`Weekly goal: ${formatMoney(goal, { cents: "never" })}`} hint="Reach it together and flowd pays 3% of the crew's week, up to $250.">
            <Slider min={10_000} max={100_000} step={5_000} value={[goal]} onValueChange={(value) => setGoal(value[0] ?? goal)} format={(v) => formatMoney(v, { cents: "never" })} aria-label="Weekly crew goal" />
          </Field>
          <Switch label="Open to join" description="Anyone eligible can join without a code. Turn it off for an invite-only crew." checked={isOpen} onCheckedChange={setIsOpen} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy === "create"} onClick={() => void submit()}>
            Start crew
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface JoinCodeDialogProps {
  crew: CrewView | null;
  onOpenChange: (open: boolean) => void;
}

/** An invite-only crew asks for its code. A wrong code says so in the field. */
export function JoinCodeDialog({ crew, onOpenChange }: JoinCodeDialogProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!crew) return;
    if (code.trim().length === 0) {
      setError("Enter the invite code the crew lead gave you.");
      return;
    }
    setBusy(true);
    const result = await actions.joinCrew({ crew_id: crew.id, invite_code: code });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(undefined);
    notify.success(`You joined ${crew.name}`, { description: "You can leave any time from Crews." });
    setCode("");
    onOpenChange(false);
  };

  return (
    <Dialog open={crew !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Join {crew?.name}</DialogTitle>
          <DialogDescription>This crew is invite only. Ask the lead for the code, or open the invite link they shared.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Invite code" error={error}>
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" placeholder="HOOKLAB2" className="font-mono" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Join crew
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
