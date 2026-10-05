"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Flag, Lock } from "lucide-react";
import { Avatar, Badge, Button, Callout } from "@/components/ui";
import { THREAD_KIND_META } from "@/lib/contract/types";
import type { ThreadView } from "@/lib/data/selectors";
import { actions } from "@/lib/store";
import { ReportSheet, type ReportTarget } from "../safety/report-sheet";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { OfferPanel } from "./offer-panel";

export interface ThreadPaneProps {
  thread: ThreadView;
  now: number;
  /** Phones show the list or the conversation, never both: this goes back. */
  onBack?: () => void;
}

/** The open conversation: header with what it is about, the offer (if any) with its Pay Math and Rights Card, the messages, the composer and a report button. */
export function ThreadPane({ thread, now, onBack }: ThreadPaneProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [reporting, setReporting] = useState(false);
  const count = thread.messages.length;
  const unread = thread.unread;
  const id = thread.id;

  // Opening a conversation reads it.
  useEffect(() => {
    if (unread > 0) void actions.markThreadRead({ thread_id: id });
  }, [id, unread]);

  // A conversation opens at the top when it is an offer (the offer is the point) and at the latest message otherwise; new messages scroll into view.
  const opened = useRef<string | null>(null);
  const seen = useRef(count);
  const hasOffer = thread.offer !== undefined;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (opened.current !== id) {
      opened.current = id;
      seen.current = count;
      el.scrollTop = hasOffer ? 0 : el.scrollHeight;
    } else if (count > seen.current) {
      seen.current = count;
      el.scrollTop = el.scrollHeight;
    }
  }, [id, count, hasOffer]);

  const target: ReportTarget = thread.offer
    ? { kind: "offer", id: thread.offer.id, label: `Offer from ${thread.offer.brand.name}: ${thread.offer.title}` }
    : { kind: "message", id: thread.id, label: `Conversation: ${thread.title}` };
  const closedOffer = thread.offer !== undefined && !thread.offer.open;
  const blocked = !thread.can_send ? "This brand is waiting for your reply before sending more. Answer when you are ready." : undefined;

  return (
    <section aria-label={`Conversation: ${thread.title}`} className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} leadingIcon={<ArrowLeft />} className="-ml-2 lg:hidden">
              Inbox
            </Button>
          ) : null}
          <Avatar name={thread.counterpart.name} size={44} shape={thread.counterpart.kind === "creator" ? "circle" : "square"} decorative />
          <div className="grid min-w-0 gap-0.5">
            <h2 className="truncate font-display text-title-sm text-fg">{thread.counterpart.name}</h2>
            <p className="flex flex-wrap items-center gap-1.5 text-caption text-fg-subtle">
              <Badge tone="neutral" size="sm">
                {THREAD_KIND_META[thread.kind].label}
              </Badge>
              <span className="truncate">{thread.title}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {thread.href ? (
            <Button asChild variant="ghost" size="sm" trailingIcon={<ExternalLink />}>
              <Link href={thread.href}>Open</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" leadingIcon={<Flag />} onClick={() => setReporting(true)}>
            Report
          </Button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 overflow-y-auto py-4 pr-1">
        <div className="grid gap-5">
          {thread.offer ? <OfferPanel key={thread.offer.id} offer={thread.offer} /> : null}
          {thread.rate_limited ? (
            <Callout tone="info" title="They are waiting for your reply">
              {thread.counterpart.name} has sent three messages in a row, which is the most a brand can send before you answer. This keeps your inbox calm. They can write again after you reply.
            </Callout>
          ) : null}
          {thread.has_warning ? (
            <Callout tone="sun" title="Scam Shield flagged a message here">
              Read the note under it. If someone asks you to pay, move to another app or open a new account, report it.
            </Callout>
          ) : null}
          <MessageList thread={thread} now={now} />
        </div>
      </div>

      <div className="grid gap-3 border-t border-divider pt-4">
        {closedOffer ? (
          <p className="inline-flex items-center gap-2 text-caption text-fg-subtle">
            <Lock aria-hidden="true" className="size-3.5" />
            This offer is closed. You can still message about it.
          </p>
        ) : null}
        <Composer threadId={thread.id} {...(blocked ? { blockedReason: blocked } : {})} />
      </div>

      <ReportSheet key={target.id} open={reporting} onOpenChange={setReporting} defaultTarget={target} defaultReason={thread.has_warning ? "off_platform_chat" : "pay_to_join"} />
    </section>
  );
}
