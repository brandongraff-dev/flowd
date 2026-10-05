import { redirect } from "next/navigation";
import { noindexMetadata } from "@/lib/seo";
import { postLoginTarget } from "@/lib/session";
import { getServerRole } from "@/lib/session/server";
import { getPersonaArt } from "@/components/features/auth/auth-data";
import { LoginView } from "@/components/features/auth/login-view";

export const metadata = noindexMetadata("Sign in", "Pick a demo persona: Jordan at Lumi (brand), Maya (creator) or Sam (admin).", "/login");

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * `/login`: the demo persona picker. A signed-in visitor goes straight to their home (or to `?next=` when it is theirs), unless they opened
 * the picker on purpose with `?switch=1` (the account menu's "switch persona" link), which shows it with a note about who they are now.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = first(params.next);
  const role = await getServerRole();
  const switching = first(params.switch) === "1";
  if (role && !switching) redirect(postLoginTarget(role, next));
  return <LoginView next={next} signedInAs={role && switching ? role : null} art={await getPersonaArt()} />;
}
