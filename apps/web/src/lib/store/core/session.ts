/**
 * The workspace switcher: a brand member looks at one app at a time, and an agency can switch between its client brands. The choice lives in the
 * session (and is saved with the demo), so every selector that reads "the current brand" follows it.
 */

import type { Session } from "../state";
import { requireBrand } from "./guards";
import { ensure, type Tx } from "./tx";

/** Switches the active brand (for an agency, one of its clients) and/or app. Choosing a brand picks its first connected app unless one is named. */
export function switchWorkspace(tx: Tx, input: { brand_id?: string; app_id?: string }): { session: Session } {
  const s = tx.session;
  ensure(s.persona === "brand", "forbidden", "Only a brand team has a workspace to switch.", "Switch to the brand persona.", 403);
  const wanted = input.brand_id ?? (input.app_id ? tx.must("apps", input.app_id, "App").brand_id : s.brand_id);
  const { brand } = requireBrand(tx, wanted, "view");
  let appId: string | null = s.brand_id === brand.id ? s.app_id : null;
  if (input.app_id) {
    const app = tx.must("apps", input.app_id, "App");
    ensure(app.brand_id === brand.id, "wrong_brand", "That app belongs to another workspace.", undefined, 403);
    appId = app.id;
  } else if (!appId || tx.get("apps", appId)?.brand_id !== brand.id) {
    const apps = tx.all("apps").filter((a) => a.brand_id === brand.id);
    appId = (apps.find((a) => a.status === "connected") ?? apps[0])?.id ?? null;
  }
  const next: Session = { ...s, brand_id: brand.id, app_id: appId };
  tx.setSession(next);
  return { session: next };
}
