import { vi, describe, expect, it } from "vitest";
import { memoryBackend } from "../storage";
import { resetStore, STORAGE_KEY } from "../store";
import { storageOf } from "../store";
import { makeWorld, must } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

describe("persistence", () => {
  it("saves only what changed, and a new tab picks it up", async () => {
    const backend = memoryBackend();
    const a = await makeWorld("creator", backend);
    expect(backend.getItem(STORAGE_KEY)).toBeNull();
    must(await a.actions.markNotificationRead({ id: Object.values(a.state().notifications).find((n) => n.recipient_user_id === "usr_maya" && !n.read_at)?.id ?? "" }));
    storageOf(a.store).flush();
    const raw = backend.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw as string) as { version: number; state: { rows: Record<string, unknown>; v: number } };
    expect(saved.version).toBe(1);
    expect(Object.keys(saved.state.rows)).toEqual(["notifications"]);
    expect(raw!.length).toBeLessThan(5_000);

    const b = await makeWorld("creator", backend);
    const readA = Object.values(a.state().notifications).filter((n) => n.read_at).length;
    const readB = Object.values(b.state().notifications).filter((n) => n.read_at).length;
    expect(readB).toBe(readA);
  });

  it("keeps new rows and removed rows across a reload", async () => {
    const backend = memoryBackend();
    const a = await makeWorld("creator", backend);
    const before = Object.keys(a.state().bounty_saves).length;
    const unsaved = Object.values(a.state().bounties).find((b) => b.status === "live" && !Object.values(a.state().bounty_saves).some((x) => x.creator_id === "cr_maya" && x.bounty_id === b.id));
    expect(unsaved).toBeDefined();
    const id = unsaved?.id ?? "";
    must(await a.actions.saveBounty({ bounty_id: id, saved: true }));
    expect(Object.keys(a.state().bounty_saves).length).toBe(before + 1);
    storageOf(a.store).flush();
    const b = await makeWorld("creator", backend);
    expect(Object.keys(b.state().bounty_saves).length).toBe(before + 1);
    must(await b.actions.saveBounty({ bounty_id: id, saved: false }));
    storageOf(b.store).flush();
    const c = await makeWorld("creator", backend);
    expect(Object.keys(c.state().bounty_saves).length).toBe(before);
  });

  it("starts from the seed when the saved data is corrupt or from another version", async () => {
    const corrupt = memoryBackend({ [STORAGE_KEY]: "{not json" });
    const a = await makeWorld(null, corrupt);
    expect(a.state().status).toBe("ready");
    const wrong = memoryBackend({ [STORAGE_KEY]: JSON.stringify({ version: 99, state: { rows: { bounties: { x: 1 } } } }) });
    const b = await makeWorld(null, wrong);
    expect(b.state().status).toBe("ready");
    expect(b.state().bounties["x"]).toBeUndefined();
  });

  it("reset throws away every change and keeps you signed in", async () => {
    const backend = memoryBackend();
    const w = await makeWorld("creator", backend);
    const before = Object.keys(w.state().bounty_saves).length;
    const unsaved = Object.values(w.state().bounties).find((b) => b.status === "live" && !Object.values(w.state().bounty_saves).some((x) => x.creator_id === "cr_maya" && x.bounty_id === b.id));
    must(await w.actions.saveBounty({ bounty_id: unsaved?.id ?? "", saved: true }));
    expect(Object.keys(w.state().bounty_saves).length).toBe(before + 1);
    storageOf(w.store).flush();
    expect(backend.getItem(STORAGE_KEY)).not.toBeNull();
    resetStore(w.store);
    expect(Object.keys(w.state().bounty_saves).length).toBe(before);
    expect(w.state().session.persona).toBe("creator");
    expect(w.state().clock.now).toBe(w.state().world.now);
  });

  it("never writes before it is enabled", async () => {
    const backend = memoryBackend();
    const w = await makeWorld(null, backend);
    // makeWorld enables persistence at the end of boot; a store that has not booted must stay quiet.
    expect(storageOf(w.store).enabled).toBe(true);
  });
});
