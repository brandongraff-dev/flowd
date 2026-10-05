import { describe, expect, it } from "vitest";
import { CONSTANTS } from "@/lib/engine";
import { DEMO_IDS, DEMO_NOW, DEMO_NOW_MS, DEMO_TODAY, links, SITE } from "./constants";

describe("demo clock constants", () => {
  it("pin the demo world's now to the engine's and keep the three forms consistent", () => {
    expect(DEMO_NOW).toBe(CONSTANTS.now);
    expect(DEMO_NOW).toBe("2026-10-03T14:00:00Z");
    expect(DEMO_NOW_MS).toBe(Date.parse(DEMO_NOW));
    expect(DEMO_NOW.startsWith(DEMO_TODAY)).toBe(true);
  });
});

describe("brand and domain facts", () => {
  it("use only the owned domain", () => {
    const text = JSON.stringify(SITE) + JSON.stringify(Object.values(links).map((fn) => fn("x")));
    expect(text).toContain("joinflowd.io");
    expect(text).not.toMatch(/flowd\.(so|com|app)/);
    expect(SITE.name).toBe("flowd");
    expect(SITE.tagline).toBe("Money follows what works.");
  });

  it("build the public links the spec lists", () => {
    expect(links.creator("@maya.makes")).toBe("joinflowd.io/c/maya.makes");
    expect(links.proof("proof_8f3a")).toBe("joinflowd.io/p/proof_8f3a");
    expect(links.tracking("MAYA6")).toBe("joinflowd.io/r/MAYA6");
    expect(links.bounty("bnty_lumi_1")).toBe("joinflowd.io/b/bnty_lumi_1");
    expect(links.scorecard("br_lumi")).toBe("joinflowd.io/scorecard/br_lumi");
  });

  it("match the persona ids in the fixtures' world", async () => {
    const world = (await import("@/data/fixtures/world.json")).default as { personas: { creator: { user_id: string; creator_id: string; handle: string }; brand: { user_id: string; brand_id: string; app_id: string }; admin: { user_id: string } } };
    expect(DEMO_IDS.creator).toMatchObject({ userId: world.personas.creator.user_id, creatorId: world.personas.creator.creator_id, handle: world.personas.creator.handle });
    expect(DEMO_IDS.brand).toMatchObject({ userId: world.personas.brand.user_id, brandId: world.personas.brand.brand_id, appId: world.personas.brand.app_id });
    expect(DEMO_IDS.admin.userId).toBe(world.personas.admin.user_id);
  });
});
