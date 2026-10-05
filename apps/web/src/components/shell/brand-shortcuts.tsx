"use client";

import { shortcutsForRole } from "@/lib/search/routes";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KbdShortcut } from "@/components/ui/kbd";

export interface BrandSequence {
  keys: readonly string[];
  href: string;
  label: string;
}

/**
 * The go-to sequences of the brand dashboard: the registry's own (Bounties, Review queue, Funnel, Market, Wallet) plus a few for the pages a brand
 * visits most. "g" then a letter, never while typing in a field.
 */
export function brandSequences(): readonly BrandSequence[] {
  const fromRegistry = shortcutsForRole("brand_member");
  const taken = new Set(fromRegistry.map((s) => s.keys.join(" ")));
  const extras: BrandSequence[] = [
    { keys: ["g", "o"], href: "/brand", label: "Overview" },
    { keys: ["g", "n"], href: "/brand/bounties/new", label: "Start a bounty" },
    { keys: ["g", "i"], href: "/brand/insights", label: "Money Map" },
  ].filter((s) => !taken.has(s.keys.join(" ")));
  return [...extras, ...fromRegistry];
}

export interface BrandShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The keyboard cheat sheet (opened with ? or from the palette). Keyboard-first is how a brand clears the review queue, so it is documented in the product. */
export function BrandShortcutsDialog({ open, onOpenChange }: BrandShortcutsDialogProps) {
  const sequences = brandSequences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" instant>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press g, then a letter, to jump to a page. Shortcuts pause while you type in a field.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6 pb-7">
          <ShortcutGroup
            title="Anywhere"
            rows={[
              { label: "Open the command palette", keys: ["mod", "K"] },
              { label: "Collapse or expand the sidebar", keys: ["["] },
              { label: "Show this list", keys: ["?"] },
            ]}
          />
          <ShortcutGroup title="Go to" rows={sequences.map((s) => ({ label: s.label, keys: s.keys }))} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroup({ title, rows }: { title: string; rows: readonly { label: string; keys: readonly string[] }[] }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="fd-eyebrow text-fg-subtle">{title}</h3>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex min-h-10 items-center justify-between gap-4 rounded-lg px-3 py-1.5 odd:bg-surface-field">
            <span className="text-body-sm text-fg">{row.label}</span>
            <span className="flex items-center gap-1.5 text-caption text-fg-subtle">
              <KbdShortcut keys={row.keys} size="sm" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
