import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandShell } from "@/components/shell/brand-shell";
import { RoleGate } from "@/components/shell/role-gate";
import { getServerRole } from "@/lib/session/server";

export const metadata: Metadata = {
  title: { default: "Brand dashboard", template: "%s · flowd for Brands" },
  description: "Fund bounties, review videos and read the install to paid funnel. Money follows what works.",
  robots: { index: false, follow: false },
};

/**
 * The brand dashboard. The server reads the role cookie so the shell renders without a flash for a signed-in brand; `RoleGate` is the guard: a
 * signed-out visitor is sent to `/login?next=<this page>`, and the wrong persona gets a friendly "switch persona" screen instead of a bounce.
 */
export default async function BrandLayout({ children }: { children: ReactNode }) {
  const role = await getServerRole();
  return (
    <RoleGate allow="brand_member" initialRole={role}>
      <BrandShell>{children}</BrandShell>
    </RoleGate>
  );
}
