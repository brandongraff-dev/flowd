import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { DemoBanner, DemoTag } from "./demo-banner";
import { RoleGate, type RoleGateProps } from "./role-gate";

// The gate and the banner use the app router's hooks; a render in Node has no router, so give them inert ones.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/creator/wallet",
}));

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

// RoleGate declares its children as required; createElement passes them as an argument, which the overloads cannot see.
const Gate = RoleGate as ComponentType<Omit<RoleGateProps, "children"> & { children?: ReactNode }>;
const child = createElement("p", null, "wallet content");
const gate = (props: Partial<RoleGateProps> & Pick<RoleGateProps, "allow">, children: ReactNode = child): string =>
  renderToStaticMarkup(createElement(Gate, props, children));

describe("<RoleGate> as the server renders it", () => {
  it("renders the page for the role the server verified, with no gate screen", () => {
    const html = gate({ allow: "creator", initialRole: "creator" });
    expect(html).toContain("wallet content");
    expect(html).not.toContain("This area is for");
  });

  it("keeps rendering children when several roles may enter", () => {
    expect(gate({ allow: ["brand_member", "admin"], initialRole: "admin" })).toContain("wallet content");
  });

  it("shows a friendly switch-persona screen to the wrong role, and never the page", () => {
    const html = gate({ allow: "creator", initialRole: "brand_member" });
    expect(html).not.toContain("wallet content");
    expect(html).toContain("This area is for creators");
    expect(html).toContain("You&#x27;re signed in as Jordan Ellis, a brand.");
    expect(html).toContain("Switch to Maya");
    expect(html).toContain("Maya Reyes");
    expect(html).toContain("Back to the brand home");
    expect(html).toContain('href="/brand"');
    expect(html).toContain('href="/login"');
    expect(html).toContain("<h1");
    expect(html).toContain('id="main"');
  });

  it("names the right audience for each area", () => {
    expect(gate({ allow: "brand_member", initialRole: "creator" })).toContain("This area is for brands");
    expect(gate({ allow: "admin", initialRole: "creator" })).toContain("This area is for the flowd team");
    expect(gate({ allow: ["brand_member", "admin"], initialRole: "creator" })).toContain("This area is for brands and the flowd team");
  });

  it("offers every persona that can open a page that several roles share", () => {
    const html = gate({ allow: ["brand_member", "admin"], initialRole: "creator" });
    expect(html).toContain("Switch to Jordan");
    expect(html).toContain("Switch to Sam");
    expect(html).not.toContain("Switch to Maya");
  });

  it("sends a signed-out visitor to sign in, with a link if the redirect does not happen", () => {
    const html = gate({ allow: "creator", initialRole: null });
    expect(html).not.toContain("wallet content");
    expect(html).toContain("Taking you to sign in");
    expect(html).toContain('href="/login?next=%2Fcreator%2Fwallet"');
  });

  it("can show the sign-in screen in place, with one-click persona buttons", () => {
    const html = gate({ allow: "creator", initialRole: null, signedOut: "screen" });
    expect(html).toContain("Sign in to continue");
    expect(html).toContain("This page is for creators. Pick the demo persona to open it.");
    expect(html).toContain("Continue as Maya");
  });

  it("waits for the browser's session when the server did not say, and does not leak the page meanwhile", () => {
    const html = gate({ allow: "creator" });
    expect(html).not.toContain("wallet content");
    expect(html).toContain("Checking your session");
    expect(gate({ allow: "creator", pending: createElement("i", null, "custom wait") })).toContain("custom wait");
  });

  it("fills the content area, without its own landmark or aurora, when inline", () => {
    const html = gate({ allow: "creator", initialRole: "admin", layout: "inline" });
    expect(html).toContain("This area is for creators");
    expect(html).not.toContain('id="main"');
    expect(html).not.toContain("fd-aurora");
    expect(gate({ allow: "creator", initialRole: "admin" })).toContain("fd-aurora");
  });
});

describe("<DemoBanner> and <DemoTag>", () => {
  it("says the data is fictional and offers the persona switcher", () => {
    const html = renderToStaticMarkup(createElement(DemoBanner));
    expect(html).toContain("Demo data");
    expect(html).toContain("Every brand, creator and dollar here is fictional");
    expect(html).toContain("Switch persona");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Dismiss"');
  });

  it("can drop the switcher and the dismiss button", () => {
    const html = renderToStaticMarkup(createElement(DemoBanner, { switcher: false, dismissible: false }));
    expect(html).not.toContain("Switch persona");
    expect(html).not.toContain('aria-label="Dismiss"');
  });

  it("tags simulated figures, with the explanation for screen readers", () => {
    const html = renderToStaticMarkup(createElement(DemoTag));
    expect(html).toContain("Demo data");
    expect(html).toContain("Simulated numbers from the demo world, not real money.");
    expect(html).toContain('class="sr-only"');
    expect(renderToStaticMarkup(createElement(DemoTag, null, "Sample figures"))).toContain("Sample figures");
  });

  it("renders nothing when demo mode is off", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    resetEnvCache();
    expect(renderToStaticMarkup(createElement(DemoBanner))).toBe("");
    expect(renderToStaticMarkup(createElement(DemoTag))).toBe("");
  });
});
