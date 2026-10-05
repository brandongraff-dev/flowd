"use client";

import { useState, type ReactNode } from "react";
import { Bookmark, Plus, Star } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  notify,
} from "@/components/ui";
import { useLists } from "@/lib/data";
import { actions } from "@/lib/store";
import { settle } from "./report";

/** A small dialog that names and creates a CRM list. `onCreated` receives the new list's id. */
export function NewListDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (listId: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.createList({ name });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message);
      return;
    }
    notify.success(`Created "${result.data.list.name}"`);
    setName("");
    onOpenChange(false);
    onCreated?.(result.data.list.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New list</DialogTitle>
            <DialogDescription>Lists keep creators you want to work with again. Add notes and tags to each one.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="List name" error={error} hint="For example: Hook specialists, Fast turnaround, Fitness niche.">
              <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus maxLength={40} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Create list
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Add to list": every list as a checkbox row (a creator can sit on several), plus a new-list shortcut. Toggling is immediate and
 * reversible, so there is no confirm dialog; the menu stays open so several lists can be set in one visit.
 */
export function AddToListMenu({ creatorId, handle, trigger }: { creatorId: string; handle: string; trigger?: ReactNode }) {
  const lists = useLists();
  const [creating, setCreating] = useState(false);

  const toggle = async (listId: string, listName: string, member: boolean): Promise<void> => {
    if (member) {
      await settle(actions.removeFromList({ list_id: listId, creator_id: creatorId }), `Removed @${handle} from ${listName}`);
    } else {
      await settle(actions.addToList({ creator_id: creatorId, list_id: listId }), `Added @${handle} to ${listName}`);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="secondary" size="sm" leadingIcon={<Bookmark />}>
              Add to list
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel>Lists for @{handle}</DropdownMenuLabel>
          {lists.length === 0 ? <p className="px-3 py-2 text-caption text-fg-subtle">No lists yet. Create the first one.</p> : null}
          {lists.map((list) => {
            const member = list.members.some((entry) => entry.creator_id === creatorId);
            return (
              <DropdownMenuCheckboxItem
                key={list.id}
                checked={member}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => void toggle(list.id, list.name, member)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {list.is_favourites ? <Star aria-hidden="true" className="size-3.5 shrink-0 text-sun" strokeWidth={2} /> : null}
                  <span className="truncate">{list.name}</span>
                  <span className="ml-auto text-caption text-fg-subtle tabular-nums">{list.members.length}</span>
                </span>
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Plus />} onSelect={() => setCreating(true)}>
            New list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewListDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(listId) => {
          void settle(actions.addToList({ creator_id: creatorId, list_id: listId }), `Added @${handle}`);
        }}
      />
    </>
  );
}
