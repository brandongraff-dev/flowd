// Verification queue (creator ID and age, brand business, tax, payout method) and the Tax Desk (profiles and documents).
// Creators are verified just in time: at their first approval, before their first payout.

import crypto from 'node:crypto';
import { iso, ms, addHours, addDays, artSeed, sum } from '../lib.mjs';
import * as P from '../pools.mjs';
import { APPROVED_SUB } from './world.mjs';

const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const hashN = (s, mod) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16) % mod;

const PROVIDER = { identity: 'Stripe Identity (mock)', age: 'Stripe Identity (mock)', business: 'Middesk business check (mock)', tax: 'IRS TIN match (mock)', payout_method: 'Plaid bank check (mock)' };
const REASON_NOTE = {
  document_unreadable: 'The ID photo is too dark to read. Please upload a new one in good light with all four corners visible.',
  name_mismatch: 'The name on the ID does not match the name on the account. Add a document that shows both, or update the account name.',
  selfie_mismatch: 'The selfie does not match the ID photo. Please retake it facing the camera without a hat or glasses.',
  business_not_found: 'We could not find the registered business at this address. Please send the registration number or a formation document.',
  bank_name_mismatch: 'The name on the bank account does not match your legal name. Use an account in your own name.',
  tin_mismatch: 'The name and the last four digits of the TIN did not match. Please check the W-9 and resubmit.',
  underage: 'The date of birth on the ID is under 18, so the account cannot be verified.',
  other: 'We need one more document before we can finish. A human reviewer will message you in the app.',
};
const DOC_LABELS = {
  identity: [['Government ID (front)', 'id-front'], ['Selfie with ID', 'selfie']], age: [['Government ID (front)', 'id-front']], business: [['Certificate of formation', 'formation'], ['Business bank statement', 'bank-statement']],
  tax: [['Form W-9', 'w9']], payout_method: [['Bank account confirmation', 'bank-confirmation']],
};

export function genVerifications(W, rng) {
  const nowMs = ms(W.now);
  const rows = [];
  const ops = W.opsUserId;
  const ops2 = W.otherAdminId;
  const docs = (kind, ownerSlug, r) => DOC_LABELS[kind].map(([label, base]) => ({ label, file_name: `${base}-${ownerSlug}.${base === 'selfie' ? 'jpg' : 'pdf'}`, art: artSeed(r, { pattern: 'grid' }) }));
  const add = (spec) => {
    const r = rng.fork(`ver:${rows.length}:${spec.kind}:${spec.id}`);
    const submittedAt = spec.submittedAt;
    const decided = ['verified', 'rejected', 'needs_info'].includes(spec.status);
    const decidedAt = decided ? iso(Math.min(nowMs - 20 * 60_000, ms(submittedAt) + r.int(1, spec.slow ? 38 : 20) * 3_600_000)) : undefined;
    rows.push({
      subject_kind: spec.brand ? 'brand' : 'creator', ...(spec.brand ? { brand_id: spec.id } : { creator_id: spec.id }), kind: spec.kind, status: spec.status, provider: PROVIDER[spec.kind], documents: docs(spec.kind, W.slugOf(spec.id), r),
      submitted_at: submittedAt, sla_due_at: addHours(submittedAt, 24), ...(decided ? { decided_at: decidedAt, decided_by_user_id: r.chance(0.7) ? ops : ops2 } : {}),
      ...(spec.reason ? { reason: spec.reason, note: REASON_NOTE[spec.reason] } : {}), blocks_payout: ['pending', 'needs_info'].includes(spec.status) || spec.status === 'rejected',
    });
  };
  const since = (h) => iso(nowMs - h * 3_600_000);
  const approvedAt = (c) => (W.subsByCreator.get(c.id) ?? []).map((s) => s.approved_at).filter(Boolean).sort()[0];

  // 1. identity rows that mirror the creators' own verification_status
  const rv = rng.fork('ver:status');
  const nonVerified = W.creators.filter((c) => c.verification_status && c.verification_status !== 'verified' && c.verification_status !== 'not_started');
  for (const c of nonVerified) {
    const st = c.verification_status;
    const age = st === 'pending' ? rv.int(2, 22) : st === 'needs_info' ? rv.int(26, 70) : rv.int(50, 240);
    add({ id: c.id, kind: 'identity', status: st, submittedAt: since(age), reason: st === 'needs_info' ? pick(rv, ['document_unreadable', 'selfie_mismatch', 'name_mismatch']) : st === 'rejected' ? pick(rv, ['name_mismatch', 'underage', 'selfie_mismatch']) : undefined, slow: st !== 'pending' });
  }
  // top up the queue so there are 8 pending, 3 needing info and 2 rejected, using other kinds on verified creators
  const count = (st) => rows.filter((x) => x.status === st).length;
  const verifiedCreators = rv.shuffle(W.creators.filter((c) => c.verification_status === 'verified'));
  const used = new Set();
  const nextC = () => { const c = verifiedCreators.find((x) => !used.has(x.id)); if (c) used.add(c.id); return c; };
  const extra = [['pending', 8], ['needs_info', 3], ['rejected', 2]];
  for (const [st, target] of extra) {
    for (let n = count(st); n < target; n++) {
      const c = nextC();
      if (!c) break;
      const kind = st === 'rejected' ? pick(rv, ['payout_method', 'tax']) : pick(rv, ['payout_method', 'tax', 'payout_method', 'identity']);
      const reason = st === 'needs_info' ? (kind === 'tax' ? 'tin_mismatch' : kind === 'payout_method' ? 'bank_name_mismatch' : 'document_unreadable') : st === 'rejected' ? (kind === 'tax' ? 'tin_mismatch' : 'bank_name_mismatch') : undefined;
      add({ id: c.id, kind, status: st, submittedAt: since(st === 'pending' ? rv.int(1, 23) : rv.int(30, 120)), reason, slow: st !== 'pending' });
    }
  }
  // 2. brand business checks
  for (const b of W.brands.filter((x) => x.kind === 'brand' && x.verification && x.verification !== 'not_started')) {
    if (b.verification === 'verified') continue;
    add({ id: b.id, brand: true, kind: 'business', status: b.verification, submittedAt: since(rv.int(3, 90)), reason: b.verification === 'needs_info' ? 'business_not_found' : b.verification === 'rejected' ? 'business_not_found' : undefined, slow: b.verification !== 'pending' });
  }
  // 3. verified history: identity just in time at first approval, plus brand and payout checks
  const verifiedBrands = W.brands.filter((b) => b.kind === 'brand' && b.verification === 'verified');
  const brandPick = rv.shuffle(verifiedBrands).slice(0, 5);
  for (const b of brandPick) add({ id: b.id, brand: true, kind: 'business', status: 'verified', submittedAt: iso(Math.max(ms(b.created_at) + 3_600_000, ms(b.created_at) + rv.int(1, 20) * 3_600_000)) });
  const target = 40;
  for (const c of verifiedCreators) {
    if (rows.length >= target) break;
    if (used.has(c.id)) continue;
    used.add(c.id);
    const first = approvedAt(c);
    const at = first ? iso(Math.min(nowMs - 30 * 3_600_000, ms(first) + rv.int(1, 8) * 3_600_000)) : iso(Math.min(nowMs - 30 * 3_600_000, ms(c.joined_at) + 4 * DAY));
    add({ id: c.id, kind: rv.chance(0.55) ? 'identity' : rv.chance(0.5) ? 'payout_method' : 'tax', status: 'verified', submittedAt: at });
  }
  rows.sort((a, b) => (a.submitted_at < b.submitted_at ? -1 : a.submitted_at > b.submitted_at ? 1 : 0));
  return rows.map((row, i) => ({ id: `ver_${String(i + 1).padStart(3, '0')}`, ...row }));
}

// ── Tax Desk ─────────────────────────────────────────────────────────────────────────────────────────
const STREETS = ['Alder St', 'Maple Ave', 'Cedar Ln', 'Harbor Rd', 'Juniper Ct', 'Willow Way', 'Foster Blvd', 'Elm St', 'Ridge Dr', 'Linden Pl'];
/**
 * Where the pool cities really are: region and a postcode shape (a fixed prefix plus random digits, or letters), so no address pairs
 * Seattle with Californian zip codes. [region, postcode pattern]: # = digit, ? = capital letter, the rest is literal.
 */
const GEO = {
  Austin: ['TX', '787##'], Chicago: ['IL', '606##'], Brooklyn: ['NY', '112##'], Portland: ['OR', '972##'], Atlanta: ['GA', '303##'], Denver: ['CO', '802##'], 'San Diego': ['CA', '921##'], Nashville: ['TN', '372##'],
  Minneapolis: ['MN', '554##'], Phoenix: ['AZ', '850##'], Raleigh: ['NC', '276##'], Seattle: ['WA', '981##'], Columbus: ['OH', '432##'], Tampa: ['FL', '336##'],
  Manchester: ['England', 'M# #??'], Bristol: ['England', 'BS# #??'], Leeds: ['England', 'LS# #??'], Glasgow: ['Scotland', 'G# #??'], Brighton: ['England', 'BN# #??'], London: ['England', 'SE# #??'],
  Toronto: ['ON', 'M#? #?#'], Vancouver: ['BC', 'V#? #?#'], Calgary: ['AB', 'T#? #?#'], Montreal: ['QC', 'H#? #?#'],
  Melbourne: ['VIC', '3###'], Brisbane: ['QLD', '4###'], Perth: ['WA', '6###'], Sydney: ['NSW', '2###'],
  Hamburg: ['Hamburg', '20###'], Cologne: ['NRW', '50###'], Leipzig: ['Sachsen', '04###'], 'Sao Paulo': ['SP', '01###-###'], Recife: ['PE', '50###-###'], Curitiba: ['PR', '80###-###'],
  Lyon: ['Auvergne-Rhone-Alpes', '690##'], Marseille: ['Provence-Alpes-Cote d Azur', '130##'], Nantes: ['Pays de la Loire', '440##'], Valencia: ['Valencia', '460##'], Seville: ['Andalucia', '410##'], Bilbao: ['Pais Vasco', '480##'],
  Guadalajara: ['JAL', '44###'], Monterrey: ['NLE', '64###'], Puebla: ['PUE', '72###'], Utrecht: ['Utrecht', '35## ??'], Rotterdam: ['South Holland', '30## ??'], Cebu: ['Cebu', '6###'], Davao: ['Davao', '8###'], Manila: ['Metro Manila', '1###'],
  Cork: ['Cork', 'T12 ?###'], Galway: ['Galway', 'H91 ?###'], Dublin: ['Dublin', 'D0# ?###'],
};
const fillPattern = (pattern, r) => pattern.replace(/[#?]/g, (ch) => (ch === '#' ? String(r.int(0, 9)) : String.fromCharCode(65 + r.int(0, 25))));

export function genTax(W, rng) {
  const nowMs = ms(W.now);
  const cfg = W.C.tax;
  const maya = W.maya;
  const heldTax = new Set([...W.moneyClock.filter((m) => m.reason === 'held_tax_info').map((m) => m.creator_id), ...W.payouts.filter((p) => p.hold_reason === 'tax_info_missing').map((p) => p.creator_id)]);
  const profiles = [];
  const docs = [];
  const approvedFirst = (c) => (W.subsByCreator.get(c.id) ?? []).filter((s) => APPROVED_SUB.has(s.status) && s.approved_at).map((s) => s.approved_at).sort()[0];
  for (const c of W.creators) {
    const first = approvedFirst(c);
    if (!first) continue;
    const r = rng.fork(`tax:${c.id}`);
    const earn = (W.earnByCreator.get(c.id) ?? []).filter((x) => x.status === 'cleared' || x.status === 'paid');
    const ytdCleared = sum(earn, (x) => x.amount_cents);
    const ytdPaid = sum(earn.filter((x) => x.status === 'paid'), (x) => x.amount_cents);
    const us = c.country === 'US';
    const form = us ? 'w9' : 'w8ben';
    const ageDays = (nowMs - ms(first)) / DAY;
    let status = 'verified';
    if (heldTax.has(c.id)) status = ageDays > 3 ? 'submitted' : 'requested';
    else if (ageDays < 4 && r.chance(0.6)) status = 'requested';
    else if (ageDays < 9 && r.chance(0.18)) status = 'submitted';
    if (c.verification_status === 'rejected' && c.id !== maya?.id) status = 'rejected';
    if (c.id === maya?.id) status = 'verified';
    const requestedAt = first;
    const submittedAt = status === 'requested' ? undefined : iso(Math.min(nowMs - 3_600_000, ms(first) + r.int(2, 60) * 3_600_000));
    const verifiedAt = status === 'verified' ? iso(Math.min(nowMs - 60 * 60_000, ms(submittedAt) + r.int(1, 30) * 3_600_000)) : undefined;
    const user = W.userById.get(c.user_id);
    const has = status !== 'requested';
    const slot = hashN(c.id, 99);
    // the city the creator names in their bio (Maya: Austin), else one of their country's pool cities
    const cities = P.CITIES[c.country] ?? ['Springfield'];
    const city = cities.find((x) => c.bio?.includes(x)) ?? pick(r, cities);
    const [region, postcode] = GEO[city] ?? ['Region', '#####'];
    const rate = c.id === maya?.id ? cfg.set_aside_rate : r.weighted([[cfg.set_aside_rate, 78], [0.2, 10], [0.3, 12]]);
    const progress = Math.min(1, ytdPaid / cfg.form_1099_nec_threshold_cents);
    profiles.push({
      creator_id: c.id, status, ...(has ? { form } : {}), ...(has ? { legal_name: user?.display_name ?? c.display_name } : {}), ...(has ? { entity_type: r.chance(0.95) ? 'individual' : 'llc' } : {}),
      ...(has ? { tin_last4: String(1000 + ((slot * 389 + hashN(`${c.id}tin`, 8000)) % 9000)).slice(0, 4) } : {}),
      ...(has ? { address: { line1: `${r.int(12, 4980)} ${pick(r, STREETS)}`, ...(r.chance(0.25) ? { line2: `Apt ${r.int(1, 40)}` } : {}), city, region, postal_code: fillPattern(postcode, r), country: c.country } } : {}),
      country: c.country, tax_year: cfg.tax_year, ytd_cleared_cents: ytdCleared, ytd_paid_cents: ytdPaid, threshold_cents: cfg.form_1099_nec_threshold_cents, threshold_progress: Math.round(progress * 100) / 100,
      form_1099_required: us && ytdPaid >= cfg.form_1099_nec_threshold_cents, set_aside_rate: rate, set_aside_cents: Math.round(ytdCleared * rate), requested_at: requestedAt,
      ...(submittedAt ? { submitted_at: submittedAt } : {}), ...(verifiedAt ? { verified_at: verifiedAt } : {}), ...(!us && verifiedAt ? { expires_at: addDays(verifiedAt, 365 * 3) } : {}),
      updated_at: iso(Math.min(nowMs - 60_000, ms(verifiedAt ?? submittedAt ?? requestedAt))),
    });
    // documents
    if (status === 'verified' || status === 'submitted') {
      docs.push({ creator_id: c.id, kind: form, status: status === 'verified' ? 'issued' : 'draft', tax_year: cfg.tax_year, file_ref: `${form === 'w9' ? 'W9' : 'W8BEN'}-${c.id}.pdf`, created_at: submittedAt, ...(verifiedAt ? { issued_at: verifiedAt } : {}) });
    }
    if (us && ytdPaid >= cfg.form_1099_nec_threshold_cents) {
      docs.push({ creator_id: c.id, kind: 'form_1099_nec', status: 'draft', tax_year: cfg.tax_year, amount_cents: ytdPaid, file_ref: `1099-NEC-${cfg.tax_year}-${c.id}-DRAFT.pdf`, created_at: iso(Math.min(nowMs - 3_600_000, ms(earn.map((x) => W.earnedAt(x)).sort()[0] ?? first) + 40 * DAY)) });
    }
  }
  profiles.sort((a, b) => (a.creator_id < b.creator_id ? -1 : 1));
  docs.sort((a, b) => (a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : a.kind < b.kind ? -1 : 1));
  return {
    tax_profiles: profiles.map((p) => ({ id: `taxp_${W.slugOf(p.creator_id)}`, ...p })),
    tax_docs: docs.map((d) => ({ id: `taxd_${W.slugOf(d.creator_id)}_${d.kind.replace('form_', '')}`, ...d })),
  };
}
