import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { vi, describe, expect, it } from "vitest";
import * as hooks from "../hooks";
import { StoreGate, StoreHydrator } from "@/lib/store/hydrator";
import { useStoreReady } from "../use-store";

vi.setConfig({ testTimeout: 60_000 });

/**
 * The server render and the first client render must agree, so a hook before the demo world is loaded returns the empty world: empty lists,
 * `undefined`, zeroed totals. These tests render every hook on the server (where the store is always the empty, not-yet-loaded one) and check
 * that none throws and that the first paint is the empty state.
 */
describe("hooks on the first render", () => {
  it("every hook renders without throwing before the store is loaded", () => {
    const names = Object.keys(hooks).filter((n) => /^use[A-Z]/.test(n));
    expect(names.length).toBeGreaterThan(100);
    const failures: string[] = [];
    for (const name of names) {
      const hook = (hooks as unknown as Record<string, (arg?: unknown) => unknown>)[name];
      // hooks that take an argument are tried with none: that is what a page does before it has an id
      const Probe = (): ReturnType<typeof createElement> => {
        const value = hook(undefined);
        return createElement("i", null, value === undefined ? "undefined" : "value");
      };
      try {
        renderToString(createElement(Probe));
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("lists are empty and the store is not ready on the server", () => {
    const Probe = () => {
      const bounties = hooks.useBounties({ status: "live" });
      const posts = hooks.usePosts(undefined);
      const ready = useStoreReady();
      const me = hooks.useMe();
      const wallet = hooks.useCreatorWallet();
      return createElement("p", null, `${ready}|${bounties.length}|${posts.length}|${me.signedIn}|${wallet.rows.length}`);
    };
    expect(renderToString(createElement(Probe))).toContain("false|0|0|false|0");
  });

  it("the gate shows its fallback until the data is ready and the hydrator renders nothing", () => {
    // StoreGate is a component that uses hooks: calling it from inside another component renders it exactly as JSX would
    const Gate = () => StoreGate({ fallback: createElement("p", null, "Loading the demo"), children: createElement("p", null, "Ready") });
    const html = renderToString(createElement(Fragment, null, createElement(StoreHydrator, null), createElement(Gate)));
    expect(html).toContain("Loading the demo");
    expect(html).not.toContain("Ready");
  });
});
