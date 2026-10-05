"use client";

import { useState } from "react";
import { Check, Download, Link2, Minus, Trash2, UserPlus } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { DataTable, PageHeader, Pagination, Section, type DataColumn } from "@/components/shell";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  CopyField,
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
  RadioGroup,
  RadioGroupItem,
  SearchInput,
  Select,
  Skeleton,
  SkeletonGroup,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  notify,
} from "@/components/ui";
import { ACTIVITY_ACTION_META, BRAND_MEMBER_ROLE_META, type ActivityAction, type BrandMemberRole } from "@/lib/contract/types";
import { useActivityLog, useMe, useStoreReady, useTeam } from "@/lib/data";
import type { ActivityRow, MemberView } from "@/lib/data/selectors/workspace";
import { formatDate, formatDateTime, formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { csvCell, downloadText } from "./fmt";
import { settle } from "./report";
import { useQueryParams } from "./use-query-state";

type InviteRole = Exclude<BrandMemberRole, "owner">;
const PARAMS = { tab: "", act: "", who: "", from: "", to: "", q: "", page: "" } as const;
const PAGE_SIZE = 20;

const ROLE_COPY: Record<InviteRole, { label: string; text: string }> = {
  admin: { label: "Admin", text: "Everything except changing the owner. Manages the team, billing, integrations and the API." },
  reviewer: { label: "Reviewer", text: "Approves and rejects videos, and builds bounties, offers and lists. Cannot move money." },
  finance: { label: "Finance", text: "Funds the wallet, bids, licenses and sees billing. Cannot review videos." },
  viewer: { label: "Viewer", text: "Sees bounties, results and the wallet. Cannot change anything." },
  client_approver: { label: "Client approver", text: "Reviews videos through a private link, with no seat and no login. For agency clients." },
};

const CAPABILITIES = [
  { key: "view", label: "See bounties, results and the wallet" },
  { key: "review", label: "Approve and reject videos" },
  { key: "build", label: "Create bounties, offers and lists" },
  { key: "finance", label: "Fund, bid and license" },
  { key: "manage", label: "Manage team, integrations, API and settings" },
] as const;

function InviteDialog({ open, onOpenChange, initialRole }: { open: boolean; onOpenChange: (open: boolean) => void; initialRole: InviteRole }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<InviteRole>(initialRole);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const reset = (): void => {
    setEmail("");
    setName("");
    setRole(initialRole);
    setError(undefined);
    setLink(null);
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.inviteTeamMember({ email, ...(name.trim() ? { name: name.trim() } : {}), role });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message);
      return;
    }
    if (result.data.approval_link) setLink(result.data.approval_link);
    else {
      notify.success(`Invited ${email.trim()}`, { description: `${ROLE_COPY[role].label}. They get an email with a link to join.` });
      onOpenChange(false);
      reset();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent size="md">
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Approval link ready</DialogTitle>
              <DialogDescription>Send this private link to {name.trim() || email.trim()}. It opens their review queue with no login, and it uses no seat.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              <CopyField aria-label="Client approval link" value={link} label="Copy link" />
              <p className="text-caption text-fg-subtle">Anyone with the link can review. Remove the client approver from the team to turn it off.</p>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="primary"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
              <DialogDescription>Pick a role that fits the job. You can change it later.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Work email" error={error}>
                  <Input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@yourapp.com" autoComplete="off" autoFocus />
                </Field>
                <Field label="Name" optional>
                  <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
                </Field>
              </div>
              <div className="grid gap-2">
                <p id="role-label" className="text-body-sm font-medium text-fg">
                  Role
                </p>
                <RadioGroup aria-labelledby="role-label" value={role} onValueChange={(next) => setRole(next as InviteRole)} className="gap-2">
                  {(Object.keys(ROLE_COPY) as InviteRole[]).map((key) => (
                    <RadioGroupItem key={key} id={`role-${key}`} value={key} variant="card" label={ROLE_COPY[key].label} description={ROLE_COPY[key].text} />
                  ))}
                </RadioGroup>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {role === "client_approver" ? "Create approval link" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function People({ onInvite }: { onInvite: (role: InviteRole) => void }) {
  const team = useTeam();
  const [removing, setRemoving] = useState<MemberView | null>(null);
  const rows: readonly MemberView[] = [...team.members, ...team.invited];
  const approvers = rows.filter((member) => member.role === "client_approver");

  const changeRole = async (member: MemberView, role: InviteRole): Promise<void> => {
    const before = member.role as InviteRole;
    const result = await actions.changeMemberRole({ member_id: member.id, role });
    if (!result.ok) {
      notify.error(result.error.message, result.error.hint ? { description: result.error.hint } : undefined);
      return;
    }
    notify.undo(`${member.name} is now ${ROLE_COPY[role].label.toLowerCase()}`, {
      onUndo: () => {
        void actions.changeMemberRole({ member_id: member.id, role: before });
      },
    });
  };

  const columns: DataColumn<MemberView>[] = [
    {
      id: "member",
      header: "Member",
      card: "title",
      minWidth: "15rem",
      sticky: true,
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className="flex items-center gap-3">
          <Avatar name={row.name} seed={row.user_id} size={36} />
          <span className="grid min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-fg">{row.name}</span>
              {row.is_me ? (
                <Badge size="sm" tone="neutral" variant="outline">
                  You
                </Badge>
              ) : null}
            </span>
            <span className="truncate text-caption text-fg-subtle">{row.title ? `${row.title} · ${row.email}` : row.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "role",
      header: "Role",
      card: "subtitle",
      minWidth: "11rem",
      sortValue: (row) => row.role,
      cell: (row) =>
        team.can_manage && row.role !== "owner" && !row.is_me ? (
          <Select size="sm" aria-label={`Role for ${row.name}`} value={row.role} onValueChange={(next) => void changeRole(row, next as InviteRole)} options={(Object.keys(ROLE_COPY) as InviteRole[]).map((key) => ({ value: key, label: ROLE_COPY[key].label }))} />
        ) : (
          <Badge size="md" tone={BRAND_MEMBER_ROLE_META[row.role].tone}>
            {BRAND_MEMBER_ROLE_META[row.role].label}
          </Badge>
        ),
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "md",
      sortValue: (row) => row.status,
      cell: (row) =>
        row.status === "invited" ? (
          <Badge size="md" tone="info">
            Invited {formatRelative(row.joined_at)}
          </Badge>
        ) : (
          <span className="text-fg-muted">Active</span>
        ),
    },
    {
      id: "last",
      header: "Last active",
      align: "end",
      hideBelow: "lg",
      sortValue: (row) => row.last_active_at ?? "",
      cell: (row) => <span className="text-fg-muted">{row.last_active_at ? formatRelative(row.last_active_at) : "Not yet"}</span>,
    },
  ];

  return (
    <div className="grid gap-8">
      <Section
        title="People"
        description={team.seats_used ? `${pluralise(team.seats_used, "seat")} in use. Client approvers do not use a seat.` : undefined}
        actions={
          team.can_manage ? (
            <Button variant="primary" leadingIcon={<UserPlus />} onClick={() => onInvite("reviewer")}>
              Invite
            </Button>
          ) : undefined
        }
      >
        {!team.can_manage ? (
          <Callout tone="info" title="Only owners and admins can change the team">
            You can see everyone here. Ask an owner or admin to invite someone or change a role.
          </Callout>
        ) : null}
        <DataTable
          caption="Team members and pending invites"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          stickyHeader={false}
          rowActions={
            team.can_manage
              ? (row) =>
                  row.role === "owner" || row.is_me
                    ? []
                    : [{ id: "remove", label: row.status === "invited" ? "Cancel invite" : "Remove from team", icon: <Trash2 />, destructive: true, onSelect: () => setRemoving(row) }]
              : undefined
          }
          empty={{ art: "inbox", title: "Just you so far", description: "Invite a reviewer or someone from finance so the work does not wait on you." }}
        />
      </Section>

      <Section title="Client approval links" description="For agencies: a client reviews videos in a private link, with no login and no seat.">
        <GlassCard padding="md" className="grid gap-4">
          {approvers.length === 0 ? (
            <EmptyState
              size="sm"
              art="inbox"
              title="No client links yet"
              description="Add a client approver and flowd creates their private link."
              action={
                team.can_manage ? (
                  <Button variant="secondary" leadingIcon={<Link2 />} onClick={() => onInvite("client_approver")}>
                    Create a client link
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-3">
              {approvers.map((member) => (
                <li key={member.id} className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                  <span className="grid">
                    <span className="text-body-sm font-semibold text-fg">{member.name}</span>
                    <span className="text-caption text-fg-subtle">{member.status === "invited" ? "Invited" : "Active"}</span>
                  </span>
                  {member.approval_url ? <CopyField aria-label={`Approval link for ${member.name}`} value={member.approval_url} label="Copy link" /> : <span className="text-caption text-fg-subtle">No link yet</span>}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </Section>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `${removing.status === "invited" ? "Cancel the invite for" : "Remove"} ${removing.name}?` : "Remove?"}
        description="They lose access at once. Their past decisions stay in the activity log."
        confirmLabel={removing?.status === "invited" ? "Cancel invite" : "Remove from team"}
        tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          const result = await settle(actions.removeMember({ member_id: removing.id }), `${removing.name} removed`);
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </div>
  );
}

function RolesMatrix() {
  const team = useTeam();
  const me = useMe();
  return (
    <Section title="Roles" description="What each role can do. Owners and admins can do everything below. Your role is marked.">
      <GlassCard padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-body-sm">
          <caption className="sr-only">What each workspace role can do</caption>
          <thead>
            <tr>
              <th scope="col" className="px-5 py-4 text-caption font-medium text-fg-subtle">
                Can they
              </th>
              {team.matrix.map((column) => (
                <th key={column.role} scope="col" className="px-3 py-4 text-center">
                  <span className="grid justify-items-center gap-1">
                    <span className="font-semibold text-fg">{column.label}</span>
                    {me.member_role === column.role ? (
                      <Badge size="sm" tone="accent">
                        You
                      </Badge>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((capability) => (
              <tr key={capability.key}>
                <th scope="row" className="border-t border-divider px-5 py-3.5 text-left font-medium text-fg-muted">
                  {capability.label}
                </th>
                {team.matrix.map((column) => {
                  const yes = column.can[capability.key];
                  return (
                    <td key={column.role} className="border-t border-divider px-3 py-3.5 text-center">
                      {yes ? <Check aria-hidden="true" className="mx-auto size-5 text-fg" strokeWidth={2.25} /> : <Minus aria-hidden="true" className="mx-auto size-4 text-fg-disabled" strokeWidth={2} />}
                      <span className="sr-only">{yes ? "Yes" : "No"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </Section>
  );
}

function Activity() {
  const team = useTeam();
  const { values, set } = useQueryParams(PARAMS);
  const action = (Object.keys(ACTIVITY_ACTION_META) as ActivityAction[]).find((key) => key === values.act);
  const log = useActivityLog({ ...(action ? { action } : {}), ...(values.who ? { actor: values.who } : {}), ...(values.from ? { from: values.from } : {}), ...(values.to ? { to: values.to } : {}), ...(values.q.trim() ? { q: values.q.trim() } : {}) });
  const pageCount = Math.max(1, Math.ceil(log.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(values.page) || 1, 1), pageCount);
  const rows = log.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = Boolean(action || values.who || values.from || values.to || values.q);

  const exportCsv = async (): Promise<void> => {
    const header = ["time_utc", "who", "action", "summary"];
    const lines = log.map((row) => [row.at, row.actor_name, ACTIVITY_ACTION_META[row.action].label, row.summary].map(csvCell).join(","));
    downloadText("flowd-activity-log.csv", [header.map(csvCell).join(","), ...lines].join("\r\n"));
    await actions.recordExport({ what: `Team activity log (${log.length} rows)` });
    notify.success(`Exported ${pluralise(log.length, "row")}`, { description: "The export is itself recorded in this log." });
  };

  const columns: DataColumn<ActivityRow>[] = [
    { id: "when", header: "Time", card: "subtitle", cell: (row) => <span className="text-fg-muted tabular-nums">{formatDateTime(row.at)}</span> },
    { id: "who", header: "Who", hideBelow: "md", cell: (row) => <span className="font-medium text-fg">{row.actor_name}</span> },
    { id: "summary", header: "What happened", card: "title", wrap: true, minWidth: "20rem", cell: (row) => <span className="text-fg">{row.summary}</span> },
    { id: "action", header: "Type", align: "end", hideBelow: "lg", cell: (row) => <Badge size="md" tone="neutral">{ACTIVITY_ACTION_META[row.action].label}</Badge> },
  ];

  return (
    <Section
      title="Activity log"
      description="Who did what in this workspace. Exporting the log is logged too."
      actions={
        <Button variant="secondary" leadingIcon={<Download />} disabled={log.length === 0} onClick={() => void exportCsv()}>
          Export CSV
        </Button>
      }
    >
      <DataTable
        caption="Workspace activity log"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        stickyHeader={false}
        manualSort
        toolbar={
          <div className="grid gap-3 p-3.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_9.5rem_9.5rem]">
            <SearchInput aria-label="Search the log" placeholder="Search what happened" value={values.q} onValueChange={(next) => set({ q: next, page: null })} size="sm" />
            <Select size="sm" aria-label="Type" value={values.act || "all"} onValueChange={(next) => set({ act: next === "all" ? null : next, page: null })} options={[{ value: "all", label: "Every type" }, ...(Object.keys(ACTIVITY_ACTION_META) as ActivityAction[]).map((key) => ({ value: key, label: ACTIVITY_ACTION_META[key].label }))]} />
            <Select size="sm" aria-label="Person" value={values.who || "all"} onValueChange={(next) => set({ who: next === "all" ? null : next, page: null })} options={[{ value: "all", label: "Everyone" }, ...team.members.map((member) => ({ value: member.id, label: member.name }))]} />
            <Input type="date" size="sm" aria-label="From" value={values.from} onChange={(event) => set({ from: event.target.value, page: null })} />
            <Input type="date" size="sm" aria-label="To" value={values.to} onChange={(event) => set({ to: event.target.value, page: null })} />
          </div>
        }
        footer={
          <div className="border-t border-divider p-3.5">
            <Pagination page={page} pageCount={pageCount} onPageChange={(next) => set({ page: next === 1 ? null : String(next) })} total={log.length} pageSize={PAGE_SIZE} noun="events" />
          </div>
        }
        empty={{
          art: filtered ? "search" : "inbox",
          title: filtered ? "Nothing matches those filters" : "No activity yet",
          description: filtered ? "Clear a filter or widen the dates." : "Changes to bounties, money, the team and integrations are recorded here.",
          action: filtered ? (
            <Button variant="secondary" onClick={() => set({ act: null, who: null, from: null, to: null, q: null, page: null })}>
              Clear filters
            </Button>
          ) : undefined,
        }}
      />
      <p className={cn("text-caption text-fg-subtle", log.length === 0 && "hidden")}>Newest first. Times are UTC. Last event {log[0] ? formatDate(log[0].at, "medium") : ""}.</p>
    </Section>
  );
}

/** Team and activity: who is in the workspace and what they can do, client approval links, and a filterable, exportable activity log. */
export function TeamView() {
  const ready = useStoreReady();
  const { values, set } = useQueryParams(PARAMS);
  const [invite, setInvite] = useState<InviteRole | null>(null);
  const tab = values.tab === "roles" || values.tab === "activity" ? values.tab : "people";

  return (
    <Tabs value={tab} onValueChange={(next) => set({ tab: next === "people" ? null : next, page: null })} variant="underline" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Setup"
        title="Team and activity"
        description="Who can do what, and a record of what they did."
        tabs={
          <TabsList aria-label="Team sections">
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        }
      />
      {!ready ? (
        <SkeletonGroup label="Loading the team" className="grid gap-4">
          <Skeleton className="h-72" />
        </SkeletonGroup>
      ) : (
        <>
          <TabsContent value="people" className="mt-0">
            <People onInvite={setInvite} />
          </TabsContent>
          <TabsContent value="roles" className="mt-0">
            <RolesMatrix />
          </TabsContent>
          <TabsContent value="activity" className="mt-0">
            <Activity />
          </TabsContent>
        </>
      )}
      <InviteDialog key={invite ?? "closed"} open={invite !== null} onOpenChange={(open) => (open ? undefined : setInvite(null))} initialRole={invite ?? "reviewer"} />
    </Tabs>
  );
}
