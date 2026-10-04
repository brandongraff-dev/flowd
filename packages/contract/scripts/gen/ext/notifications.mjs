// Notifications for creators, brand members and admins, derived from real events (decisions, posts, cash, offers, drops, rights ...).
// Cash events are delivered immediately; everything else is batched inside the recipient's quiet hours. Never a bare vanity ping.
// Every notification names the thing it is about, with the real number or date; the pool copy is only the fallback.

import { iso, ms, addHours, addMinutes, fill, usd, isoWeek, dateOf, clockLabel, nextWeeklyAt } from '../lib.mjs';
import * as P from '../pools.mjs';

const DAY = 86_400_000;
const NK_CASH = new Set(['cash_event', 'payout_cleared', 'payout_paid', 'payout_held', 'rights_renewed']);
const NK_DIGEST = new Set(['views_milestone', 'system_notice', 'streak_milestone', 'review_waiting']);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DISPUTE_KIND = { view_count: 'view count', flagged_botting: 'bot-flag', late_payment: 'late payment', rights_misuse: 'rights', wrong_attribution: 'attribution', rejection_appeal: 'rejection appeal', held_funds: 'held funds', other: 'support' };
const SCAM_REASON = { pay_to_join: 'pay to join', off_platform_chat: 'off-platform chat', fake_brand: 'fake brand', burner_account_demand: 'burner-account demand', no_escrow_claim: 'unfunded work', suspicious_link: 'suspicious link', harassment: 'harassment', other: 'other' };
/** "Fri Oct 9, 6:00 PM UTC" */
const when = (t) => { const d = new Date(ms(t)); const [wd, ...rest] = clockLabel(t).split(' '); return `${wd} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${rest.join(' ')} UTC`; };
/** "Fri Oct 9" */
const dayLabel = (t) => { const d = new Date(ms(t)); return `${clockLabel(t).split(' ')[0]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
/** the first sentence of a longer text, capped for a notification body */
const firstSentence = (text, max = 150) => { const s = String(text).split(/(?<=[.!?])\s/)[0]; return s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s; };
/** the decision deadline of a submission in the queue: its own sla_due_at, or 72 hours after the latest version */
const dueOf = (s) => s.sla_due_at ?? addHours(s.versions[s.versions.length - 1].submitted_at, 72);
const unlocked = (note) => /Unlocked (.+)\.$/.exec(note ?? '')?.[1];

export function genNotifications(W, rng, ext) {
  const nowMs = ms(W.now);
  const rows = [];
  const P0 = W.ctx.world.PERSONAS;

  /** local quiet hours 22:00 to 08:00 expressed in UTC for a time zone (US zones; other zones fall back to Chicago) */
  const OFFSET_H = { 'America/Chicago': -5, 'America/New_York': -4, 'America/Los_Angeles': -7, 'America/Denver': -6, 'America/Phoenix': -7, 'Europe/London': 1, 'Europe/Berlin': 2, 'America/Toronto': -4, 'America/Vancouver': -7, 'Australia/Sydney': 10, 'Europe/Paris': 2, 'Europe/Madrid': 2, 'America/Sao_Paulo': -3, 'America/Mexico_City': -5, 'Europe/Amsterdam': 2, 'Asia/Manila': 8, 'Europe/Dublin': 1, 'Australia/Melbourne': 10 };
  const quietEndUtc = (tz, at) => {
    const off = OFFSET_H[tz] ?? -5;
    const localH = (new Date(ms(at)).getUTCHours() + off + 24) % 24;
    if (!(localH >= 22 || localH < 8)) return null;
    // next 08:00 local
    const d = new Date(ms(at));
    const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8 - off, 0, 0);
    let t = base;
    while (t <= ms(at)) t += DAY;
    while (t - DAY > ms(at)) t -= DAY;
    return iso(t);
  };
  const prefsByUser = new Map(ext.notification_prefs.map((p) => [p.user_id, p]));
  const SETTLED = (p) => ['cleared', 'paid'].includes(p.status);
  const addDays = (isoStr, d) => iso(ms(isoStr) + d * DAY);

  /** extra.copy = [title, body] replaces the pool copy; the pool is the fallback for kinds without a specific sentence */
  const push = (user, audience, kind, at, texts, link, ref, extra = {}) => {
    if (ms(at) > nowMs - 30_000) return;
    const vals = { amount: extra.amount_cents !== undefined ? usd(extra.amount_cents) : '', brand: '', bounty: '', tier: '', n: '', eta: '', hours: '', ...texts };
    const [title, body] = extra.copy ?? P.NOTIFICATION_TEXTS[kind].map((t) => fill(t, vals));
    const priority = NK_CASH.has(kind) ? 'cash' : NK_DIGEST.has(kind) ? 'digest' : 'normal';
    rows.push({
      recipient_user_id: user.id, audience, kind, priority, title, body, ...(extra.amount_cents !== undefined ? { amount_cents: extra.amount_cents } : {}), deep_link: link,
      ...(ref ? { ref_kind: ref[0], ref_id: ref[1] } : {}), _at: at, _tz: user.timezone, _user: user,
    });
  };

  // ── creators ────────────────────────────────────────────────────────────────────────────────────────
  const creatorEvents = (c) => {
    const user = W.userById.get(c.user_id);
    if (!user) return;
    const subs = W.subsByCreator.get(c.id) ?? [];
    for (const s of subs) {
      const b = W.bountyById.get(s.bounty_id);
      const brand = W.brandName(s.brand_id);
      const title = b?.title ?? s.title;
      const d = s.decision;
      if (d && ms(d.decided_at) <= nowMs) {
        const link = `flowd://submission/${s.id}`;
        const ref = ['submission', s.id];
        if (d.action === 'approve') push(user, 'creator', 'approval', d.decided_at, {}, link, ref, { copy: [`Approved by ${brand}`, `"${title}" is approved. Your link, code and #ad line are ready. Post it and the 72-hour view window starts.`] });
        else if (d.action === 'auto_approve') push(user, 'creator', 'approval', d.decided_at, {}, link, ref, { copy: [`Approved by ${brand}`, `"${title}" passed ${brand}'s guarded auto-approve rule. Post it with your link, code and #ad line.`] });
        else if (d.action === 'timeout_approve') push(user, 'creator', 'approval', d.decided_at, {}, link, ref, { copy: [`Approved by ${brand}`, `${brand} did not decide within 72 hours, so "${title}" was approved under their approve-if-clean rule. Post it with your link and code.`] });
        else if (d.action === 'appeal_overturn') push(user, 'creator', 'appeal_decided', d.decided_at, {}, link, ref, { copy: ['Appeal won', `Ops reviewed your appeal on "${title}" and overturned the decision. It goes back to ${brand} for a fresh review.`] });
        else if (d.action === 'appeal_uphold') push(user, 'creator', 'appeal_decided', d.decided_at, {}, link, ref, { copy: ['Appeal decided', `Ops reviewed your appeal on "${title}". ${d.summary ?? 'The decision stands.'} The reason and evidence are on the submission.`] });
        else if (d.action === 'request_changes') {
          const n = ext.feedback_notes.filter((x) => x.submission_id === s.id && x.version === s.version).length || 2;
          push(user, 'creator', 'changes_requested', d.decided_at, {}, link, ref, { copy: ['Changes requested', `${brand} left ${n} timecoded note${n === 1 ? '' : 's'} on "${title}". Round ${Math.min(2, s.versions.length)} of 2 is included; extra rounds are paid by the brand.`] });
        } else if (['reject', 'auto_reject'].includes(d.action)) push(user, 'creator', 'rejection', d.decided_at, {}, link, ref, { copy: [`Not approved: ${title}`, `${d.summary ?? `${brand} could not approve this video.`} The reason and evidence are on the submission, and you can appeal once.`] });
      }
    }
    for (const p of W.postsByCreator.get(c.id) ?? []) {
      const b = W.bountyById.get(p.bounty_id);
      const title = b?.title ?? 'your video';
      push(user, 'creator', 'post_live', p.posted_at, {}, `flowd://post/${p.id}`, ['post', p.id], { copy: ['Views are counting', `"${title}" is live. Verified views count until ${when(p.window_ends_at)}, then the fraud check runs and your earnings clear at the next 14:00 UTC run.`] });
      if (p.views >= 10_000 && SETTLED(p)) {
        const n = p.views >= 50_000 ? '50k' : '10k';
        push(user, 'creator', 'views_milestone', addHours(p.posted_at, 60), {}, `flowd://post/${p.id}`, ['post', p.id], { copy: [`Your post passed ${n} views`, `"${title}" crossed ${n}. Only verified views pay; open the View Ledger to see where they came from.`] });
      }
    }
    // cleared earnings, one notification per post and clearing run; the payout date is the real run (or the next Friday 18:00 UTC)
    const cashGroups = new Map();
    for (const r of (W.earnByCreator.get(c.id) ?? []).filter((x) => x.cleared_at && (x.status === 'cleared' || x.status === 'paid'))) {
      const k = `${r.post_id ?? r.id}|${r.cleared_at}`;
      const g = cashGroups.get(k) ?? { r, cents: 0 };
      g.cents += r.amount_cents;
      cashGroups.set(k, g);
    }
    for (const { r, cents } of cashGroups.values()) {
      const b = W.bountyById.get(r.bounty_id);
      const payoutAt = (r.payout_id && W.payoutById.get(r.payout_id)?.scheduled_for) || nextWeeklyAt(r.cleared_at, 5, 18);
      const what = b?.title ? `"${b.title}"` : r.entry_type === 'prize' ? 'Your tournament prize' : r.entry_type === 'referral' ? 'Your referral reward' : r.entry_type === 'bonus' ? 'Your founding bonus' : 'Your earnings';
      push(user, 'creator', 'cash_event', r.cleared_at, {}, r.post_id ? `flowd://post/${r.post_id}` : 'flowd://moneyClock', r.post_id ? ['post', r.post_id] : undefined, { amount_cents: cents, copy: [`+${usd(cents)} cleared`, `${what} cleared at the 14:00 UTC run. It pays out on ${when(payoutAt)}; weekly payouts are free.`] });
    }
    for (const pay of (W.payoutsByCreator.get(c.id) ?? []).filter((x) => x.status === 'paid')) {
      push(user, 'creator', 'payout_paid', pay.initiated_at ?? pay.scheduled_for, {}, `flowd://payout/${pay.id}`, ['payout', pay.id], { amount_cents: pay.net_cents, copy: [`${usd(pay.net_cents)} is on its way`, `Your ${pay.kind === 'instant' ? 'instant' : 'weekly'} payout is on its way to ${pay.method_label}. It usually arrives in 1 to 2 business days.`] });
    }
    for (const e of ext.tier_history.filter((x) => x.creator_id === c.id && x.kind === 'promoted')) {
      const T = e.to_tier[0].toUpperCase() + e.to_tier.slice(1);
      push(user, 'creator', 'tier_up', e.at, {}, 'flowd://tiers', ['tier_event', e.id], { copy: [`You reached ${T}`, unlocked(e.note) ? `Unlocked: ${unlocked(e.note)}. See what changed on your Tiers screen.` : 'New perks unlocked. See what changed on your Tiers screen.'] });
    }
    for (const o of ext.offers.filter((x) => x.creator_id === c.id)) {
      const brand = W.brandName(o.brand_id);
      const first = o.thread.find((m) => m.author_role === 'brand' && ['offer'].includes(m.type));
      if (first) push(user, 'creator', 'offer_received', first.at, {}, `flowd://offer/${o.id}`, ['offer', o.id], { copy: [`New offer from ${brand}`, o.kind === 'invite' ? `${brand} invited you to "${o.title}" at the bounty rates. Check the Rights Card, then accept or decline within 7 days.` : `${brand} offered ${usd(o.original_amount_cents || o.amount_cents)} for "${o.title}". Check the Rights Card, then accept, counter or decline within 7 days.`] });
      const counters = o.thread.filter((m) => m.type === 'counter');
      const bc = counters.find((m) => m.author_role === 'brand');
      if (bc) push(user, 'creator', 'offer_countered', bc.at, {}, `flowd://offer/${o.id}`, ['offer', o.id], { copy: ['Counter-offer', `${brand} countered at ${usd(bc.amount_cents)} on "${o.title}". Round ${counters.indexOf(bc) + 1} of 3.`] });
      const ac = o.thread.find((m) => m.author_role === 'brand' && m.type === 'accept');
      if (ac) push(user, 'creator', 'offer_accepted', ac.at, {}, `flowd://offer/${o.id}`, ['offer', o.id], { copy: ['Offer accepted', `${brand} accepted your terms for "${o.title}". The offer is funded from their wallet and ready to start.`] });
    }
    for (const g of ext.rights_grants.filter((x) => x.creator_id === c.id && x.ends_at && x.scope === 'paid_ads' && x.alerts_sent.length && x.status !== 'revoked')) {
      const d = Math.min(...g.alerts_sent);
      const b = W.bountyById.get(g.bounty_id);
      push(user, 'creator', 'rights_expiring', addDays(g.ends_at, -d), {}, 'flowd://rights', ['rights_grant', g.id], { copy: [`Rights end in ${d} days`, `Paid-ad usage of "${b?.title ?? 'your video'}" ends ${dayLabel(g.ends_at)}. If ${W.brandName(g.brand_id)} renews, you earn ${usd(g.renewal_price_cents)} for each extra 30 days.`] });
    }
    for (const dsp of ext.disputes.filter((x) => x.creator_id === c.id)) {
      for (const ev of dsp.events.filter((x) => x.actor === 'admin').slice(-1)) {
        push(user, 'creator', 'dispute_update', ev.at, {}, dsp.post_id ? `flowd://dispute/${dsp.post_id}` : dsp.payout_id ? `flowd://payout/${dsp.payout_id}` : 'flowd://moneyClock', ['dispute', dsp.id], { copy: [`Update on your ${DISPUTE_KIND[dsp.kind]} dispute`, firstSentence(ev.text)] });
      }
    }
    for (const t of ext.tax_profiles.filter((x) => x.creator_id === c.id && x.requested_at)) push(user, 'creator', 'tax_info_needed', t.requested_at, {}, 'flowd://tax', ['tax_profile', t.id]);
    for (const lp of ext.lesson_progress.filter((x) => x.creator_id === c.id && x.status === 'completed')) {
      const ls = ext.lessons.find((l) => l.id === lp.lesson_id);
      push(user, 'creator', 'academy_badge', lp.completed_at, {}, `flowd://lesson/${ls?.slug}`, ['lesson', lp.lesson_id], { copy: [`Badge earned: ${ls?.badge_label ?? 'Academy'}`, `You finished "${ls?.title ?? 'a lesson'}". Each lesson adds 0.5 reliability points, up to 5 across the Academy.`] });
    }
    const wk = ext.streaks.find((x) => x.creator_id === c.id);
    if (wk) {
      const streakCopy = (n) => [`${n} weeks in a row`, `You posted every week for ${n} weeks. ${wk.freezes_banked > 0 ? 'A freeze is banked if you need a break.' : 'One post a week keeps it going, and rest weeks never cost you anything.'}`];
      for (const n of [4, 8]) if (wk.current_weeks >= n) { const wkId = wk.history[wk.history.length - 1 - (wk.current_weeks - n)]; if (wkId) { const first = (W.postsByCreator.get(c.id) ?? []).map((p) => p.posted_at).filter((t) => isoWeek(t) === wkId.iso_week).sort()[0]; if (first) push(user, 'creator', 'streak_milestone', first, {}, 'flowd://streak', ['streak', wk.id], { copy: streakCopy(n) }); } }
      if (wk.current_weeks >= 6 && wk.posted_this_week) { const first = (W.postsByCreator.get(c.id) ?? []).map((p) => p.posted_at).filter((t) => isoWeek(t) === wk.iso_week).sort()[0]; if (first && wk.current_weeks === 6) push(user, 'creator', 'streak_milestone', first, {}, 'flowd://streak', ['streak', wk.id], { copy: streakCopy(6) }); }
    }
    for (const t of ext.threads.filter((x) => x.creator_id === c.id)) for (const m of t.messages.filter((x) => x.kind === 'warning')) push(user, 'creator', 'scam_warning', m.at, {}, `flowd://thread/${t.id}`, ['thread', t.id], { copy: ['Careful with this message', `${P.SCAM_WARNING_TEXT[m.warning_code] ?? 'This message asks you to leave flowd.'} Report it from the thread if it felt off.`] });
    for (const e of ext.tournament_entries.filter((x) => x.creator_id === c.id)) {
      const t = ext.tournaments.find((x) => x.id === e.tournament_id);
      if (t && e.round_reached >= 2 && t.rounds[0]) push(user, 'creator', 'tournament_update', t.rounds[0].ends_at, {}, `flowd://tournament/${t.id}`, ['tournament', t.id], { copy: [`You advanced in ${t.title}`, t.rounds[1] ? `Round 1 results are in. Round 2 runs until ${when(t.rounds[1].ends_at)}.` : 'Round 1 results are in. You are through to the next round.'] });
    }
    for (const rf of ext.referrals.filter((x) => x.referrer_creator_id === c.id && x.joined_at)) push(user, 'creator', 'referral_joined', rf.joined_at, {}, 'flowd://referrals', ['referral', rf.id], { copy: [`${rf.referee_label} joined with your code`, 'Your reward starts at their first dollar: 5% of their cleared earnings for 90 days, up to $100, paid by flowd. They are never charged.'] });
    for (const f of ext.flo_suggestions.filter((x) => x.creator_id === c.id && x.kind === 'score_fix')) push(user, 'creator', 'flo_tip', addMinutes(f.created_at, 5), {}, `flowd://submission/${f.context_id}`, ['submission', f.context_id], { copy: ['A tip from Flo', firstSentence(f.outputs[0] ?? f.title)] });
  };

  // Maya gets everything, plus the daily Daily Drop rhythm and the product updates
  const maya = W.maya;
  const mayaUser = maya && W.userById.get(maya.user_id);
  if (maya && mayaUser) {
    creatorEvents(maya);
    for (let d = 0; d < 9; d++) {
      const day = dateOf(iso(nowMs - d * DAY));
      const drop = ext.daily_drops.find((x) => x.date === day);
      if (!drop || drop.status === 'upcoming') continue;
      push(mayaUser, 'creator', 'drop_live', drop.release_at, {}, 'flowd://drop', ['daily_drop', drop.id], { copy: ["Today's Daily Drop is live", `${drop.items.length} bounties, ${drop.spots_total} real spots. A claim holds your place for 24 hours.`] });
    }
    for (const dayOff of [0, 1, 2]) { const day = dateOf(iso(nowMs - dayOff * DAY)); const drop = ext.daily_drops.find((x) => x.date === day); if (drop) push(mayaUser, 'creator', 'drop_reminder', addHours(drop.release_at, -1), {}, 'flowd://drop', ['daily_drop', drop.id]); }
    for (const ch of ext.changelog.filter((x) => (x.audience.length === 0 || x.audience.includes('creator')) && x.date >= '2026-09-05')) push(mayaUser, 'creator', 'system_notice', `${ch.date}T15:00:00Z`, {}, 'flowd://changelog', ['changelog', ch.id], { copy: [`New: ${ch.title}`, firstSentence(ch.body)] });
  }
  // brand-side bounty events a creator cares about: a handful of other creators
  const rc = rng.fork('ntf:creators');
  const creators = rc.sample(W.creators.filter((c) => c.id !== maya?.id && (W.postsByCreator.get(c.id) ?? []).length >= 3), 12);
  for (const c of creators) creatorEvents(c);

  // ── brand members ───────────────────────────────────────────────────────────────────────────────────
  const brandEvents = (member, brand, isLead) => {
    const user = W.userById.get(member.user_id);
    if (!user) return;
    for (const b of W.bountiesByBrand.get(brand.id) ?? []) {
      const link = `/brand/bounties/${b.id}`;
      if (b.funded_at && b.published_at) push(user, 'brand', 'bounty_funded', b.published_at, {}, link, ['bounty', b.id], { copy: [`${b.title} is funded and live`, `${usd(b.escrow_funded_cents)} is in escrow. Creators can submit now; the per-video cap is reserved from the pool the moment they do.`] });
      if (b.filled_at) push(user, 'brand', 'bounty_filled', b.filled_at, {}, link, ['bounty', b.id], { copy: [`${b.title} is filled`, `The pool is fully reserved or settled. New submissions are paused; approved posts are still paid.`] });
      if (b.status === 'awaiting_funding') {
        const need = b.budget_cents + b.fee_reserve_cents;
        push(user, 'brand', 'funding_needed', addDays(b.created_at, 1), {}, link, ['bounty', b.id], { copy: [`Fund ${b.title} to go live`, `It needs ${usd(need)} in escrow (budget plus fee reserve) before it can go live. Your wallet holds ${usd(brand.wallet_balance_cents)}.`] });
      }
    }
    // review queue: a digest each morning for the last days plus SLA warnings on stale and breached items
    const waiting = (W.subsByBrand.get(brand.id) ?? []).filter((s) => ['in_review', 'qa_pending'].includes(s.status));
    if (isLead && waiting.length) {
      const oldest = waiting.reduce((m, s) => (ms(dueOf(s)) < ms(dueOf(m)) ? s : m), waiting[0]);
      const left = Math.round((ms(dueOf(oldest)) - nowMs) / 3_600_000);
      for (let d = 0; d < 6; d++) {
        const n = Math.max(2, waiting.length - (d % 3) + (d > 3 ? 1 : 0));
        push(user, 'brand', 'review_waiting', iso(Date.UTC(2026, 9, 3 - d, 14, 0, 0)), {}, '/brand/review', ['review_queue', brand.id], { copy: [`${n} videos waiting`, d === 0 ? `${n} submissions are waiting for your decision. ${left > 0 ? `The oldest has ${left} hours left on the 72-hour clock.` : 'The oldest is past the 72-hour limit.'}` : `${n} submissions are waiting for your decision. A decision within 72 hours keeps your Scorecard strong.`] });
      }
    }
    for (const s of waiting.filter((x) => ['stale', 'breached'].includes(x.sla_state))) {
      const cur = s.versions[s.versions.length - 1];
      push(user, 'brand', 'review_sla_warning', addHours(cur.submitted_at, s.sla_state === 'breached' ? 70 : 48), {}, `/brand/review/${s.id}`, ['submission', s.id], { copy: [s.sla_state === 'breached' ? 'A decision is overdue' : 'A decision is due', `${s.title} from @${W.handle(s.creator_id)} ${s.sla_state === 'breached' ? 'has passed the 72-hour limit. The creator can escalate and your reliability takes the hit.' : `is close to the 72-hour limit. Decide by ${when(dueOf(s))}.`}`] });
    }
    for (const ad of W.ads.filter((a) => a.brand_id === brand.id && ['live', 'fatigued', 'paused'].includes(a.status))) {
      const t = W.bountyById.get(ad.bounty_id)?.title ?? 'A winner';
      push(user, 'brand', 'ad_live', ad.started_at ?? ad.permission_requested_at, {}, '/brand/promote', ['ad', ad.id], { copy: [`${t} is running as an ad`, `@${W.handle(ad.creator_id)}'s post is promoted. Commission accrues for 60 days and flowd's 1% fee applies to ad spend.`] });
    }
    for (const f of ext.fatigue_alerts.filter((x) => x.brand_id === brand.id)) {
      const t = W.bountyById.get(f.bounty_id)?.title ?? 'a winner';
      push(user, 'brand', 'fatigue_alert', f.detected_at, {}, '/brand/promote', ['fatigue_alert', f.id], { copy: ['A winner is wearing out', `The trial-start rate on "${t}" is down ${Math.round(f.drop_ratio * 100)}% from its peak. Refresh the hook or rest the ad for a week.`] });
    }
    for (const g of ext.rights_grants.filter((x) => x.brand_id === brand.id && x.scope === 'paid_ads' && x.alerts_sent.length && x.status !== 'revoked').slice(0, 4)) {
      const d = Math.min(...g.alerts_sent);
      push(user, 'brand', 'rights_expiring', addDays(g.ends_at, -d), {}, '/brand/rights', ['rights_grant', g.id], { copy: [`Rights end in ${d} days`, `Paid-ad usage of "${W.bountyById.get(g.bounty_id)?.title ?? 'a video'}" ends ${dayLabel(g.ends_at)}. Renew for ${usd(g.renewal_price_cents)} per 30 days, or let the ad stop.`] });
    }
    for (const o of ext.offers.filter((x) => x.brand_id === brand.id)) {
      const counters = o.thread.filter((m) => m.author_role === 'creator' && m.type === 'counter');
      if (counters[0]) push(user, 'brand', 'offer_countered', counters[0].at, {}, '/brand/offers', ['offer', o.id], { copy: ['Counter-offer', `@${W.handle(o.creator_id)} countered at ${usd(counters[0].amount_cents)} on "${o.title}". You can accept, counter once more or decline.`] });
      const ac = o.thread.find((m) => m.author_role === 'creator' && m.type === 'accept');
      if (ac) push(user, 'brand', 'offer_accepted', ac.at, {}, '/brand/offers', ['offer', o.id], { copy: ['Offer accepted', `@${W.handle(o.creator_id)} accepted "${o.title}". The amount is reserved from your wallet and the clock for the video starts.`] });
    }
    for (const r of ext.auto_approve_rules.filter((x) => x.brand_id === brand.id && x.killed_at)) push(user, 'brand', 'auto_approve_paused', r.killed_at, {}, '/brand/review/rules', ['rule', r.id], { copy: ['Auto-approve paused', `"${r.name}" was stopped with the kill switch. ${firstSentence(r.kill_reason ?? '')}`] });
    for (const d of ext.disputes.filter((x) => x.brand_id === brand.id && x.kind !== 'rejection_appeal')) push(user, 'brand', 'dispute_update', d.events[d.events.length - 1].at, {}, '/brand/disputes', ['dispute', d.id], { copy: [`Dispute update: ${DISPUTE_KIND[d.kind]}`, firstSentence(d.events[d.events.length - 1].text)] });
    for (const ch of ext.changelog.filter((x) => (x.audience.length === 0 || x.audience.includes('brand')) && x.date >= '2026-09-12')) push(user, 'brand', 'system_notice', `${ch.date}T15:00:00Z`, {}, '/changelog', ['changelog', ch.id], { copy: [`New: ${ch.title}`, firstSentence(ch.body)] });
  };
  if (W.lumi) {
    for (const m of W.membersOf(W.lumi.id)) {
      if (m.id === P0.brand.member_id) brandEvents(m, W.lumi, true);
      else if (m.role === 'reviewer' || m.role === 'finance') brandEvents({ ...m }, W.lumi, m.role === 'reviewer');
    }
  }
  const rb = rng.fork('ntf:brands');
  for (const b of rb.sample(W.brands.filter((x) => x.kind === 'brand' && x.id !== W.lumi?.id && (W.bountiesByBrand.get(x.id) ?? []).length >= 2), 8)) { const o = W.ownerOf(b.id); if (o) brandEvents(o, b, true); }

  // ── admins ──────────────────────────────────────────────────────────────────────────────────────────
  const ops = W.userById.get(W.opsUserId);
  if (ops) {
    for (const d of ext.disputes) {
      const who = d.creator_id ? `@${W.handle(d.creator_id)}` : W.brandName(d.brand_id);
      push(ops, 'admin', 'dispute_update', d.opened_at, {}, `/admin/disputes/${d.id}`, ['dispute', d.id], { copy: [`New dispute: ${DISPUTE_KIND[d.kind]}`, `${who} opened ${/^[aeiou]/i.test(DISPUTE_KIND[d.kind]) ? 'an' : 'a'} ${DISPUTE_KIND[d.kind]} dispute${d.amount_in_dispute_cents > 0 ? ` over ${usd(d.amount_in_dispute_cents)}` : ''}. First reply due ${when(d.reply_due_at)}.`] });
    }
    for (const s of ext.scam_reports.filter((x) => ['new', 'triaged'].includes(x.status))) push(ops, 'admin', 'scam_warning', s.created_at, {}, '/admin/safety', ['scam_report', s.id], { copy: [`Scam report: ${SCAM_REASON[s.reason]}`, `${s.case_id}: ${firstSentence(s.description, 110)} Triage due ${when(s.sla_due_at)}.`] });
    for (const f of ext.fraud_flags.filter((x) => ['open', 'monitoring'].includes(x.status))) push(ops, 'admin', 'review_sla_warning', f.opened_at, {}, `/admin/fraud/${f.id}`, ['fraud_flag', f.id], { copy: [`Fraud flag ${f.score}: review due`, `@${W.handle(f.creator_id)}'s post scored ${f.score} (${f.band}) with ${usd(f.money_at_stake_cents)} at stake. Review due ${when(f.sla_due_at)}.`] });
    for (const run of ext.payout_runs.filter((x) => x.status === 'complete').slice(-4)) push(ops, 'admin', 'system_notice', addHours(run.scheduled_for, 1), {}, '/admin/payouts', ['payout_run', run.id], { copy: [`Payout run complete: ${usd(run.total_net_cents)}`, `${run.paid_count} of ${run.payouts_count} payouts sent${run.held_count ? `, ${run.held_count} held (${usd(run.held_cents)})` : ''}. Weekly payouts are free; instant fees are listed separately.`] });
    const breachedBy = new Map();
    for (const s of W.subs.filter((x) => x.sla_state === 'breached')) breachedBy.set(s.brand_id, (breachedBy.get(s.brand_id) ?? 0) + 1);
    for (const [bid, n] of breachedBy) push(ops, 'admin', 'review_sla_warning', addHours(W.now, -(5 + n)), {}, '/admin/sla', ['brand', bid], { copy: [`SLA breach at ${W.brandName(bid)}`, `${n} submission${n === 1 ? ' has' : 's have'} passed the 72-hour limit. The queue is escalated and the brand's reliability takes the hit.`] });
  }

  // ── delivery: batching inside quiet hours, delivered_at, read_at ─────────────────────────────────────
  const rd = rng.fork('ntf:delivery');
  // keep the most recent per recipient (Maya 60, Jordan 40, others fewer)
  const byUser = new Map();
  for (const n of rows) (byUser.get(n.recipient_user_id) ?? byUser.set(n.recipient_user_id, []).get(n.recipient_user_id)).push(n);
  const kept = [];
  const cap = (uid) => (uid === P0.creator.user_id ? 60 : uid === P0.brand.user_id ? 40 : uid === W.opsUserId ? 18 : 6);
  for (const [uid, list] of byUser) {
    list.sort((a, b) => (a._at < b._at ? 1 : a._at > b._at ? -1 : 0));
    // keep the rarest kinds first when trimming
    const rank = (k) => ({ tier_up: 0, appeal_decided: 0, rejection: 1, changes_requested: 1, approval: 2, offer_received: 1, offer_countered: 1, rights_expiring: 1, dispute_update: 1, streak_milestone: 1, scam_warning: 0, fatigue_alert: 0, auto_approve_paused: 0, tournament_update: 1 }[k] ?? 3);
    const keep = new Set([...list].sort((a, b) => rank(a.kind) - rank(b.kind) || (a._at < b._at ? 1 : -1)).slice(0, cap(uid)).map((x) => x));
    kept.push(...list.filter((x) => keep.has(x)));
  }
  for (const n of kept) {
    const r = rd.fork(`${n.recipient_user_id}:${n.kind}:${n._at}:${n.ref_id ?? ''}`);
    const created = n._at;
    const prefs = prefsByUser.get(n.recipient_user_id);
    const quietOn = prefs ? prefs.quiet_hours.enabled : false;
    const end = quietOn && prefs.batch_non_cash ? quietEndUtc(prefs.quiet_hours.timezone, created) : null;
    let batched = false;
    let delivered = iso(Math.min(nowMs - 10_000, ms(created) + r.int(3, 40) * 1000));
    if (end && n.priority !== 'cash') { batched = true; delivered = end; }
    else if (n.priority === 'digest') { const d = new Date(ms(created)); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 14, 30, 0); delivered = iso(Math.min(nowMs - 10_000, t)); batched = false; }
    if (ms(delivered) > nowMs) { delivered = undefined; }
    const ageH = (nowMs - ms(created)) / 3_600_000;
    const readP = ageH > 30 ? 0.93 : ageH > 8 ? 0.7 : 0.38;
    const read = delivered && r.chance(readP) ? iso(Math.min(nowMs - 5_000, ms(delivered) + r.int(2, ageH > 30 ? 600 : 120) * 60_000)) : undefined;
    n.batched = batched; n.delivered_at = delivered; n.read_at = read;
  }
  // a notification still held for the morning batch has not been delivered, so it is not in anyone's inbox yet
  for (let i = kept.length - 1; i >= 0; i--) if (!kept[i].delivered_at) kept.splice(i, 1);
  kept.sort((a, b) => (a.recipient_user_id < b.recipient_user_id ? -1 : a.recipient_user_id > b.recipient_user_id ? 1 : a._at < b._at ? -1 : a._at > b._at ? 1 : a.kind < b.kind ? -1 : 1));
  return kept.map(({ _at, _tz, _user, delivered_at, read_at, batched, ...rest }, i) => ({
    id: `ntf_${String(i + 1).padStart(4, '0')}`, ...rest, batched, created_at: _at, ...(delivered_at ? { delivered_at } : {}), ...(read_at ? { read_at } : {}),
  }));
}
