"use client";

import { useState } from "react";
import { BadgeCheck, ChevronDown, CircleHelp, Filter, LogOut, Search, Settings, Share2, ShieldCheck, Target, Trash2, User, WalletMinimal } from "lucide-react";
import {
  Avatar,
  Button,
  Checkbox,
  CommandPalette,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Field,
  IconButton,
  Input,
  KbdShortcut,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  StatusPill,
  Tooltip,
  notify,
  type CommandGroupDef,
} from "@/components/ui";
import { Cols, Panel, Row, Section } from "./kit";

const PALETTE: readonly CommandGroupDef[] = [
  {
    heading: "Go to",
    items: [
      { id: "home", label: "Home", icon: <Target />, href: "/dev/design", shortcut: ["g", "h"], keywords: ["today", "daily drop"] },
      { id: "wallet", label: "Wallet", icon: <WalletMinimal />, hint: "Cleared $1,284.60", onSelect: () => notify.info("Opens the Wallet", { description: "Routes are wired by the creator portal." }), shortcut: ["g", "w"], keywords: ["money", "cash out", "payout"] },
      { id: "settings", label: "Settings", icon: <Settings />, keywords: ["preferences", "reduce glass"] },
    ],
  },
  {
    heading: "Bounties",
    items: [
      { id: "nap", label: "Nap Nest · Wind-down routine hook", icon: <Target />, hint: "$2.40 CPM", keywords: ["sleep"] },
      { id: "fern", label: "Fernlingo · Speak in 7 days", icon: <Target />, hint: "$2.00 CPM", keywords: ["language"] },
      { id: "loaf", label: "Loafly · Dough day diary", icon: <Target />, hint: "$1.80 CPM", keywords: ["bread", "baking"] },
    ],
  },
  {
    heading: "Actions",
    items: [
      { id: "cash", label: "Cash out", icon: <WalletMinimal />, keywords: ["withdraw", "instant"], onSelect: () => notify.success("Weekly payout is free", { description: "Instant cash-out costs 1.5%, shown before you confirm." }) },
      { id: "share", label: "Copy my short link", icon: <Share2 />, hint: "joinflowd.io/c/maya", onSelect: () => notify.success("Link copied") },
      { id: "help", label: "How does the Money Clock work?", icon: <CircleHelp /> },
    ],
  },
];

export function OverlaysSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [density, setDensity] = useState("comfortable");
  const [alerts, setAlerts] = useState(true);

  return (
    <Section
      id="overlays"
      eyebrow="Overlays"
      title="Floating layers: L2 for controls, L3 for everything that asks for attention."
      description="Popovers, menus and tooltips scale from their trigger, never from the centre. Modals stay centred. Everything traps and returns focus, closes on Escape, and keeps the page behind it still. The command palette opens instantly: it is a keyboard action."
    >
      <Cols n={3}>
        <Panel title="Tooltip" note="After the first one opens, neighbours appear instantly with no animation.">
          <Row>
            <Tooltip content="Search" shortcut={["mod", "K"]}>
              <IconButton label="Search" icon={<Search />} tooltip={false} />
            </Tooltip>
            <Tooltip content="Share your short link">
              <IconButton label="Share" icon={<Share2 />} tooltip={false} />
            </Tooltip>
            <Tooltip content="Filters">
              <IconButton label="Filters" icon={<Filter />} tooltip={false} />
            </Tooltip>
            <Tooltip content="Not available while verification is pending" side="bottom">
              <Button variant="secondary" aria-disabled="true">
                Cash out
              </Button>
            </Tooltip>
          </Row>
        </Panel>

        <Panel className="justify-items-start" title="Popover" note="Focus moves inside; Escape and outside click close it.">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" trailingIcon={<ChevronDown />}>
                Rights Card
              </Button>
            </PopoverTrigger>
            <PopoverContent width="lg" className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-title-sm text-fg">What you are licensing</p>
                <StatusPill status="verified" size="md" />
              </div>
              <ul className="grid gap-2 text-body-sm text-fg-muted">
                <li>Organic posting on your accounts is always included.</li>
                <li>Paid-ad usage defaults to 90 days, renewable at 25% of the base fee per 30 days.</li>
                <li>AI-likeness use is off unless you turn it on.</li>
              </ul>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-field p-3">
                <span className="text-caption text-fg-muted">Base fee for this bounty</span>
                <Money cents={18000} size="sm" decimals="auto" />
              </div>
            </PopoverContent>
          </Popover>
        </Panel>

        <Panel className="justify-items-start" title="Dropdown menu" note="Roving focus, type-ahead, sub-menus, check and radio items.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="md" leadingIcon={<Avatar name="Maya K" seed="cr_maya" size={24} decorative />} trailingIcon={<ChevronDown />}>
                maya.k
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Signed in as maya.k</DropdownMenuLabel>
              <DropdownMenuItem icon={<User />}>Profile</DropdownMenuItem>
              <DropdownMenuItem icon={<WalletMinimal />} shortcut={["g", "w"]}>
                Wallet
              </DropdownMenuItem>
              <DropdownMenuItem icon={<ShieldCheck />}>Rights Vault</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={alerts} onCheckedChange={setAlerts}>
                Payout alerts
              </DropdownMenuCheckboxItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Density</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                    <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<LogOut />}>Sign out</DropdownMenuItem>
              <DropdownMenuItem icon={<Trash2 />} destructive>
                Delete account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Panel>
      </Cols>

      <Cols n={3}>
        <Panel className="justify-items-start" title="Dialog (L3)" note="Centred, scrim behind, focus trapped. Opens from 0.96 in 240ms.">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">Fund a bounty</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fund this bounty</DialogTitle>
                <DialogDescription>Held in escrow until views clear. The bounty goes live the moment it is fully funded.</DialogDescription>
              </DialogHeader>
              <DialogBody className="grid gap-4">
                <Field label="Pool budget" hint="Platform fee waived on your first bounty, plus up to $500 matched.">
                  <Input inputMode="decimal" leading="$" defaultValue="5,000" />
                </Field>
                <Field label="Rate per 1,000 views">
                  <Select
                    defaultValue="240"
                    options={[
                      { value: "180", label: "$1.80", description: "Fills in about 9 days" },
                      { value: "240", label: "$2.40", description: "Suggested · fills in about 3 days" },
                      { value: "310", label: "$3.10", description: "Fills in about 1 day" },
                    ]}
                  />
                </Field>
                <Checkbox label="Creators must include #ad and my brand mention" defaultChecked />
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary" onClick={() => notify.success("Bounty is live", { description: "Funded with $5,000 in escrow." })}>
                    Fund $5,000
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Panel>

        <Panel className="justify-items-start" title="Confirm dialog" note="An alert dialog for irreversible actions only. Reversible ones get an undo toast.">
          <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirmOpen(true)}>
            Remove post
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Remove this post?"
            description="Views already delivered are still paid. The post disappears from your storefront and can't be restored."
            confirmLabel="Remove post"
            tone="danger"
            onConfirm={async () => {
              await new Promise((resolve) => setTimeout(resolve, 700));
              notify.success("Post removed");
            }}
          />
        </Panel>

        <Panel title="Command palette" note="⌘K / Ctrl+K anywhere on this page. Instant open: no animation on a keyboard action.">
          <Row>
            <Button variant="secondary" leadingIcon={<Search />} onClick={() => setPaletteOpen(true)}>
              Search or jump to…
              <KbdShortcut keys={["mod", "K"]} size="sm" className="ml-2" />
            </Button>
          </Row>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={PALETTE} />
        </Panel>
      </Cols>

      <Cols>
        <Panel className="justify-items-start" title="Sheet · side drawer" note="Right on desktop, bottom on a phone. Drag, flick or press Escape; it leaves the way it came.">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" leadingIcon={<Filter />}>
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filter bounties</SheetTitle>
                <SheetDescription>14 open bounties match. Typical creators earn $62 on these (median, 30 days).</SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-4">
                <Field label="Niche">
                  <Select options={[{ value: "sleep", label: "Sleep" }, { value: "language", label: "Language learning" }, { value: "ai", label: "AI tools" }]} placeholder="Any niche" />
                </Field>
                <Checkbox label="Funded only" description="Escrowed budgets, ready to pay." defaultChecked />
                <Checkbox label="Install and trial bonuses" />
                <Checkbox label="Starter bounties (first dollar in 72 hours)" />
                <Checkbox label="Under 10 spots left" />
              </SheetBody>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="ghost">Clear</Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button variant="primary">Show 14 bounties</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Panel>

        <Panel className="justify-items-start" title="Sheet · bottom, with drag-to-dismiss" note="Grab the handle or the title and pull down. A quick flick is enough; otherwise it springs back.">
          <Sheet side="bottom">
            <SheetTrigger asChild>
              <Button variant="secondary" leadingIcon={<BadgeCheck />}>
                Ready to post
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Ready to post</SheetTitle>
                <SheetDescription>Submit to Nap Nest. They decide by Fri 2:00 PM.</SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-3">
                <div className="rounded-xl bg-surface-field p-3.5 text-body-sm text-fg-muted">
                  “I did not expect a sleep app to fix my evenings…” <span className="font-semibold text-fg">#ad @napnest</span>
                </div>
                <Checkbox label="Link in bio set" defaultChecked />
                <Checkbox label="Code MAYA10 added" defaultChecked />
                <Checkbox label="Disclosure added (why)" defaultChecked disabled />
              </SheetBody>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="primary" onClick={() => notify.success("Submitted", { description: "Nap Nest decides by Fri 2:00 PM. We'll tell you the moment they do." })}>
                    Submit to Nap Nest
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Panel>
      </Cols>
    </Section>
  );
}
