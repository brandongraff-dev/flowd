"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Lock, SendHorizontal, TriangleAlert } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { actions } from "@/lib/store";
import { SCAM_WARNING_COPY, scamWarningFor } from "@/lib/store/core/scamshield";
import { useRun } from "../shared/run-action";

export interface ComposerProps {
  threadId: string;
  /** The person cannot write now (a closed offer, a rate limit). The reason replaces the box. */
  blockedReason?: string;
}

/**
 * Write in the conversation. Scam Shield reads the message as you type, and warns you before you send if it would take the
 * conversation out of flowd or ask for money, because that is the moment a scam works. Sending is Enter; a new line is Shift+Enter.
 */
export function Composer({ threadId, blockedReason }: ComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();
  const hintId = useId();
  const risk = scamWarningFor(text);

  const send = async (): Promise<void> => {
    if (text.trim().length === 0) {
      setError("Write a message first.");
      return;
    }
    setError(undefined);
    const data = await run("send", () => actions.sendThreadMessage({ thread_id: threadId, body: text }));
    if (data) setText("");
  };
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void send();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  if (blockedReason) {
    return <p className="rounded-xl bg-surface-field px-4 py-3 text-body-sm text-fg-muted">{blockedReason}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2.5" noValidate>
      <p className="flex items-center gap-2 text-caption text-fg-subtle">
        <Lock aria-hidden="true" className="size-3.5 shrink-0" />
        Keep it in flowd. Escrow, Rights Cards and our help only work here.
      </p>
      {risk ? (
        <p id={hintId} role="status" className="flex items-start gap-2 rounded-lg bg-sun-soft px-3 py-2 text-caption text-pretty text-fg">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sun" />
          {SCAM_WARNING_COPY[risk]}
        </p>
      ) : null}
      <div className="flex items-end gap-2.5">
        <div className="min-w-0 flex-1">
          <Textarea
            aria-label="Write a message"
            aria-describedby={risk ? hintId : undefined}
            aria-invalid={error ? true : undefined}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={2000}
            placeholder="Write a message"
            autoGrow
          />
        </div>
        <Button type="submit" variant="primary" leadingIcon={<SendHorizontal />} loading={busy === "send"} className="shrink-0">
          Send
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-rose">
          {error}
        </p>
      ) : null}
    </form>
  );
}
