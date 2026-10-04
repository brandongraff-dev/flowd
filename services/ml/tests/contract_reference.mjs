// Runs the contract's executable reference (packages/contract/schema/formulas.mjs) on JSON read from stdin and prints the results.
// Used only by tests/test_contract_parity.py to prove the Python service reproduces the contract bit for bit.
//
//   stdin : { "<suite>": [ <input>, ... ], ... }          or   { "__constants__": true }
//   stdout: { "<suite>": [ <output>, ... ], ... }          or   the CONSTANTS object
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const schemaDir = path.resolve(process.argv[2]);
const F = await import(pathToFileURL(path.join(schemaDir, 'formulas.mjs')).href);
const K = await import(pathToFileURL(path.join(schemaDir, 'constants.mjs')).href);

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);

if (input.__constants__) {
  process.stdout.write(JSON.stringify(K.CONSTANTS));
  process.exit(0);
}

const run = {
  hook_score: (c) => F.scoreHook(c),
  flow_score: (c) => F.scoreFlow(c),
  fraud_compose: (c) => {
    const r = F.fraudScore(c.precomputed_signals);
    return { ...r, action: F.fraudAction(r.score) };
  },
  match_score: (c) => F.matchScore(c),
  price_curve: (c) => F.priceCurve(c),
  fill_time: (c) => F.fillTime(c),
  funding: (c) => F.funding(c),
  first_bounty_funding: (c) => F.firstBountyFunding(c),
  all_in_cpm: (c) => F.allInCpm({ cpm_cents: c.cpm_cents, budget_cents: c.budget_cents, card_charge_cents: c.card_charge_cents }),
  expected_earnings: (c) => F.expectedEarnings(c),
  bands: (c) => (c.fn === 'band_for' ? F.bandFor(c.args[0]) : F.predictedViews(c.args[0], c.args[1])),
  rounding: (c) => {
    if (c.fn === 'mul_rate') return F.mulRate(c.args[0], c.args[1]);
    if (c.fn === 'js_round') return Math.round(c.args[0]);
    if (c.fn === 'round2') return F.round2(c.args[0]);
    return Number(c.args[0]).toFixed(c.args[1]);
  },
};

const out = {};
for (const [suite, cases] of Object.entries(input)) {
  if (!run[suite]) throw new Error(`no reference runner for ${suite}`);
  out[suite] = cases.map((c) => {
    const r = run[suite](c);
    return r === undefined ? null : r;
  });
}
process.stdout.write(JSON.stringify(out));
