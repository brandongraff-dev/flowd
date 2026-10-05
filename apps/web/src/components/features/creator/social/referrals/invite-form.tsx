"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button, Field, Input, SegmentedControl, notify } from "@/components/ui";
import { actions } from "@/lib/store";
import { useRun } from "../shared/run-action";

type Channel = "link" | "code";

/**
 * Log an invite so you can see who you asked and how it went. A name or handle is enough. The reward rules sit beside the form, and
 * the person you invite is never charged and never needs your code to join.
 */
export function InviteForm() {
  const [label, setLabel] = useState("");
  const [channel, setChannel] = useState<Channel>("link");
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (label.trim().length < 2) {
      setError("Who are you inviting? A name or handle helps you track it.");
      return;
    }
    setError(undefined);
    const data = await run("invite", () => actions.inviteToFlowd({ label, channel }));
    if (!data) return;
    setLabel("");
    notify.success(`Invite saved for ${label.trim()}`, { description: channel === "link" ? "Send them your link. You earn only when their money clears." : "Share your code. You earn only when their money clears." });
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
      <Field label="Who are you inviting?" hint="A name or handle, so you can find them in the list." error={error}>
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Sam from my crew" autoComplete="off" maxLength={40} />
      </Field>
      <div className="grid gap-2">
        <span className="text-caption font-semibold text-fg-muted">How you will send it</span>
        <SegmentedControl<Channel> aria-label="Invite channel" size="sm" value={channel} onValueChange={setChannel} options={[{ value: "link", label: "Link" }, { value: "code", label: "Code" }]} />
      </div>
      <div>
        <Button type="submit" variant="primary" leadingIcon={<Send />} loading={busy === "invite"}>
          Save invite
        </Button>
      </div>
    </form>
  );
}
