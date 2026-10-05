"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, ListPlus, NotebookPen, Plus, Send, Star, Trash2, UserRound, X } from "lucide-react";
import { ArtAvatar, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DataTable, PageHeader, type DataColumn } from "@/components/shell";
import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Textarea,
  buttonVariants,
  notify,
} from "@/components/ui";
import { useCreatorDirectory, useLists, useMe, useStoreReady } from "@/lib/data";
import type { ListView } from "@/lib/data/selectors/creators";
import type { CreatorCard as CreatorCardRow } from "@/lib/data/selectors/creators";
import { formatDate, formatMoney, formatPct, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { NewListDialog } from "./add-to-list";
import { costPerTrialText } from "./creator-bits";
import { offerTargetOf } from "./creator-card";
import { OfferSheet, type OfferKindChoice, type OfferTarget } from "./offer-sheet";
import { settle } from "./report";
import { CardGridSkeleton } from "./route-states";
import { useQueryParams } from "./use-query-state";

const PARAMS = { list: "", tag: "" } as const;

interface Entry {
  creator: ListView["creators"][number]["creator"];
  note?: string;
  tags: readonly string[];
  added_at: string;
  card?: CreatorCardRow;
}

/** CSV with quoted cells. Money is written as plain dollars so a spreadsheet can sum it. */
function toCsv(rows: readonly Entry[]): string {
  const cell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
  const plain = (cents: number | null | undefined): string => (cents === null || cents === undefined ? "" : formatMoney(cents).replace(/[$,]/g, ""));
  const header = ["handle", "name", "tier", "reliability", "approval_rate", "price_per_video_usd", "cost_per_trial_usd_on_our_apps", "tags", "note", "added"];
  const lines = rows.map((row) =>
    [
      row.creator.handle,
      row.creator.display_name,
      row.creator.tier,
      row.card?.reliability ? (row.card.reliability.kind === "verdict" ? row.card.reliability.score : `${row.card.reliability.low}-${row.card.reliability.high}`) : "",
      row.creator.decided_count > 0 ? row.creator.approval_rate : "",
      plain(row.card?.rate_card?.accepts_direct_offers ? row.card.rate_card.price_per_video_cents : null),
      plain(row.card?.on_my_apps.cost_per_trial_cents),
      row.tags.join("; "),
      row.note ?? "",
      row.added_at.slice(0, 10),
    ]
      .map(cell)
      .join(","),
  );
  return [header.map(cell).join(","), ...lines].join("\r\n");
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Edit the note and tags of one saved creator. Tags are free words; existing ones are offered as one-tap suggestions. */
function MemberEditor({ entry, list, knownTags, onClose }: { entry: Entry; list: ListView; knownTags: readonly string[]; onClose: () => void }) {
  const [note, setNote] = useState(entry.note ?? "");
  const [tags, setTags] = useState<readonly string[]>(entry.tags);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addTag = (raw: string): void => {
    const next = raw.trim().replace(/^#/, "").toLowerCase().slice(0, 24);
    if (next && !tags.includes(next) && tags.length < 6) setTags([...tags, next]);
    setDraft("");
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    const pending = draft.trim().replace(/^#/, "").toLowerCase().slice(0, 24);
    const finalTags = pending && !tags.includes(pending) && tags.length < 6 ? [...tags, pending] : tags;
    const result = await settle(actions.addToList({ creator_id: entry.creator.id, list_id: list.id, note: note.trim(), tags: [...finalTags] }), `Saved notes on @${entry.creator.handle}`);
    setBusy(false);
    if (result.ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent size="md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Notes on @{entry.creator.handle}</DialogTitle>
            <DialogDescription>Only your team sees these. Use them to remember what worked and when to rebook.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-5">
            <Field label="Note" hint="For example: great at screen-recorded demos, slow on weekends.">
              <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} maxLength={280} showCount />
            </Field>
            <div className="grid gap-2.5">
              <Field label="Tags" hint="Press Enter to add. Up to six.">
                <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(draft); } }} placeholder="rebook, hooks, fast turnaround" autoComplete="off" />
              </Field>
              {tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Tags">
                  {tags.map((tag) => (
                    <li key={tag}>
                      <Badge size="md" tone="accent" className="gap-1 pr-1">
                        {tag}
                        <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((entry) => entry !== tag))} className="grid size-4 place-items-center rounded-full hover:bg-surface-active">
                          <X aria-hidden="true" className="size-3" strokeWidth={2.25} />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {knownTags.filter((tag) => !tags.includes(tag)).length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                  Used before:
                  {knownTags
                    .filter((tag) => !tags.includes(tag))
                    .slice(0, 6)
                    .map((tag) => (
                      <Chip key={tag} size="sm" onClick={() => addTag(tag)}>
                        {tag}
                      </Chip>
                    ))}
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save notes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** CRM lists: where a brand keeps the creators it wants to work with again, with notes, tags, bulk offers and export. */
export function ListsView() {
  const ready = useStoreReady();
  const me = useMe();
  const lists = useLists();
  const { values, set } = useQueryParams(PARAMS);
  const current = lists.find((list) => list.id === values.list) ?? lists[0];
  const directory = useCreatorDirectory(current ? { list: current.id, sort: "reliability" } : { list: "none" });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [newList, setNewList] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [removing, setRemoving] = useState<readonly Entry[] | null>(null);
  const [composer, setComposer] = useState<{ targets: readonly OfferTarget[]; kind: OfferKindChoice } | null>(null);

  const cards = useMemo(() => new Map(directory.items.map((row) => [row.creator.id, row])), [directory.items]);
  const entries: readonly Entry[] = useMemo(() => (current ? current.creators.map((member) => ({ ...member, ...(cards.get(member.creator.id) ? { card: cards.get(member.creator.id) } : {}) })) : []), [current, cards]);
  const allTags = useMemo(() => [...new Set(lists.flatMap((list) => list.creators.flatMap((member) => member.tags)))].sort(), [lists]);
  const tagsHere = useMemo(() => [...new Set(entries.flatMap((entry) => entry.tags))].sort(), [entries]);
  const tag = tagsHere.includes(values.tag) ? values.tag : "";
  const shown = entries.filter((entry) => (!tag || entry.tags.includes(tag)) && (!q.trim() || `${entry.creator.handle} ${entry.creator.display_name} ${entry.note ?? ""} ${entry.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const selectedEntries = shown.filter((entry) => selected.has(entry.creator.id));

  const pick = (list: ListView): void => {
    set({ list: list.id === lists[0]?.id ? null : list.id, tag: null });
    setSelected(new Set());
    setQ("");
  };

  const targetsOf = (rows: readonly Entry[]): OfferTarget[] => rows.map((entry) => (entry.card ? offerTargetOf(entry.card) : { id: entry.creator.id, handle: entry.creator.handle, display_name: entry.creator.display_name, avatar: entry.creator.avatar, tier: entry.creator.tier, open_to_offers: entry.creator.open_to_offers }));

  const exportCsv = async (rows: readonly Entry[]): Promise<void> => {
    if (!current) return;
    download(`${me.brand?.slug ?? "flowd"}-${current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, toCsv(rows));
    await actions.recordExport({ what: `Creator list: ${current.name}`, target_kind: "brand_list", target_id: current.id });
    notify.success(`Exported ${pluralise(rows.length, "creator")}`, { description: "The export is recorded in your activity log." });
  };

  const columns: DataColumn<Entry>[] = [
    {
      id: "creator",
      header: "Creator",
      card: "title",
      minWidth: "13rem",
      sticky: true,
      sortValue: (row) => row.creator.handle,
      cell: (row) => (
        <Link href={`/brand/creators/${row.creator.handle}`} className="flex items-center gap-3 rounded-md hover:underline">
          <ArtAvatar art={row.creator.avatar} name={row.creator.display_name} size={32} decorative />
          <span className="grid min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-fg">@{row.creator.handle}</span>
              <TierBadge tier={row.creator.tier} size={20} decorative />
            </span>
            <span className="truncate text-caption text-fg-subtle">{row.creator.display_name}</span>
          </span>
        </Link>
      ),
    },
    {
      id: "notes",
      header: "Note and tags",
      card: "subtitle",
      minWidth: "15rem",
      wrap: true,
      cell: (row) => (
        <span className="grid gap-1.5">
          {row.note ? <span className="line-clamp-2 text-fg-muted">{row.note}</span> : <span className="text-fg-subtle">No note yet</span>}
          {row.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {row.tags.map((entry) => (
                <Badge key={entry} size="sm" tone="neutral">
                  {entry}
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "record",
      header: "Track record",
      align: "end",
      hideBelow: "lg",
      width: "7.5rem",
      sortValue: (row) => (row.card?.reliability?.kind === "verdict" ? row.card.reliability.score : null),
      cell: (row) => (
        <span className="grid justify-items-end leading-tight">
          <span className="font-semibold text-fg">{row.card?.reliability ? (row.card.reliability.kind === "verdict" ? row.card.reliability.score : `${row.card.reliability.low} to ${row.card.reliability.high}`) : "None yet"}</span>
          <span className="text-micro font-normal text-fg-subtle">{row.creator.decided_count > 0 ? `${formatPct(row.creator.approval_rate, 0)} approved` : "no decisions"}</span>
        </span>
      ),
    },
    {
      id: "cpt",
      header: "Cost per trial",
      label: "Cost per trial on your apps",
      align: "end",
      hideBelow: "xl",
      sortValue: (row) => row.card?.on_my_apps.cost_per_trial_cents ?? null,
      cell: (row) => <span className={row.card?.on_my_apps.cost_per_trial_cents ? "text-fg" : "text-fg-subtle"}>{row.card?.on_my_apps.cost_per_trial_cents ? formatMoney(row.card.on_my_apps.cost_per_trial_cents) : costPerTrialText(null)}</span>,
    },
    {
      id: "price",
      header: "Price",
      label: "Price per video",
      align: "end",
      hideBelow: "xl",
      sortValue: (row) => (row.card?.rate_card?.accepts_direct_offers ? row.card.rate_card.price_per_video_cents : null),
      cell: (row) => (row.card?.rate_card?.accepts_direct_offers ? formatMoney(row.card.rate_card.price_per_video_cents, { cents: "never" }) : <span className="text-fg-subtle">No offers</span>),
    },
  ];

  const removeEntries = async (rows: readonly Entry[]): Promise<void> => {
    if (!current) return;
    const results = await Promise.all(rows.map((entry) => actions.removeFromList({ list_id: current.id, creator_id: entry.creator.id })));
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) {
      notify.error(failed.error.message, failed.error.hint ? { description: failed.error.hint } : undefined);
      return;
    }
    setSelected(new Set());
    notify.undo(`Removed ${pluralise(rows.length, "creator")} from ${current.name}`, {
      onUndo: () => {
        for (const entry of rows) void actions.addToList({ creator_id: entry.creator.id, list_id: current.id, ...(entry.note ? { note: entry.note } : {}), tags: [...entry.tags] });
      },
    });
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Creator lists"
        description="Your CRM for creators: favourites, rebook candidates and test pools, with notes only your team sees."
        actions={
          <>
            <Link href="/brand/creators" className={buttonVariants({ variant: "secondary" })}>
              <UserRound aria-hidden="true" />
              Discover creators
            </Link>
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => setNewList(true)}>
              New list
            </Button>
          </>
        }
      />

      {!ready ? (
        <CardGridSkeleton count={3} label="Loading lists" />
      ) : lists.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="inbox"
            title="No lists yet"
            description="Save creators you want to work with again. Add notes and tags, then offer them work in bulk."
            action={
              <Button variant="primary" leadingIcon={<ListPlus />} onClick={() => setNewList(true)}>
                Create a list
              </Button>
            }
            secondaryAction={
              <Link href="/brand/creators" className={buttonVariants({ variant: "ghost" })}>
                Discover creators
              </Link>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Your lists" className="grid gap-2 lg:sticky lg:top-24">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
              {lists.map((list) => {
                const active = current?.id === list.id;
                return (
                  <li key={list.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => pick(list)}
                      className={cn(
                        "flex w-full min-w-40 items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors duration-(--fd-dur-fast) ease-standard",
                        active ? "bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "hover:bg-surface-hover",
                      )}
                    >
                      {list.is_favourites ? <Star aria-hidden="true" className="size-4 shrink-0 text-sun" strokeWidth={2} /> : <NotebookPen aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />}
                      <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg">{list.name}</span>
                      <span className="text-caption text-fg-subtle tabular-nums">{list.members.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label={current ? `${current.name} list` : "List"} className="grid min-w-0 gap-4">
            {current ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-0.5">
                    <h2 className="font-display text-title-lg text-fg">{current.name}</h2>
                    <p className="text-body-sm text-fg-muted">
                      {pluralise(entries.length, "creator")} · updated {formatDate(current.updated_at, "medium")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" leadingIcon={<Send />} disabled={entries.length === 0} onClick={() => setComposer({ targets: targetsOf(entries), kind: "direct" })}>
                      Offer to all
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<Download />}
                      disabled={entries.length === 0}
                      onClick={() => {
                        void exportCsv(entries);
                      }}
                    >
                      Export CSV
                    </Button>
                  </div>
                </div>

                <DataTable
                  caption={`Creators saved in ${current.name}`}
                  columns={columns}
                  rows={shown}
                  getRowId={(row) => row.creator.id}
                  getRowLabel={(row) => `@${row.creator.handle}`}
                  selectable
                  selected={selected}
                  onSelectedChange={setSelected}
                  stickyHeader={false}
                  defaultSort={{ id: "creator", direction: "asc" }}
                  toolbar={
                    <div className="flex flex-wrap items-center gap-3 p-3.5">
                      <SearchInput aria-label="Search this list" placeholder="Search notes, tags and handles" value={q} onValueChange={setQ} size="sm" containerClassName="min-w-56 flex-1 basis-64" />
                      {tagsHere.length > 0 ? (
                        <ChipGroup aria-label="Filter by tag">
                          {tagsHere.map((entry) => (
                            <Chip key={entry} size="sm" selected={tag === entry} onSelectedChange={(on) => set({ tag: on ? entry : null })}>
                              {entry}
                            </Chip>
                          ))}
                        </ChipGroup>
                      ) : null}
                    </div>
                  }
                  bulkActions={() => (
                    <>
                      <Button size="xs" variant="secondary" leadingIcon={<Send />} onClick={() => setComposer({ targets: targetsOf(selectedEntries), kind: "direct" })}>
                        Send offers
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => setComposer({ targets: targetsOf(selectedEntries), kind: "invite" })}>
                        Invite to bounty
                      </Button>
                      <Button
                        size="xs"
                        variant="plain"
                        leadingIcon={<Download />}
                        onClick={() => {
                          void exportCsv(selectedEntries);
                        }}
                      >
                        Export
                      </Button>
                      <Button size="xs" variant="danger" leadingIcon={<Trash2 />} onClick={() => setRemoving(selectedEntries)}>
                        Remove
                      </Button>
                    </>
                  )}
                  rowActions={(row) => [
                    { id: "notes", label: "Edit note and tags", icon: <NotebookPen />, onSelect: () => setEditing(row) },
                    { id: "offer", label: "Send offer", icon: <Send />, disabled: !row.card?.rate_card?.accepts_direct_offers || !row.creator.open_to_offers, onSelect: () => setComposer({ targets: targetsOf([row]), kind: "direct" }) },
                    { id: "remove", label: "Remove from list", icon: <Trash2 />, destructive: true, separated: true, onSelect: () => setRemoving([row]) },
                  ]}
                  empty={
                    entries.length === 0
                      ? {
                          art: "inbox",
                          title: `${current.name} is empty`,
                          description: "Find creators on Discover and add them with Add to list.",
                          action: (
                            <Link href="/brand/creators" className={buttonVariants({ variant: "primary" })}>
                              Discover creators
                            </Link>
                          ),
                        }
                      : { art: "search", title: "Nobody matches that", description: "Clear the search or the tag filter to see everyone on this list." }
                  }
                />
              </>
            ) : null}
          </section>
        </div>
      )}

      <NewListDialog open={newList} onOpenChange={setNewList} onCreated={(id) => set({ list: id, tag: null })} />
      {editing && current ? <MemberEditor key={editing.creator.id} entry={editing} list={current} knownTags={allTags} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing && removing.length === 1 ? `Remove @${removing[0]?.creator.handle}?` : `Remove ${removing?.length ?? 0} creators?`}
        description={current ? `They leave ${current.name}. Their notes and tags on this list go too. You can undo this for ten seconds.` : undefined}
        confirmLabel="Remove from list"
        tone="danger"
        onConfirm={async () => {
          if (removing) await removeEntries(removing);
        }}
      />
      <OfferSheet
        open={composer !== null}
        onOpenChange={(next) => {
          if (!next) setComposer(null);
        }}
        targets={composer?.targets ?? []}
        initialKind={composer?.kind ?? "direct"}
        onSent={() => setSelected(new Set())}
      />
    </div>
  );
}
