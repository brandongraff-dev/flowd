"use client";

import { Fragment } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface Shortcut {
  keys: readonly string[];
  /** "or" between alternatives, "then" for a sequence. Default: all keys at once. */
  join?: "or" | "plus";
  label: string;
}

interface Group {
  title: string;
  items: readonly Shortcut[];
}

const QUEUE: readonly Group[] = [
  {
    title: "Move",
    items: [
      { keys: ["J", "K"], join: "or", label: "Next or previous video" },
      { keys: ["]", "["], join: "or", label: "Jump to the next or previous group" },
      { keys: ["Enter"], label: "Open focus mode" },
      { keys: ["/"], label: "Search" },
    ],
  },
  {
    title: "Decide",
    items: [
      { keys: ["A"], label: "Approve" },
      { keys: ["F"], label: "Request changes (needs a timecoded note)" },
      { keys: ["R"], label: "Reject (needs a reason and evidence)" },
      { keys: ["Z"], label: "Undo, for 10 seconds after any decision" },
    ],
  },
  {
    title: "Select",
    items: [
      { keys: ["V"], label: "Select or deselect this video" },
      { keys: ["Shift", "A"], join: "plus", label: "Approve what you selected, or every video that passes all checks" },
      { keys: ["S"], label: "Snooze: hide it here (the 72-hour clock keeps running)" },
      { keys: ["Esc"], label: "Clear the selection" },
    ],
  },
  {
    title: "Preview",
    items: [
      { keys: ["Space"], label: "Play or pause" },
      { keys: [",", "."], join: "or", label: "Back or forward one frame" },
      { keys: ["T"], label: "Captions on or off" },
      { keys: ["?"], label: "This list" },
    ],
  },
];

const FOCUS: readonly Group[] = [
  {
    title: "Player",
    items: [
      { keys: ["Space"], label: "Play or pause" },
      { keys: ["J", "K", "L"], join: "or", label: "Back 5 seconds, pause, forward 5 seconds" },
      { keys: [",", "."], join: "or", label: "Back or forward one frame" },
      { keys: ["1", "2"], join: "or", label: "Speed 1× or 2×" },
      { keys: ["T"], label: "Captions on or off" },
    ],
  },
  {
    title: "Notes",
    items: [
      { keys: ["C"], label: "Pause and write a note at this frame" },
      { keys: ["I", "O"], join: "or", label: "Set the start or end of a span" },
    ],
  },
  {
    title: "Decide",
    items: [
      { keys: ["A"], label: "Approve" },
      { keys: ["F"], label: "Request changes" },
      { keys: ["R"], label: "Reject" },
      { keys: ["Z"], label: "Undo, for 10 seconds" },
      { keys: ["]", "["], join: "or", label: "Next or previous video in the queue" },
      { keys: ["Esc"], label: "Back to the queue" },
    ],
  },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which screen's keys to list. */
  screen: "queue" | "focus";
}

/** The keyboard sheet (`?`). Both review screens share one vocabulary so the hands learn it once. */
export function ShortcutsDialog({ open, onOpenChange, screen }: ShortcutsDialogProps) {
  const groups = screen === "queue" ? QUEUE : FOCUS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" instant>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>{screen === "queue" ? "The review queue is built to be run from the keyboard. Nothing here animates, so it keeps up with you." : "Focus mode shares its decision keys with the queue."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6 pb-6 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} aria-labelledby={`sc-${group.title}`} className="grid content-start gap-2.5">
              <h3 id={`sc-${group.title}`} className="fd-eyebrow text-fg-subtle">
                {group.title}
              </h3>
              <ul className="grid gap-2.5">
                {group.items.map((item) => (
                  <li key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
                    <span className="inline-flex min-w-[4.5rem] items-center gap-1">
                      {item.keys.map((key, index) => (
                        <Fragment key={key}>
                          {index > 0 ? <span className="text-micro text-fg-subtle">{item.join === "plus" ? "+" : "/"}</span> : null}
                          <Kbd>{key}</Kbd>
                        </Fragment>
                      ))}
                    </span>
                    <span className="text-body-sm text-fg-muted">{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
