// operationId of every endpoint. Explicit on purpose: these become method names in the generated Swift and Kotlin clients, so they are written by a person.
// Adding an endpoint to packages/contract/schema/api.mjs without naming it here fails the generator.

export const OPERATION_IDS = {
  // session
  'POST /auth/demo-login': 'demoLogin', 'POST /auth/logout': 'logout', 'GET /me': 'getMe', 'GET /world': 'getWorld', 'GET /health': 'getHealth', 'POST /events': 'trackEvents',
  // apps, brands and team
  'GET /apps': 'listApps', 'POST /apps': 'createApp', 'POST /apps/lookup': 'lookupApp', 'GET /apps/{id}': 'getApp', 'PATCH /apps/{id}': 'updateApp',
  'GET /brands/{id}': 'getBrand', 'PATCH /brands/{id}': 'updateBrand', 'GET /brands/{id}/scorecard': 'getBrandScorecard', 'GET /brands/{id}/members': 'listBrandMembers',
  'POST /brands/{id}/members': 'inviteBrandMember', 'PATCH /brands/{id}/members/{memberId}': 'updateBrandMember', 'DELETE /brands/{id}/members/{memberId}': 'removeBrandMember',
  'GET /brands/{id}/activity': 'listBrandActivity', 'GET /brands/{id}/lists': 'listBrandLists', 'POST /brands/{id}/lists': 'createBrandList', 'PATCH /brands/{id}/plan': 'changeBrandPlan',
  // bounties
  'GET /bounties': 'listBounties', 'POST /bounties': 'createBounty', 'GET /bounties/{id}': 'getBounty', 'PATCH /bounties/{id}': 'updateBounty', 'POST /bounties/lint': 'lintBounty',
  'POST /bounties/price': 'priceBounty', 'POST /bounties/draft': 'draftBounty', 'POST /bounties/{id}/publish': 'publishBounty', 'POST /bounties/{id}/fund': 'fundBounty',
  'POST /bounties/{id}/top-up': 'topUpBounty', 'POST /bounties/{id}/pause': 'pauseBounty', 'POST /bounties/{id}/resume': 'resumeBounty', 'POST /bounties/{id}/close': 'closeBounty',
  'POST /bounties/{id}/cancel': 'cancelBounty', 'POST /bounties/{id}/feature': 'featureBounty', 'GET /bounties/{id}/funnel': 'getBountyFunnel', 'GET /bounties/{id}/creators': 'listBountyCreators',
  // feed, drop, saves
  'GET /feed': 'listFeed', 'GET /drops/today': 'getTodaysDrop', 'GET /drops/{id}': 'getDrop', 'POST /drops/{id}/claim': 'claimDropSpot', 'GET /saves': 'listSaves',
  'PUT /saves/{bountyId}': 'saveBounty', 'DELETE /saves/{bountyId}': 'unsaveBounty',
  // submissions and review
  'GET /submissions': 'listSubmissions', 'POST /submissions': 'createSubmission', 'POST /uploads': 'startUpload', 'GET /submissions/{id}': 'getSubmission',
  'GET /submissions/{id}/analysis': 'getSubmissionAnalysis', 'GET /submissions/{id}/notes': 'listSubmissionNotes', 'POST /submissions/{id}/feedback': 'addSubmissionFeedback',
  'PATCH /feedback/{id}': 'updateFeedbackNote', 'POST /submissions/{id}/decision': 'decideSubmission', 'POST /submissions/{id}/revise': 'reviseSubmission',
  'POST /submissions/{id}/appeal': 'appealSubmission', 'POST /submissions/{id}/withdraw': 'withdrawSubmission', 'POST /submissions/{id}/post': 'attachPost',
  'GET /review/queue': 'getReviewQueue', 'GET /review/rules': 'listAutoApproveRules', 'PUT /review/rules/{id}': 'putAutoApproveRule', 'POST /review/rules/dry-run': 'dryRunAutoApproveRule',
  'POST /review/rules/{id}/enable': 'enableAutoApproveRule', 'POST /review/rules/{id}/kill': 'killAutoApproveRule',
  // scoring
  'POST /score/hook': 'scoreHook', 'POST /score/flow': 'scoreFlow', 'POST /score/preflight': 'preflightSubmission',
  // posts and ledger
  'GET /posts': 'listPosts', 'GET /posts/{id}': 'getPost', 'GET /posts/{id}/ledger': 'getViewLedger', 'GET /posts/{id}/metrics': 'getPostMetrics', 'POST /posts/{id}/dispute': 'disputePostViews',
  'POST /posts/{id}/remove': 'removePost', 'GET /ledger': 'listLedger', 'GET /ledger/{txnId}': 'getLedgerTransaction',
  // wallet and payouts
  'GET /wallet': 'getWallet', 'GET /money-clock': 'listMoneyClock', 'POST /wallet/topup': 'topUpWallet', 'PUT /wallet/auto-topup': 'setAutoTopUp', 'GET /payouts': 'listPayouts',
  'GET /payouts/{id}': 'getPayout', 'GET /payouts/preview': 'previewInstantPayout', 'POST /payouts/instant': 'cashOutInstantly', 'GET /payout-methods': 'listPayoutMethods',
  'POST /payout-methods': 'addPayoutMethod', 'DELETE /payout-methods/{id}': 'removePayoutMethod', 'GET /invoices': 'listInvoices', 'GET /invoices/{id}': 'getInvoice',
  'PATCH /invoices/{id}': 'updateInvoice', 'POST /proofs': 'createProof', 'DELETE /proofs/{id}': 'revokeProof',
  // tax
  'GET /tax/summary': 'getTaxSummary', 'POST /tax/w9': 'submitW9', 'PATCH /tax/set-aside': 'setTaxSetAside', 'GET /tax/docs': 'listTaxDocs', 'GET /tax/export.csv': 'exportTaxCsv',
  // offers, rate card, auctions, specs, market
  'GET /offers': 'listOffers', 'POST /offers': 'createOffer', 'GET /offers/{id}': 'getOffer', 'POST /offers/{id}/messages': 'sendOfferMessage', 'POST /offers/{id}/accept': 'acceptOffer',
  'POST /offers/{id}/counter': 'counterOffer', 'POST /offers/{id}/decline': 'declineOffer', 'POST /offers/{id}/withdraw': 'withdrawOffer', 'GET /rate-card': 'getRateCard',
  'PUT /rate-card': 'putRateCard', 'GET /auctions': 'listAuctions', 'POST /auctions': 'createAuction', 'GET /auctions/{id}': 'getAuction', 'POST /auctions/{id}/bids': 'placeBid',
  'DELETE /auctions/{id}/bids/{bidId}': 'withdrawBid', 'POST /auctions/{id}/cancel': 'cancelAuction', 'GET /specs': 'listSpecs', 'POST /specs': 'createSpec', 'POST /specs/{id}/score': 'scoreSpec',
  'POST /specs/{id}/license': 'licenseSpec', 'DELETE /specs/{id}': 'withdrawSpec', 'GET /market/clearing': 'getMarketClearing', 'POST /market/suggest': 'suggestMarketPrice',
  'GET /market/ticker': 'getMarketTicker', 'GET /report/state-of-app-ugc': 'getStateOfAppUgc',
  // attribution
  'GET /r/{code}': 'resolveTrackingCode', 'POST /attribution/events': 'recordAttributionEvent', 'POST /webhooks/revenuecat': 'receiveRevenueCatWebhook', 'GET /attribution/health': 'getAttributionHealth',
  'GET /attribution/codes': 'listOfferCodes', 'POST /attribution/codes/rotate': 'rotateOfferCodes', 'POST /attribution/test-event': 'sendTestConversion', 'GET /conversions': 'listConversions',
  // rights, promotion, fatigue, library
  'GET /rights': 'listRights', 'POST /rights/{id}/renew': 'renewRights', 'POST /rights/{id}/permission': 'answerRightsPermission', 'POST /rights/{id}/revoke': 'revokeRights',
  'GET /promotions': 'listPromotions', 'POST /promotions': 'promoteWinner', 'POST /promotions/{id}/launch': 'launchPromotion', 'POST /promotions/{id}/pause': 'pausePromotion',
  'POST /promotions/{id}/stop': 'stopPromotion', 'GET /fatigue-alerts': 'listFatigueAlerts', 'POST /fatigue-alerts/{id}/refresh': 'refreshFromFatigueAlert',
  'POST /fatigue-alerts/{id}/dismiss': 'dismissFatigueAlert', 'GET /test-plans': 'listTestPlans', 'POST /test-plans': 'createTestPlan', 'GET /library': 'listCreativeLibrary',
  'GET /compliance': 'listComplianceAudits', 'POST /compliance/{id}/waive': 'waiveComplianceCheck',
  // people and progression
  'GET /creators': 'discoverCreators', 'GET /creators/{idOrHandle}': 'getCreator', 'GET /creators/{id}/reputation': 'getCreatorReputation', 'PATCH /me/profile': 'updateMyProfile',
  'GET /social-accounts': 'listSocialAccounts', 'POST /social-accounts': 'linkSocialAccount', 'DELETE /social-accounts/{id}': 'disconnectSocialAccount', 'GET /tiers': 'getTiers',
  'GET /tiers/me': 'getMyTier', 'GET /streaks/me': 'getMyStreak', 'POST /streaks/rest-week': 'declareRestWeek', 'GET /leaderboards': 'listLeaderboards', 'GET /tournaments': 'listTournaments',
  'GET /tournaments/{id}': 'getTournament', 'POST /tournaments/{id}/entries': 'enterTournament', 'GET /crews': 'listCrews', 'POST /crews': 'createCrew', 'POST /crews/{id}/join': 'joinCrew',
  'POST /crews/{id}/leave': 'leaveCrew', 'GET /referrals': 'listReferrals', 'POST /referrals': 'createReferral', 'GET /academy': 'listLessons', 'GET /academy/{slug}': 'getLesson',
  'POST /academy/{slug}/complete': 'completeLesson', 'GET /remix': 'getRemixLibrary', 'GET /wrapped': 'listWrapped', 'GET /threads': 'listThreads', 'POST /threads/{id}/messages': 'sendThreadMessage',
  'GET /notifications': 'listNotifications', 'POST /notifications/read': 'markNotificationsRead', 'GET /settings/notifications': 'getNotificationSettings',
  'PUT /settings/notifications': 'putNotificationSettings', 'GET /settings/wellbeing': 'getWellbeingSettings', 'PUT /settings/wellbeing': 'putWellbeingSettings', 'POST /verifications': 'startVerification',
  // Flo and free tools
  'POST /flo/chat': 'chatWithFlo', 'POST /tools/hook-score': 'freeHookScore', 'POST /tools/app-audit': 'freeAppUgcAudit', 'GET /audits/{slug}': 'getAuditReport', 'POST /tools/earnings': 'calculateEarnings',
  'POST /tools/budget': 'planBudget', 'POST /tools/price': 'compareAllInPrice',
  // safety
  'POST /reports': 'reportScam', 'GET /reports/mine': 'listMyReports', 'GET /disputes': 'listDisputes', 'GET /disputes/{id}': 'getDispute', 'POST /disputes/{id}/events': 'addDisputeEvent',
  // developers
  'GET /api-keys': 'listApiKeys', 'POST /api-keys': 'createApiKey', 'DELETE /api-keys/{id}': 'revokeApiKey', 'GET /webhook-endpoints': 'listWebhookEndpoints',
  'POST /webhook-endpoints': 'createWebhookEndpoint', 'POST /webhook-endpoints/{id}/test': 'testWebhookEndpoint', 'POST /mcp': 'callMcp', 'GET /integrations': 'listIntegrations',
  'POST /integrations/{kind}/connect': 'connectIntegration', 'DELETE /integrations/{id}': 'disconnectIntegration',
  // admin
  'GET /admin/targets': 'getAdminTargets', 'GET /admin/fraud': 'listFraudFlags', 'GET /admin/fraud/{id}': 'getFraudFlag', 'POST /admin/fraud/{id}/decision': 'decideFraudFlag',
  'GET /admin/disputes': 'listAdminDisputes', 'POST /admin/disputes/{id}/decision': 'decideDispute', 'GET /admin/verification': 'listVerifications', 'POST /admin/verification/{id}/decision': 'decideVerification',
  'GET /admin/payouts': 'listPayoutRuns', 'POST /admin/payouts/{id}/release': 'releasePayoutHold', 'GET /admin/ledger': 'exploreLedger', 'GET /admin/sla': 'listSlaDesk',
  'POST /admin/sla/{submissionId}/approve-if-clean': 'approveIfClean', 'GET /admin/safety': 'listScamReports', 'POST /admin/safety/{id}/action': 'actOnScamReport', 'GET /admin/ml': 'listMlModels',
  'GET /admin/bounties': 'listAdminBounties', 'GET /admin/creators': 'listAdminCreators', 'GET /admin/brands': 'listAdminBrands', 'POST /admin/tier-override': 'overrideTier',
  'POST /admin/demo/advance': 'advanceDemoClock', 'POST /admin/demo/reset': 'resetDemo',
  // public
  'GET /public/bounties/{id}': 'getPublicBounty', 'GET /public/creators/{handle}': 'getPublicStorefront', 'GET /public/proofs/{id}': 'getPublicProof', 'GET /public/scorecards/{brandId}': 'getPublicScorecard',
  'GET /public/tournaments/{id}': 'getPublicTournament', 'GET /public/waitlist': 'getWaitlist', 'POST /public/waitlist': 'joinWaitlist', 'GET /public/changelog': 'listChangelog',
  'GET /public/case-studies': 'listCaseStudies',
};
