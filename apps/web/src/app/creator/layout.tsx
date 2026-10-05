import type { ReactNode } from "react";
import { CreatorShell } from "@/components/shell/creator-shell";
import { RoleGate } from "@/components/shell/role-gate";
import { requireRole } from "@/lib/session/server";

/**
 * The creator web portal. The server checks the `creator` role (a wrong or missing role goes to `/login`), the client gate covers a persona
 * switched in another tab, and the shell owns the nav, the wallet chip, the palette and the demo strip for every page below.
 */
export default async function CreatorLayout({ children }: { children: ReactNode }) {
  const role = await requireRole("creator");
  return (
    <RoleGate allow="creator" initialRole={role}>
      <CreatorShell>{children}</CreatorShell>
    </RoleGate>
  );
}
