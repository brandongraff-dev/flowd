# packages/contract

The domain contract for flowd: **one schema, everything else generated or checked against it.** Zero dependencies, Node 20+.

```
schema/                 SOURCE OF TRUTH (plain ESM)
  dsl.mjs               field-type grammar and helpers
  enums-*.mjs           166 enumerations (value, UI label, colour tone, meaning)
  value-types*.mjs      121 nested value types
  entities-*.mjs        80 entities = 80 fixture files (core 27, ext 53)
  tables.mjs            reason codes and 23 state machines (who triggers each transition)
  constants.mjs         CONSTANTS: every number (DECISIONS.md) + sources
  formulas.mjs          the reference implementation of every formula, with worked examples
  time.mjs              UTC helpers (ISO weeks, clearing runs, Friday payouts)
  world.mjs             personas, scale, scenarios, reconciliation invariants
  fixtures.mjs          per-file counts and generation notes
  api.mjs               API surface summary for openapi.yaml and the mock API
  index.mjs             aggregate + checkSchema()
DOMAIN.md               THE bible (prose + generated blocks)       <- generated blocks, do not hand-edit
types.ts                zero-dependency TypeScript, passes tsc --strict   <- generated
formula-vectors.json    inputs/outputs of the reference formulas for engine parity tests   <- generated
scripts/
  build-contract.mjs    schema -> types.ts + DOMAIN.md blocks + formula-vectors.json  (--check for CI)
  generate-fixtures.mjs orchestrator: gen/core.mjs -> gen/ext.mjs -> canonical JSON -> validate
  validate-fixtures.mjs structure + references + reconciliation (--strict, --self-test)
  gen/lib.mjs           seeded PRNG, ids, time, money, allocate(), artSeed(), canonical JSON
  gen/pools*.mjs        names, handles, 24 apps, categories, niches, hooks, QA/reason/feedback texts, formats, lessons, trends
  gen/core.mjs          CORE generator (identity + marketplace money graph)      <- owned by the core fixture agent
  gen/ext.mjs           EXT generator (everything else)                          <- owned by the ext fixture agent
fixtures/               generated *.json (never hand-edited; synced to the apps by `npm run sync`)
```

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `npm run contract:build` | Regenerate `types.ts`, the generated blocks of `DOMAIN.md` and `formula-vectors.json` |
| `npm run contract:check` | Fail if any of them is stale |
| `npm run fixtures:gen` | Generate all fixtures into `packages/contract/fixtures` and validate (`-- --out <dir>` to write elsewhere, `-- --strict`, `-- --determinism`) |
| `npm run fixtures:validate` | Validate the fixtures folder (`-- --strict` fails on warnings) |
| `npm run fixtures:selftest` | Prove the validator catches broken data (no fixtures needed) |

## Changing the contract

1. Edit `schema/*.mjs` (a field, an enum value, a constant, a formula, a state machine).
2. `npm run contract:build` (it refuses an inconsistent schema).
3. Update the generators if a field was added, run `npm run fixtures:gen`, then `npm run sync`.

Never hand-edit `types.ts` or a generated block in `DOMAIN.md`. Constants live only in `schema/constants.mjs`; the web engine, iOS engine and generators read them from `types.ts` / this package.

## For the fixture agents

* Fill `gen/core.mjs` and `gen/ext.mjs` (documented stubs; read their header comments for the exact return contract). Use `ctx.rng.fork('<stage>')` for every stage so adding rows never reshuffles other data.
* Use `schema/formulas.mjs` for every derived number (funding, settlement, scores, tiers, reliability, fraud, Money Clock ETAs) and `allocate()` / `decayShares()` so every roll-up reconciles to the cent.
* The validator is yours to extend: add a function, register it in `CHECKS`, flip the invariant to `base` in `schema/world.mjs`. Run it after every stage.
* The demo world is `now = 2026-10-03T14:00:00Z`. Read DOMAIN.md sections 10 (ledger postings), 13 (demo world), 14 (fixture catalogue) and 15 (invariants and scenarios) before writing a line.
