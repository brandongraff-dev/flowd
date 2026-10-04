// EXT fixture generator: everything that is not identity or the marketplace money graph. The orchestrator calls gen/core.mjs generate(ctx)
// first and passes its result here as `core`, so every ext row references real ids and derives from real numbers (ledger, posts,
// creators, bounties ...). The tables are built by stage modules in gen/ext/, in dependency order:
//
//   content   formats hooks lessons lesson_progress trends changelog testimonials case_studies audit_reports
//   market    offers threads auctions specs rights_grants brand_lists
//   growth    daily_drops bounty_saves tournaments tournament_entries crews crew_members streaks leaderboards wellbeing_settings
//             notification_prefs tier_history referrals waitlist wrapped proofs
//   trust     feedback_notes disputes scam_reports fraud_flags verifications tax_profiles tax_docs compliance_checks payout_runs
//   platform  integrations api_keys webhooks activity_log auto_approve_rules test_plans fatigue_alerts flo_suggestions revenuecat_events offer_code_pool
//   summary   notifications ml_models state_of_app_ugc admin_metrics
//
// Every stage uses its own forked RNG stream, so adding rows to one table never reshuffles another. Money is integer cents, "now" is
// 2026-10-03T14:00:00Z, no Math.random or Date.now anywhere.

import { buildWorld } from './ext/world.mjs';
import * as content from './ext/content.mjs';
import { genOffers } from './ext/offers.mjs';
import { genThreads } from './ext/threads.mjs';
import { genAuctions } from './ext/auctions.mjs';
import { genSpecs } from './ext/specs.mjs';
import { genRights, genBrandLists } from './ext/rights.mjs';
import { makeSeq } from './ext/util.mjs';
import { genDrops, genSaves } from './ext/drops.mjs';
import { genTournaments } from './ext/tournaments.mjs';
import { genCrews } from './ext/crews.mjs';
import { genLeaderboards } from './ext/leaderboards.mjs';
import { genWellbeing, genStreaks, genNotificationPrefs } from './ext/streaks.mjs';
import { genTierHistory } from './ext/tiers.mjs';
import { genReferrals, genWaitlist } from './ext/referrals.mjs';
import { genProofsAndWrapped } from './ext/proofs.mjs';
import { genFeedbackNotes } from './ext/feedback.mjs';
import { genFraudFlags, genDisputes, genScamReports } from './ext/safety.mjs';
import { genVerifications, genTax } from './ext/identity.mjs';
import { genCompliance, genPayoutRuns } from './ext/compliance.mjs';
import { genOfferCodes, genRevenueCatEvents, genIntegrations, genApiKeys, genWebhooks } from './ext/attribution.mjs';
import { genAutoApproveRules, genTestPlans, genFatigueAlerts, genActivityLog } from './ext/team.mjs';
import { genFloSuggestions } from './ext/flo.mjs';
import { genNotifications } from './ext/notifications.mjs';
import { genStateOfAppUgc, genAdminMetrics } from './ext/summary.mjs';

/**
 * @typedef {import('../../types').FixtureMap} FixtureMap
 * @typedef {Pick<FixtureMap,
 *   'offers' | 'auctions' | 'specs' | 'rights_grants' | 'daily_drops' | 'tournaments' | 'tournament_entries' | 'crews' | 'crew_members' |
 *   'streaks' | 'leaderboards' | 'referrals' | 'lessons' | 'lesson_progress' | 'trends' | 'formats' | 'hooks' | 'tier_history' | 'wrapped' |
 *   'proofs' | 'bounty_saves' | 'wellbeing_settings' | 'notification_prefs' | 'waitlist' | 'state_of_app_ugc' | 'case_studies' |
 *   'testimonials' | 'changelog' | 'feedback_notes' | 'disputes' | 'scam_reports' | 'fraud_flags' | 'verifications' | 'tax_profiles' |
 *   'tax_docs' | 'compliance_checks' | 'payout_runs' | 'notifications' | 'integrations' | 'api_keys' | 'webhooks' | 'activity_log' |
 *   'auto_approve_rules' | 'test_plans' | 'fatigue_alerts' | 'audit_reports' | 'flo_suggestions' | 'ml_models' | 'admin_metrics' |
 *   'threads' | 'revenuecat_events' | 'offer_code_pool' | 'brand_lists'
 * >} ExtFixtures
 */

/**
 * Generate the ext fixtures.
 * @param {import('./lib.mjs').Context} ctx
 * @param {import('./core.mjs').CoreFixtures} core  the result of core.generate(ctx)
 * @returns {Promise<ExtFixtures> | ExtFixtures}
 */
export function generate(ctx, core) {
  const W = buildWorld(ctx, core);
  const R = (label) => ctx.rng.fork(`ext:${label}`);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const table of ctx.tablesOf('ext')) out[table] = ctx.emptyFor(table);

  // content
  out.formats = content.genFormats(W, R('formats'));
  out.hooks = content.genHooks(W, R('hooks'));
  const academy = content.genAcademy(W, R('academy'));
  out.lessons = academy.lessons;
  out.lesson_progress = academy.lesson_progress;
  out.trends = content.genTrends(W, R('trends'));
  out.changelog = content.genChangelog();
  out.testimonials = content.genTestimonials(W, R('testimonials'));
  out.case_studies = content.genCaseStudies(W, R('case_studies'));
  out.audit_reports = content.genAuditReports(W, R('audit_reports'));

  // everything below derives from the marketplace money graph: while core is still a stub (no creators, brands or posts) stop here
  if (!(W.creators.length && W.brands.length && W.bounties.length && W.posts.length)) {
    out.ml_models = content.genMlModels(W, R('ml_models'), out);
    return /** @type {ExtFixtures} */ (out);
  }

  // market
  const seq = makeSeq();
  out.offers = genOffers(W, R('offers'), seq);
  out.threads = genThreads(W, R('threads'), out.offers, seq);
  out.auctions = genAuctions(W, R('auctions'), seq);
  out.specs = genSpecs(W, R('specs'));
  out.rights_grants = genRights(W, R('rights'), seq);
  out.brand_lists = genBrandLists(W, R('brand_lists'));

  // growth
  const dropsOut = genDrops(W, R('drops'));
  out.daily_drops = dropsOut.drops;
  out.bounty_saves = genSaves(W, R('saves'), dropsOut.drops, dropsOut.claimsByCreator);
  const tour = genTournaments(W, R('tournaments'), seq);
  out.tournaments = tour.tournaments;
  out.tournament_entries = tour.entries;
  const crewsOut = genCrews(W, R('crews'));
  out.crews = crewsOut.crews;
  out.crew_members = crewsOut.crew_members;
  const lb = genLeaderboards(W, R('leaderboards'));
  out.leaderboards = lb.leaderboards;
  out.wellbeing_settings = genWellbeing(W, R('wellbeing'), lb.optOut);
  out.streaks = genStreaks(W, R('streaks'), out.wellbeing_settings);
  out.notification_prefs = genNotificationPrefs(W, R('notification_prefs'), out.wellbeing_settings);
  out.tier_history = genTierHistory(W, R('tier_history'));
  out.referrals = genReferrals(W, R('referrals'));
  out.waitlist = genWaitlist(W, R('waitlist'), out.referrals);
  const pw = genProofsAndWrapped(W, R('proofs'), out.tier_history);
  out.proofs = pw.proofs;
  out.wrapped = pw.wrapped;

  // trust
  out.feedback_notes = genFeedbackNotes(W, R('feedback_notes'));
  out.fraud_flags = genFraudFlags(W, R('fraud_flags'));
  out.disputes = genDisputes(W, R('disputes'), out.fraud_flags);
  out.scam_reports = genScamReports(W, R('scam_reports'), out.threads, out.offers);
  out.verifications = genVerifications(W, R('verifications'));
  const tax = genTax(W, R('tax'));
  out.tax_profiles = tax.tax_profiles;
  out.tax_docs = tax.tax_docs;
  out.compliance_checks = genCompliance(W, R('compliance'));
  out.payout_runs = genPayoutRuns(W);

  // platform and attribution
  out.offer_code_pool = genOfferCodes(W, R('offer_codes'));
  out.revenuecat_events = genRevenueCatEvents(W, R('revenuecat'));
  out.integrations = genIntegrations(W, R('integrations'), out.revenuecat_events);
  out.api_keys = genApiKeys(W, R('api_keys'));
  out.webhooks = genWebhooks(W, R('webhooks'));

  out.auto_approve_rules = genAutoApproveRules(W, R('rules'));
  out.test_plans = genTestPlans(W, R('test_plans'), out.offers);
  out.fatigue_alerts = genFatigueAlerts(W, R('fatigue'));
  out.activity_log = genActivityLog(W, R('activity'), out);

  out.flo_suggestions = genFloSuggestions(W, R('flo'), out);

  // summary
  out.notifications = genNotifications(W, R('notifications'), out);
  out.ml_models = content.genMlModels(W, R('ml_models'), out);
  out.state_of_app_ugc = genStateOfAppUgc(W);
  out.admin_metrics = genAdminMetrics(W, R('admin'), out);
  return /** @type {ExtFixtures} */ (out);
}
