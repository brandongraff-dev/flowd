// In-app chat threads: one per offer, plus submission, bounty and support threads. In-app only: flowd never moves a conversation
// off-platform, and Scam Shield annotates the risky messages (a few threads below carry them on purpose).

import { iso, ms, addMinutes, fill } from '../lib.mjs';
import * as P from '../pools.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];

const RISKY = {
  off_platform_chat: [
    'It is easier if we continue on WhatsApp. Can you send me your number? Contracts move faster there.',
    'Can you DM me on Telegram instead? I will send the full brief there so it does not get lost.',
  ],
  pay_to_join: ['To lock your slot we ask every creator for a $20 onboarding fee, refunded after your first payout. Can you send it today?'],
  suspicious_link: ['Please sign the creator agreement here before we start: flowd-secure-sign.example/agreement'],
};

const SUB_CONVOS = [
  [['brand', 'Quick question on the second scene: can you re-record that line a bit slower?'], ['creator', 'Sure, I can do that tonight.'], ['brand', 'Thank you, that is the only change.']],
  [['creator', 'Is it okay if the screen recording is the first shot, or do you need my face first?'], ['brand', 'Face first, then {app} on screen by 0:03. The brief needs both.'], ['creator', 'Got it, re-cutting now.']],
  [['brand', 'Your hook is strong. One thing: the offer line needs to say "{days} days free" out loud before the call to action.'], ['creator', 'Added in v2. Could you take another look?'], ['brand', 'Looks good. Approving in the next hour.']],
  [['creator', 'The decision says the disclosure is missing, but #ad is on screen at 0:21. Could you check?'], ['brand', 'You are right, it was behind the caption bar on our preview. Reviewing again now.'], ['creator', 'Thank you. I moved it up in v2 as well, just in case.']],
  [['brand', 'We love the demo of {feature}. Can you trim the first scene by about two seconds?'], ['creator', 'Yes. Trimming the intro so the hook lands by 2 seconds.'], ['brand', 'Perfect, that will do it.']],
  [['creator', 'Can I use my own music under the demo?'], ['brand', 'Only original audio or a commercial-library track, please. Chart music cannot run as an ad.'], ['creator', 'Understood, switching to the library track.']],
];
const BOUNTY_CONVOS = [
  [['creator', 'Does the video need to show my face?'], ['brand', 'A face in the first 3 seconds is required. Faceless formats are okay for the slideshow bounty.']],
  [['creator', 'Is there a view minimum before I get paid?'], ['brand', 'No. Pay starts from the first verified view inside the 72-hour window.']],
  [['creator', 'Can I post only on Instagram?'], ['brand', 'Yes, Instagram Reels count. The deliverables list both platforms but one is enough.']],
  [['creator', 'Can I use a trending sound?'], ['brand', 'Please use original audio or a commercial-library track so the video can run as an ad later.']],
  [['creator', 'Does the {days}-day trial need to be said out loud?'], ['brand', 'Yes, once, before the call to action. It is one of the required beats.']],
  [['creator', 'I only have a 9:16 screen recording. Is that enough for the demo beat?'], ['brand', 'Yes, as long as {feature} is visible for at least 5 seconds.']],
];
const SUPPORT_CREATOR = [
  [['creator', 'My payout shows held. What do I need to do?'], ['system', 'Your payout is held for tax info. Add your W-9 in Settings > Tax Desk to release it. It takes about two minutes.'], ['creator', 'Done, thanks.']],
  [['creator', 'Where do I add my W-9? I got a reminder after my first approval.'], ['system', 'Open the Tax Desk from the More tab and tap "Add W-9". We only store the last four digits of your TIN. This is general information, not tax advice.'], ['creator', 'Found it. Submitted.']],
  [['creator', 'How much is the instant cash-out fee?'], ['system', 'It is 1.5% with a minimum of $0.50 and a maximum of $15. You see the exact fee and the net amount before you confirm. Weekly payouts every Friday at 18:00 UTC are free.']],
  [['creator', 'Why is my identity check still pending?'], ['system', 'Your ID photo was too dark to read. We have asked for a new one in Settings > Verification. Most checks finish within a day once it is uploaded.'], ['creator', 'Uploaded a new photo just now.']],
  [['creator', 'A brand asked me to move to WhatsApp. Is that allowed?'], ['system', 'No. flowd never asks you to leave the app. Please keep the conversation here, and use Report on the message so our team can look at it within 24 hours.'], ['creator', 'Reported. Thank you.']],
];
const SUPPORT_BRAND = [
  [['brand', 'Can we add a PO number to the funding invoice for the October bounty?'], ['system', 'Yes. Open the invoice from Wallet and edit the PO and cost-centre fields. We regenerate the PDF as soon as you save.'], ['brand', 'Perfect, done.']],
  [['brand', 'Our RevenueCat webhook shows a 401 in the delivery log. What should we check?'], ['system', 'The ingest secret ends in a different four characters than the one in your RevenueCat project. Rotate it in Integrations and paste the new value; the next test event should return 200.'], ['brand', 'Rotated. The test event went through.']],
  [['brand', 'How do I stop an ad when the Rights Card ends?'], ['system', 'You do not need to. Ads stop automatically at the end of the paid-usage term, and we alert you at 30, 14 and 7 days before. You can also renew from the Rights Vault.']],
];

/** ChatMessage from an OfferMessage */
function chatFromOffer(om, seq, offer) {
  const body = om.body ?? (om.type === 'offer' ? `Offer: ${(om.amount_cents / 100).toFixed(2)}` : 'Update');
  return {
    id: seq('msg'),
    author_role: om.author_role,
    ...(om.author_user_id ? { author_user_id: om.author_user_id } : {}),
    kind: om.author_role === 'system' ? 'system' : 'text',
    body,
    at: om.at,
  };
}

export function genThreads(W, rng, offers, seq) {
  const now = W.now;
  const nowMs = ms(now);
  const threads = [];
  const maya = W.maya;
  const add = (t) => threads.push(t);
  const readUpTo = (messages, recipientRole, unread) => {
    // mark messages read except the last `unread` ones authored by the other side
    const flipped = [...messages].reverse();
    let left = unread;
    for (const m of flipped) {
      if (m.author_role !== recipientRole && m.author_role !== 'system' && left > 0) { left--; continue; }
      m.read_at = iso(Math.min(nowMs - 60_000, ms(m.at) + 25 * 60_000));
    }
  };
  const trailing = (messages, role) => {
    let n = 0;
    for (let i = messages.length - 1; i >= 0 && messages[i].author_role === role; i--) n++;
    return n;
  };

  // which offers carry a Scam Shield warning: Maya's expired invite plus three spread-out ones
  const warnPlan = new Map();
  const mayaExpired = offers.find((o) => o.creator_id === maya?.id && o.status === 'expired');
  if (mayaExpired) warnPlan.set(mayaExpired.id, 'off_platform_chat');
  const wantWarn = ['pay_to_join', 'suspicious_link', 'off_platform_chat'];
  const poorBrand = (o) => ['poor', 'fair'].includes(W.scorecardByBrand.get(o.brand_id)?.band) || W.brandById.get(o.brand_id)?.verification !== 'verified';
  const warnCands = offers.filter((o) => !warnPlan.has(o.id) && o.brand_id !== W.lumi?.id && o.creator_id !== maya?.id && ['awaiting_creator', 'expired'].includes(o.status) && ms(now) - ms(o.updated_at) > 14 * 3_600_000);
  warnCands.sort((a, b) => Number(poorBrand(b)) - Number(poorBrand(a)) || (a.id < b.id ? -1 : 1));
  const spread = [0, Math.floor(warnCands.length / 3), Math.floor((2 * warnCands.length) / 3)];
  wantWarn.forEach((code, i) => { const o = warnCands[spread[i] ?? i]; if (o && !warnPlan.has(o.id)) warnPlan.set(o.id, code); });

  // ── offer threads ──────────────────────────────────────────────────────────────────────────────────
  offers.forEach((o) => {
    const r = rng.fork(`thr:offer:${o.id}`);
    const messages = o.thread.map((om) => chatFromOffer(om, seq, o));
    const brandMember = W.memberById.get(o.created_by_member_id);
    // a clarifying exchange between the opening message and the next one, when there is room for it
    if (o.kind !== 'invite' && messages.length >= 2 && r.chance(0.4)) {
      const gap = ms(messages[1].at) - ms(messages[0].at);
      if (gap > 5 * 3_600_000) {
        const q = pick(r, [
          ['Quick question: is the paid usage for TikTok only or Meta as well?', 'Both, per the Rights Card. You approve each Spark code or partnership request before it runs.'],
          ['Do you need my face in the first seconds?', 'Face first, then the app by 0:03. Faceless is fine if you prefer a screen-recording-led format.'],
          ['Can I film this as a Day 7 results update?', 'Yes, that format fits the brief well. Send the script if you want a quick check.'],
        ]);
        const t1 = addMinutes(messages[0].at, r.int(40, 180));
        const t2 = addMinutes(t1, r.int(30, 140));
        if (ms(t2) < ms(messages[1].at) - 10 * 60_000) {
          messages.splice(1, 0,
            { id: seq('msg'), author_role: 'creator', author_user_id: W.creatorById.get(o.creator_id).user_id, kind: 'text', body: q[0], at: t1 },
            { id: seq('msg'), author_role: 'brand', author_user_id: brandMember?.user_id, kind: 'text', body: q[1], at: t2 },
          );
        }
      }
    }
    let rateLimited = false;
    const code = warnPlan.get(o.id);
    if (code) {
      const last = messages[messages.length - 1];
      const t1 = new Date(Math.min(nowMs - 10 * 60_000, ms(last.at) + 4 * 3_600_000 + r.int(0, 3) * 3_600_000)).toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (ms(t1) > ms(last.at)) {
        const text = pick(r, RISKY[code]);
        messages.push({ id: seq('msg'), author_role: 'brand', author_user_id: brandMember?.user_id, kind: 'text', body: text, at: t1 });
        messages.push({ id: seq('msg'), author_role: 'system', kind: 'warning', body: P.SCAM_WARNING_TEXT[code], at: addMinutes(t1, 1), warning_code: code });
        if (code === 'pay_to_join') {
          const t2 = addMinutes(t1, 130);
          if (ms(t2) < nowMs - 60_000) messages.push({ id: seq('msg'), author_role: 'brand', author_user_id: brandMember?.user_id, kind: 'text', body: 'Just checking you saw the onboarding step. It is quick and keeps your slot reserved.', at: t2 });
          rateLimited = true;
        }
      }
    }
    const lastBrand = trailing(messages.filter((m) => m.author_role !== 'system'), 'brand');
    const lastCreator = trailing(messages.filter((m) => m.author_role !== 'system'), 'creator');
    let unreadCreator = 0;
    let unreadBrand = 0;
    if (o.status === 'awaiting_creator') unreadCreator = Math.min(3, Math.max(1, lastBrand));
    else if (o.status === 'awaiting_brand') unreadBrand = Math.min(3, Math.max(1, lastCreator));
    if (code && ms(now) - ms(messages[messages.length - 1].at) > 24 * 3_600_000) unreadCreator = o.creator_id === maya?.id ? 1 : 0;
    readUpTo(messages, 'creator', unreadCreator);
    add({
      kind: 'offer', title: o.title, creator_id: o.creator_id, brand_id: o.brand_id, offer_id: o.id, messages, unread_creator: unreadCreator, unread_brand: unreadBrand, rate_limited: rateLimited,
      last_message_at: messages[messages.length - 1].at, created_at: messages[0].at,
    });
  });

  // ── submission threads (Maya's first, then spread across brands) ───────────────────────────────────────
  const subCands = [];
  if (maya) {
    // the catalogue gives Maya nine threads: her offers, one bounty question and one support conversation, and the rest are live submissions
    // (the revision she is working on first, then the reviews she is waiting for)
    const mayaOffers = offers.filter((o) => o.creator_id === maya.id).length;
    const mine = (W.subsByCreator.get(maya.id) ?? []).filter((s) => ['changes_requested', 'in_review'].includes(s.status)).sort((a, b) => (a.status === b.status ? (a.submitted_at < b.submitted_at ? -1 : 1) : a.status === 'changes_requested' ? -1 : 1));
    subCands.push(...mine.slice(0, Math.max(0, Math.min(3, 9 - mayaOffers - 2))));
  }
  const others = W.subs.filter((s) => s.creator_id !== maya?.id && ['changes_requested', 'in_review', 'approved', 'rejected', 'posted'].includes(s.status) && s.versions.length >= 2);
  const rS = rng.fork('thr:sub:pick');
  subCands.push(...rS.shuffle(others).slice(0, 10));
  subCands.slice(0, 12).forEach((s, i) => {
    const r = rng.fork(`thr:sub:${s.id}`);
    const app = W.appById.get(s.app_id);
    const convo = SUB_CONVOS[(i + (s.creator_id === maya?.id ? 0 : 2)) % SUB_CONVOS.length];
    const decider = W.deciders(s.brand_id)[0] ?? W.membersOf(s.brand_id)[0];
    const creator = W.creatorById.get(s.creator_id);
    const lastVersion = s.versions[s.versions.length - 1];
    const vals = { app: app?.name ?? 'the app', feature: (app?.features?.[0] ?? 'the feature').toLowerCase(), days: String(app?.pricing?.trial_days ?? 7) };
    let t = ms(lastVersion.submitted_at) + r.int(3, 20) * 3_600_000;
    const messages = [];
    convo.forEach(([role, body]) => {
      if (t > nowMs - 5 * 60_000) t = nowMs - (convo.length - messages.length) * 7 * 60_000;
      messages.push({ id: seq('msg'), author_role: role, author_user_id: role === 'brand' ? decider?.user_id : creator.user_id, kind: 'text', body: fill(body, vals), at: iso(t) });
      t += r.int(35, 600) * 60_000;
    });
    const unreadCreator = s.status === 'changes_requested' || s.status === 'in_review' ? trailing(messages, 'brand') : 0;
    const unreadBrand = s.status === 'in_review' ? trailing(messages, 'creator') : 0;
    readUpTo(messages, 'creator', unreadCreator);
    add({ kind: 'submission', title: `Re: ${s.title}`, creator_id: s.creator_id, brand_id: s.brand_id, submission_id: s.id, bounty_id: s.bounty_id, messages, unread_creator: unreadCreator, unread_brand: unreadBrand, rate_limited: false, last_message_at: messages[messages.length - 1].at, created_at: messages[0].at });
  });

  // ── bounty Q&A threads ─────────────────────────────────────────────────────────────────────────────────
  const live = W.bounties.filter((b) => b.status === 'live' && b.type !== 'direct');
  const askers = [];
  if (maya) askers.push(maya);
  const rB = rng.fork('thr:bounty:pick');
  askers.push(...rB.sample(W.creators.filter((c) => c.id !== maya?.id), 7));
  askers.slice(0, 8).forEach((c, i) => {
    const r = rng.fork(`thr:bounty:${c.id}`);
    const b = live[(i * 5 + 1) % live.length];
    if (!b) return;
    const app = W.appById.get(b.app_id);
    const decider = W.deciders(b.brand_id)[0] ?? W.membersOf(b.brand_id)[0];
    const convo = BOUNTY_CONVOS[i % BOUNTY_CONVOS.length];
    const vals = { days: String(app?.pricing?.trial_days ?? 7), feature: (app?.features?.[0] ?? 'the feature').toLowerCase() };
    let t = nowMs - r.int(6, 24 * 9) * 3_600_000;
    const messages = convo.map(([role, body]) => {
      const m = { id: seq('msg'), author_role: role, author_user_id: role === 'brand' ? decider?.user_id : c.user_id, kind: 'text', body: fill(body, vals), at: iso(Math.min(t, nowMs - 5 * 60_000)) };
      t += r.int(40, 700) * 60_000;
      return m;
    });
    const unreadCreator = trailing(messages, 'brand') && ms(messages[messages.length - 1].at) > nowMs - 30 * 3_600_000 ? 1 : 0;
    readUpTo(messages, 'creator', unreadCreator);
    add({ kind: 'bounty', title: `Question about ${b.title}`, creator_id: c.id, brand_id: b.brand_id, bounty_id: b.id, messages, unread_creator: unreadCreator, unread_brand: 0, rate_limited: false, last_message_at: messages[messages.length - 1].at, created_at: messages[0].at });
  });

  // ── support threads (one for Maya, three for other creators, three for brands) ─────────────────────────
  // Maya's is the report-a-WhatsApp-request conversation: it goes with the Scam Shield warning on her expired offer
  const supportCreators = [];
  if (maya) supportCreators.push([maya, 4]);
  const rSup = rng.fork('thr:support');
  rSup.sample(W.creators.filter((c) => c.id !== maya?.id), 3).forEach((c, i) => supportCreators.push([c, i === 0 ? 0 : i === 1 ? 1 : 3]));
  supportCreators.forEach(([c, convoIdx], i) => {
    const r = rng.fork(`thr:support:c:${c.id}:${i}`);
    const convo = SUPPORT_CREATOR[convoIdx % SUPPORT_CREATOR.length];
    let t = nowMs - r.int(8, 24 * 40) * 3_600_000;
    const messages = convo.map(([role, body]) => {
      const m = { id: seq('msg'), author_role: role, ...(role === 'creator' ? { author_user_id: c.user_id } : { author_user_id: W.otherAdminId }), kind: 'text', body, at: iso(Math.min(t, nowMs - 5 * 60_000)) };
      t += r.int(20, 360) * 60_000;
      return m;
    });
    readUpTo(messages, 'creator', 0);
    add({ kind: 'support', title: convo[0][1].length > 48 ? `${convo[0][1].slice(0, 45).trimEnd()}...` : convo[0][1], creator_id: c.id, messages, unread_creator: 0, unread_brand: 0, rate_limited: false, last_message_at: messages[messages.length - 1].at, created_at: messages[0].at });
  });
  const supBrands = [W.lumi, ...W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== W.lumi?.id).slice(0, 2)].filter(Boolean);
  supBrands.forEach((b, i) => {
    const r = rng.fork(`thr:support:b:${b.id}`);
    const convo = SUPPORT_BRAND[i % SUPPORT_BRAND.length];
    const mem = b.id === W.lumi?.id ? W.memberById.get(W.ctx.world.PERSONAS.brand.member_id) : W.ownerOf(b.id);
    let t = nowMs - r.int(10, 24 * 30) * 3_600_000;
    const messages = convo.map(([role, body]) => {
      const m = { id: seq('msg'), author_role: role, author_user_id: role === 'brand' ? mem?.user_id : W.opsUserId, kind: 'text', body, at: iso(Math.min(t, nowMs - 5 * 60_000)) };
      t += r.int(20, 300) * 60_000;
      return m;
    });
    readUpTo(messages, 'brand', 0);
    add({ kind: 'support', title: convo[0][1].length > 48 ? `${convo[0][1].slice(0, 45).trimEnd()}...` : convo[0][1], brand_id: b.id, messages, unread_creator: 0, unread_brand: 0, rate_limited: false, last_message_at: messages[messages.length - 1].at, created_at: messages[0].at });
  });

  threads.sort((a, b) => (a.last_message_at < b.last_message_at ? -1 : a.last_message_at > b.last_message_at ? 1 : 0));
  return threads.map((t, i) => ({ id: `thr_${String(i + 1).padStart(4, '0')}`, ...t }));
}
