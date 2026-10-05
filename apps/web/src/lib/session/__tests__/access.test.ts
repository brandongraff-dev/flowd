import { describe, expect, it } from "vitest";
import {
  accessFor,
  gateDecision,
  gateTargets,
  homeFor,
  loginUrl,
  normalizePath,
  postLoginTarget,
  redirectFor,
  roleCanAccess,
  safeNextPath,
} from "../access";
import { DEMO_PERSONAS, PERSONA_LIST, personaForRole } from "../personas";
import { isPersonaKey, isRole, PERSONA_TO_ROLE, ROLE_TO_PERSONA } from "../constants";

describe("accessFor", () => {
  it("guards the three product areas and the creator onboarding", () => {
    expect(accessFor("/brand")).toBe("brand_member");
    expect(accessFor("/brand/bounties/bnty_x")).toBe("brand_member");
    expect(accessFor("/creator/wallet")).toBe("creator");
    expect(accessFor("/onboarding/creator")).toBe("creator");
    expect(accessFor("/admin/fraud/frd_1")).toBe("admin");
  });
  it("leaves everything else public", () => {
    for (const path of ["/", "/pricing", "/login", "/signup/brand", "/tools/hook-score", "/c/maya.makes", "/b/bnty_x", "/p/proof_1", "/verify"]) {
      expect(accessFor(path)).toBe("public");
    }
  });
  it("matches whole segments only", () => {
    expect(accessFor("/brandx")).toBe("public");
    expect(accessFor("/creators")).toBe("public"); // the marketing page, not /creator
    expect(accessFor("/administrator")).toBe("public");
  });
  it("ignores query, hash and trailing slashes", () => {
    expect(accessFor("/brand/?tab=live#x")).toBe("brand_member");
    expect(normalizePath("/creator/feed/")).toBe("/creator/feed");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("brand")).toBe("/brand");
  });
});

describe("roleCanAccess and homeFor", () => {
  it("lets a role into its own area only", () => {
    expect(roleCanAccess("brand_member", "/brand/review")).toBe(true);
    expect(roleCanAccess("creator", "/brand/review")).toBe(false);
    expect(roleCanAccess("admin", "/creator")).toBe(false);
    expect(roleCanAccess(null, "/admin")).toBe(false);
  });
  it("lets everyone into public routes, signed in or not", () => {
    expect(roleCanAccess(null, "/pricing")).toBe(true);
    expect(roleCanAccess("creator", "/pricing")).toBe(true);
  });
  it("knows each home", () => {
    expect(homeFor("brand_member")).toBe("/brand");
    expect(homeFor("creator")).toBe("/creator");
    expect(homeFor("admin")).toBe("/admin");
  });
});

describe("safeNextPath", () => {
  it("accepts same-origin absolute paths", () => {
    expect(safeNextPath("/brand/review")).toBe("/brand/review");
    expect(safeNextPath("%2Fbrand%2Freview%3Ftab%3Dlive")).toBe("/brand/review?tab=live");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/javascript:alert(1)", "evil", "/a\u0000b", "%E0%A4%A", "/" + "a".repeat(600)]) {
      expect(safeNextPath(bad, "/safe")).toBe("/safe");
    }
  });
  it("uses the fallback for nothing", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null, "/creator")).toBe("/creator");
    expect(safeNextPath("")).toBe("/");
  });
});

describe("loginUrl and redirects", () => {
  it("builds /login with an encoded next", () => {
    expect(loginUrl("/brand/review?tab=live")).toBe("/login?next=%2Fbrand%2Freview%3Ftab%3Dlive");
    expect(loginUrl()).toBe("/login");
    expect(loginUrl("https://evil.example")).toBe("/login");
    expect(loginUrl("/login")).toBe("/login");
  });
  it("sends a wrong or missing role to /login with next", () => {
    expect(redirectFor({ role: null, pathname: "/brand/review" })).toBe("/login?next=%2Fbrand%2Freview");
    expect(redirectFor({ role: "creator", pathname: "/brand/review", search: "?tab=live" })).toBe("/login?next=%2Fbrand%2Freview%3Ftab%3Dlive");
    expect(redirectFor({ role: "creator", pathname: "/admin", search: "x=1" })).toBe("/login?next=%2Fadmin%3Fx%3D1");
  });
  it("lets the right role and public routes through", () => {
    expect(redirectFor({ role: "brand_member", pathname: "/brand/review" })).toBeNull();
    expect(redirectFor({ role: null, pathname: "/pricing" })).toBeNull();
    expect(redirectFor({ role: null, pathname: "/login" })).toBeNull();
  });
  it("sends a signed-in person on /login to their home, or to a next they may open", () => {
    expect(redirectFor({ role: "creator", pathname: "/login" })).toBe("/creator");
    expect(redirectFor({ role: "creator", pathname: "/login", search: "?next=%2Fcreator%2Fwallet" })).toBe("/creator/wallet");
    expect(redirectFor({ role: "creator", pathname: "/login", search: "?next=%2Fbrand%2Freview" })).toBe("/creator");
  });
  it("picks the post-login target safely", () => {
    expect(postLoginTarget("brand_member", "/brand/review")).toBe("/brand/review");
    expect(postLoginTarget("brand_member", "/admin")).toBe("/brand");
    expect(postLoginTarget("admin", "https://evil.example")).toBe("/admin");
    expect(postLoginTarget("admin", "/pricing")).toBe("/pricing");
    expect(postLoginTarget("admin", "/login")).toBe("/admin");
  });
});

describe("gateDecision", () => {
  it("is pending until the session is read, unless the server already verified a role", () => {
    expect(gateDecision({ status: "unknown", role: null, allow: "creator" })).toBe("pending");
    expect(gateDecision({ status: "unknown", role: null, initialRole: "creator", allow: "creator" })).toBe("allow");
    expect(gateDecision({ status: "unknown", role: null, initialRole: "admin", allow: "creator" })).toBe("wrong_role");
    expect(gateDecision({ status: "unknown", role: null, initialRole: null, allow: "creator" })).toBe("signed_out");
  });
  it("trusts the browser once the session is ready, whatever the server said", () => {
    expect(gateDecision({ status: "ready", role: "creator", initialRole: "admin", allow: "creator" })).toBe("allow");
    expect(gateDecision({ status: "ready", role: null, initialRole: "creator", allow: "creator" })).toBe("signed_out");
    expect(gateDecision({ status: "ready", role: "brand_member", allow: "creator" })).toBe("wrong_role");
  });
  it("accepts several allowed roles", () => {
    expect(gateDecision({ status: "ready", role: "admin", allow: ["brand_member", "admin"] })).toBe("allow");
    expect(gateDecision({ status: "ready", role: "creator", allow: ["brand_member", "admin"] })).toBe("wrong_role");
  });
  it("lists the personas that can open a gate in picker order", () => {
    expect(gateTargets("creator")).toEqual(["creator"]);
    expect(gateTargets(["admin", "brand_member"])).toEqual(["brand_member", "admin"]);
    expect(gateTargets([])).toEqual([]);
  });
});

describe("personas", () => {
  it("defines the three demo identities from the fixtures", () => {
    expect(DEMO_PERSONAS.brand).toMatchObject({ displayName: "Jordan Ellis", org: "Lumi", role: "brand_member", userId: "usr_jordan", home: "/brand" });
    expect(DEMO_PERSONAS.creator).toMatchObject({ displayName: "Maya Reyes", handle: "maya.makes", role: "creator", userId: "usr_maya", home: "/creator" });
    expect(DEMO_PERSONAS.admin).toMatchObject({ displayName: "Sam Okafor", role: "admin", userId: "usr_ops", home: "/admin" });
  });
  it("lists them brand, creator, admin and maps roles both ways", () => {
    expect(PERSONA_LIST.map((p) => p.key)).toEqual(["brand", "creator", "admin"]);
    for (const p of PERSONA_LIST) {
      expect(personaForRole(p.role)).toBe(p);
      expect(PERSONA_TO_ROLE[ROLE_TO_PERSONA[p.role]]).toBe(p.role);
      expect(p.home).toBe(homeFor(p.role));
    }
  });
  it("never uses a real address for a customer", () => {
    for (const p of PERSONA_LIST) expect(p.email).toMatch(/@(example\.com|joinflowd\.io)$/);
  });
  it("type-guards roles and persona keys", () => {
    expect(isRole("creator")).toBe(true);
    expect(isRole("brand")).toBe(false);
    expect(isPersonaKey("brand")).toBe(true);
    expect(isPersonaKey("brand_member")).toBe(false);
  });
});
