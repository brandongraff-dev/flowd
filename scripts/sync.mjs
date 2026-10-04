#!/usr/bin/env node
// Copies generated source-of-truth artifacts into the apps. Run from the repo root:
//
//   npm run sync            copy whatever exists (missing sources are skipped with a log line)
//   npm run sync -- --check report what would change and exit 1 if anything is out of date (CI)
//
// Idempotent: files are byte-compared and only rewritten when they differ. Nothing is ever deleted;
// fixtures that disappeared from the source are reported as stale so you can remove them by hand.
// Never hand-edit the copies: edit packages/tokens or packages/contract and sync again.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

/** Single-file copies: source -> one or more targets. */
const FILE_SYNCS = [
  { from: "packages/tokens/dist/tokens.css", to: ["apps/web/src/styles/tokens.css"] },
  // Optional Tailwind v4 theme fragment (@theme blocks only); imported after the web-owned theme.css.
  { from: "packages/tokens/dist/tailwind.css", to: ["apps/web/src/styles/tailwind-tokens.css"] },
  { from: "packages/tokens/dist/Tokens.swift", to: ["apps/ios/Flowd/DesignSystem/Tokens.swift"] },
  { from: "packages/contract/types.ts", to: ["apps/web/src/lib/contract/types.ts"] },
  { from: "packages/contract/openapi.yaml", to: ["apps/web/public/openapi.yaml"] },
];

/** Directory copies: every file in fromDir matching `match` -> each target dir. */
const DIR_SYNCS = [
  {
    fromDir: "packages/contract/fixtures",
    match: /\.json$/i,
    to: ["apps/web/src/data/fixtures", "apps/ios/Flowd/Resources/Fixtures"],
  },
];

const totals = { copied: 0, unchanged: 0, skipped: 0, stale: 0 };

const abs = (rel) => path.join(root, ...rel.split("/"));
const rel = (absolute) => path.relative(root, absolute).split(path.sep).join("/");
const log = (line) => console.log(line);

function copyFile(srcAbs, destAbs) {
  const data = fs.readFileSync(srcAbs);
  if (fs.existsSync(destAbs) && Buffer.compare(fs.readFileSync(destAbs), data) === 0) {
    totals.unchanged += 1;
    log(`  =  ${rel(destAbs)} (unchanged)`);
    return;
  }
  totals.copied += 1;
  if (checkOnly) {
    log(`  !  ${rel(destAbs)} is out of date (source: ${rel(srcAbs)})`);
    return;
  }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, data);
  log(`  +  ${rel(srcAbs)} -> ${rel(destAbs)}`);
}

for (const { from, to } of FILE_SYNCS) {
  const srcAbs = abs(from);
  if (!fs.existsSync(srcAbs)) {
    totals.skipped += 1;
    log(`  -  skip ${from} (not generated yet)`);
    continue;
  }
  for (const target of to) copyFile(srcAbs, abs(target));
}

for (const { fromDir, match, to } of DIR_SYNCS) {
  const dirAbs = abs(fromDir);
  const files = fs.existsSync(dirAbs) ? fs.readdirSync(dirAbs).filter((name) => match.test(name)) : [];
  if (files.length === 0) {
    totals.skipped += 1;
    log(`  -  skip ${fromDir}/* (no matching files yet)`);
    continue;
  }
  for (const target of to) {
    const targetAbs = abs(target);
    for (const name of files) copyFile(path.join(dirAbs, name), path.join(targetAbs, name));
    if (fs.existsSync(targetAbs)) {
      for (const name of fs.readdirSync(targetAbs).filter((n) => match.test(n) && !files.includes(n))) {
        totals.stale += 1;
        log(`  ?  stale ${rel(path.join(targetAbs, name))} is no longer in ${fromDir}; delete it by hand if unused`);
      }
    }
  }
}

log(
  `sync${checkOnly ? " --check" : ""}: ${totals.copied} ${checkOnly ? "out of date" : "copied"}, ` +
    `${totals.unchanged} unchanged, ${totals.skipped} skipped, ${totals.stale} stale`,
);
if (checkOnly && totals.copied > 0) process.exit(1);
