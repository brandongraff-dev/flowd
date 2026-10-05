"use client";

import { ShieldAlert } from "lucide-react";
import type { MessageView, ThreadView } from "@/lib/data/selectors";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

function Warning({ message }: { message: MessageView }) {
  return (
    <li className="mx-auto w-full max-w-[34rem]">
      <div className="flex items-start gap-3 rounded-xl bg-sun-soft p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_32%,transparent)]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-sun" />
        <div className="grid gap-0.5">
          <p className="text-body-sm font-semibold text-fg">Scam Shield</p>
          <p className="text-body-sm text-pretty text-fg-muted">{message.body}</p>
        </div>
      </div>
    </li>
  );
}

function System({ message }: { message: MessageView }) {
  return (
    <li className="mx-auto max-w-[34rem] text-center">
      <p className="rounded-pill bg-surface-hover px-3.5 py-1.5 text-caption text-pretty text-fg-muted">{message.body}</p>
    </li>
  );
}

function Bubble({ message, now }: { message: MessageView; now: number }) {
  const mine = message.mine;
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("grid max-w-[min(34rem,88%)] gap-1", mine ? "justify-items-end" : "justify-items-start")}>
        <p className="px-1 text-micro text-fg-subtle">
          {message.author_name} · {formatRelative(message.at, now)}
        </p>
        <p className={cn("rounded-2xl px-4 py-2.5 text-body-sm text-pretty", mine ? "rounded-br-md bg-accent-solid text-on-accent" : "rounded-bl-md bg-surface-active text-fg")}>{message.body}</p>
      </div>
    </li>
  );
}

/** The conversation, oldest first, with system notes centred and Scam Shield warnings sitting right under the message that tripped them. */
export function MessageList({ thread, now }: { thread: ThreadView; now: number }) {
  return (
    <ol aria-label={`Messages in ${thread.title}`} className="grid gap-3.5 px-1 py-2">
      {thread.messages.map((message) =>
        message.kind === "warning" ? <Warning key={message.id} message={message} /> : message.kind === "system" ? <System key={message.id} message={message} /> : <Bubble key={message.id} message={message} now={now} />,
      )}
    </ol>
  );
}
