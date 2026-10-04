import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The engine (pricing, settlement, scoring, matching...) is pure TypeScript.
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    clearMocks: true,
  },
});
