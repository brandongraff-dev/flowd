import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isTheme, themeInitScript } from "@/lib/theme";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets the last Tailwind utility win", () => {
    expect(cn("p-2 text-fg", "p-4")).toBe("text-fg p-4");
  });

  it("keeps a flowd text size next to a text colour, and still resolves size conflicts", () => {
    expect(cn("font-display text-figure-hero", "text-mint")).toBe("font-display text-figure-hero text-mint");
    expect(cn("text-caption text-fg-muted")).toBe("text-caption text-fg-muted");
    expect(cn("text-title-md", "text-title-lg")).toBe("text-title-lg");
    expect(cn("shadow-float", "shadow-rest")).toBe("shadow-rest");
    expect(cn("rounded-lg", "rounded-pill")).toBe("rounded-pill");
  });
});

describe("theme", () => {
  it("accepts only light, dark and system", () => {
    expect(["light", "dark", "system"].every(isTheme)).toBe(true);
    expect(isTheme("auto")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("builds an init script that reads the shared storage key and default", () => {
    expect(themeInitScript).toContain(`"${THEME_STORAGE_KEY}"`);
    expect(themeInitScript).toContain(`p="${DEFAULT_THEME}"`);
  });
});
