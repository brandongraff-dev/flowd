import path from "node:path";
import type { NextConfig } from "next";

// The repo root has its own package.json but no workspaces: apps/web is
// self-contained, so Turbopack (and file tracing) must root here, not at the
// monorepo root, or it warns about multiple lockfiles / resolves the wrong tree.
const webRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // All imagery is generated (SVG / CSS / canvas), so there is nothing to optimise.
  images: { unoptimized: true },
  // Keep the dev indicator out of screenshots (scripts/shot.mjs).
  devIndicators: false,
  turbopack: { root: webRoot },
  outputFileTracingRoot: webRoot,
};

export default nextConfig;
