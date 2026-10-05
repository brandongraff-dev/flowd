"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { Button, Callout, Field, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, notify } from "@/components/ui";
import type { TournamentView } from "@/lib/data/selectors";
import { actions } from "@/lib/store";
import { HookChecker } from "../shared/hook-checker";
import { useRun } from "../shared/run-action";

export interface EnterSheetProps {
  tournament: TournamentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN = 8;

/**
 * Entering takes one hook line. It is scored live on the checklist before you send it, so you see what judges' first look will say.
 * Free to enter, and the form says so.
 */
export function EnterSheet({ tournament, open, onOpenChange }: EnterSheetProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();

  const submit = async (): Promise<void> => {
    if (text.trim().length < MIN) {
      setError("Write your hook line: at least a short sentence, spoken in about two seconds.");
      return;
    }
    setError(undefined);
    const data = await run("enter", () => actions.joinTournament({ tournament_id: tournament.id, hook_text: text.trim() }));
    if (!data) return;
    notify.success(`You're in ${tournament.title}`, { description: `Checklist score ${data.entry.hook_points}. Seed ${data.entry.seed}. Free to enter, and nothing was charged.` });
    onOpenChange(false);
    setText("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Enter {tournament.title}</SheetTitle>
          <SheetDescription>One hook line. Judges compare hooks head to head, so make the first two seconds count.</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-6">
          <Field label="Your hook line" hint="Say it the way you would on camera. Eight characters minimum, and a risky income claim caps the score." error={error}>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={140} showCount placeholder="I was wrong about every study app I tried before Quillo." />
          </Field>
          <HookChecker text={text} />
          <Callout tone="info" title="Free, and honest about the score">
            Entry never costs money. This is a checklist score from the words alone; it gets smarter as bounties settle and says nothing about how the video will do.
          </Callout>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={<Swords />} loading={busy === "enter"} onClick={() => void submit()}>
            Enter tournament
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
