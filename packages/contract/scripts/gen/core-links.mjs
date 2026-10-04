// CORE stage 4b: attribution links. One per approved submission (issued at approval). Promo codes come from a small per-app pool (at most 8 holders per app).

import { slugify } from './lib.mjs';
import { APPS } from './pools.mjs';
import { iso, ms, NOW_EPOCH, HOUR_MS, DAY_MS } from './core-kit.mjs';
import { APPROVED_FAMILY } from './core-subs.mjs';

export function buildLinks(W) {
  const rng = W.rng.fork('links');
  const approved = W.subs.filter((s) => APPROVED_FAMILY.has(s.derived.status));
  // promo-code holders per app: the creators with the most approved videos for that app (Maya first at Lumi)
  const holders = new Map();
  for (const app of W.apps) {
    if (app.slug === 'flowd') continue;
    const counts = new Map();
    for (const s of approved) if (s.app === app) counts.set(s.creator, (counts.get(s.creator) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0].persona ? -1 : 1)).map((x) => x[0]);
    if (app.slug === 'lumi' && !ranked.slice(0, 8).includes(W.maya)) { const i = ranked.indexOf(W.maya); if (i >= 0) ranked.splice(i, 1); ranked.unshift(W.maya); }
    holders.set(app, new Set(ranked.slice(0, app.slug === 'lumi' ? 8 : 6)));
  }
  W.codeHolders = holders;
  const used = new Set();
  const links = [];
  // one promo code per creator and app; two creators with the same first name get distinct codes (DEV-IRONLEAF, DEVM-IRONLEAF)
  const promoOwner = new Map();
  const promoFor = (c, app) => {
    const k = `${c.id}|${app.id}`;
    if (promoOwner.has(k)) return promoOwner.get(k);
    const first = slugify(c.firstName).toUpperCase().replace(/_/g, '');
    const last = slugify(c.lastName || 'x').toUpperCase().replace(/_/g, '');
    const taken = new Set([...promoOwner.entries()].filter(([key]) => key.endsWith(`|${app.id}`)).map(([, v]) => v));
    let code = `${first.slice(0, 8)}-${app.slug.toUpperCase()}`;
    for (let n = 1; taken.has(code) && n <= last.length; n++) code = `${(first.slice(0, 6) + last.slice(0, n)).slice(0, 8)}-${app.slug.toUpperCase()}`;
    for (let n = 2; taken.has(code); n++) code = `${first.slice(0, 6)}${n}-${app.slug.toUpperCase()}`;
    promoOwner.set(k, code);
    return code;
  };
  const token = (c) => slugify(c.handle.split(/[._]/)[0]).slice(0, 10) || 'cr';
  const sorted = [...approved].sort((a, b) => a.derived.approvedAt - b.derived.approvedAt);
  for (const s of sorted) {
    const c = s.creator;
    const app = s.app;
    let code;
    if (c.persona && s.bounty.key === 'lumi_headshots') code = 'maya-lumi7';
    else {
      for (let k = 0; k < 40; k++) { code = `${token(c)}-${app.slug}${rng.int(1, 9)}${k > 8 ? rng.int(1, 9) : ''}`; if (!used.has(code)) break; }
    }
    used.add(code);
    const hold = holders.get(app)?.has(c) && app.slug !== 'flowd';
    const bs = s.bounty.status;
    const approvedAt = s.derived.approvedAt;
    const link = {
      sub: s, creator: c, bounty: s.bounty, app, code, promo: hold ? promoFor(c, app) : undefined,
      createdAt: iso(Math.min(NOW_EPOCH, approvedAt + 60_000 * rng.int(1, 9))), status: s.derived.status === 'released' ? 'expired' : bs === 'paused' ? 'paused' : (bs === 'settled' && ms(s.bounty.endsAt) + 31 * DAY_MS < NOW_EPOCH) ? 'expired' : 'active',
    };
    s.link = link;
    links.push(link);
  }
  // one promo code per creator and app (a code is reused across that creator's links to the same app)
  W.links = links;
  return links;
}
