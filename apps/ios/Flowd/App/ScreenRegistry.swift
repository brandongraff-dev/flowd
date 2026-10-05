import SwiftUI

// GENERATED from the screen manifest by the shell (ios-core). Maps every `Route` (and the Studio, Brand and Admin route enums) to the feature
// agents' view types. The feature views live at the paths in App/FEATURE_CONTRACT.md; until a screen is built its file is a placeholder with the
// same type name and initialiser. A new `Route` case does not compile until it has a view here: that is the point of the exhaustive switches.

enum ScreenRegistry {
    /// The view a route opens. Sheets and covers are wrapped by `SheetHost` / `CoverHost`; this returns the content only.
    @ViewBuilder
    static func view(for route: Route) -> some View {
        switch route {
        case .home:
            HomeView()
        case .dailyDrop:
            DailyDropScreen()
        case .streak:
            StreakView()
        case .whatToPostToday:
            WhatToPostTodayView()
        case .activity:
            ActivityView()
        case .bounties:
            BountiesView()
        case .bountyFilters:
            BountyFiltersSheet()
        case .savedBounties:
            SavedAndClaimedView()
        case .bounty(let id):
            BountyDetailView(bountyID: id)
        case .rightsCard(let bountyID):
            RightsCardSheet(bountyID: bountyID)
        case .payMath(let bountyID):
            PayMathSheet(bountyID: bountyID)
        case .brandScorecard(let brandID):
            BrandScorecardSheet(brandID: brandID)
        case .offers:
            OffersInboxView()
        case .offer(let id):
            OfferDetailView(offerID: id)
        case .counterOffer(let offerID):
            CounterOfferSheet(offerID: offerID)
        case .rateCard:
            RateCardEditorView()
        case .scamReport(let kind, let targetID):
            ScamReportSheet(kind: kind, targetID: targetID)
        case .inbox:
            InboxView()
        case .thread(let id):
            ThreadView(threadID: id)
        case .flo(let context), .floSheet(let context):
            FloView(context: context)
        case .permissionPrimer(let kind):
            PermissionPrimerSheet(kind: kind)
        case .firstDollarTracker:
            FirstDollarTrackerView()
        case .profile:
            ProfileView()
        case .editProfile:
            EditProfileView()
        case .tiers:
            TiersView()
        case .linkedAccounts:
            LinkedAccountsView()
        case .accountHealth:
            AccountHealthView()
        case .idVerification:
            IDVerificationSheet()
        case .foundingBadge:
            FoundingBadgeView()
        case .wellbeing:
            WellbeingView()
        case .safety:
            SafetyCenterView()
        case .legal(let document):
            LegalView(document: document)
        case .briefPanel(let bountyID, let draftID):
            StudioBriefPanelSheet(bountyID: bountyID, draftID: draftID)
        case .hookLibrary(let bountyID, let formatID):
            StudioHookLibrarySheet(bountyID: bountyID, formatID: formatID)
        case .teleprompterSettings:
            StudioTeleprompterSettingsSheet()
        case .importVideo(let bountyID):
            StudioImportRouteHost(bountyID: bountyID)
        case .drafts:
            DraftsView()
        case .submissions:
            SubmissionsListView()
        case .submission(let id):
            SubmissionDetailView(submissionID: id)
        case .revise(let submissionID):
            ReviseView(submissionID: submissionID)
        case .appeal(let submissionID):
            AppealSheet(submissionID: submissionID)
        case .postComposer(let submissionID):
            PostComposerView(submissionID: submissionID)
        case .wallet:
            WalletView()
        case .moneyClock:
            MoneyClockView()
        case .earnings:
            EarningsView()
        case .posts:
            PostsView()
        case .post(let id):
            PostDetailView(postID: id)
        case .viewLedger(let postID):
            ViewLedgerView(postID: postID)
        case .dispute(let target):
            DisputeSheet(target: target)
        case .payouts:
            PayoutsView()
        case .payout(let id):
            PayoutDetailView(payoutID: id)
        case .instantCashOut:
            InstantCashOutSheet()
        case .payoutMethods:
            PayoutMethodsView()
        case .tax:
            TaxDeskView()
        case .w9:
            W9FlowSheet()
        case .rights:
            RightsRenewalsView()
        case .earningsCard(let source):
            EarningsCardSheet(source: source)
        case .wrapped(let period):
            WrappedView(period: period)
        case .leaderboard:
            LeaderboardView()
        case .tournaments:
            TournamentsView()
        case .tournament(let id):
            TournamentDetailView(tournamentID: id)
        case .crew(let id):
            CrewScreen(crewID: id)
        case .crewLeaderboard:
            CrewLeaderboardView()
        case .crewDiscover:
            CrewDiscoverView()
        case .referrals:
            ReferralsView()
        case .academy:
            AcademyView()
        case .lesson(let slug):
            LessonView(slug: slug)
        case .badges:
            BadgesView()
        case .remix:
            RemixLibraryView()
        case .hookScoreTool:
            HookScoreToolView()
        case .specs:
            SpecLibraryView()
        case .specUpload:
            SpecUploadView()
        case .spec(let id):
            SpecDetailView(specID: id)
        case .auctions:
            AuctionsView()
        case .auction(let id):
            AuctionDetailView(auctionID: id)
        case .storefront(let handle):
            StorefrontView(handle: handle)
        case .settings(let section):
            settingsView(for: section)
        case .studio(let entry):
            StudioHostView(entry: entry)
        case .uploadQueue:
            UploadQueueView()
        case .brand(let inner):
            brandView(for: inner)
        case .admin(let inner):
            adminView(for: inner)
        }
    }

    // MARK: Settings

    @ViewBuilder
    private static func settingsView(for section: SettingsSection?) -> some View {
        if let section = section {
            switch section {
            case .account:
                AccountSettingsView()
            case .notifications:
                NotificationPreferencesView()
            case .appearance:
                AppearanceSettingsView()
            case .privacy:
                PrivacyDataView()
            case .help:
                HelpSupportView()
            }
        } else {
            SettingsView()
        }
    }

    // MARK: Studio

    /// The root of the Studio cover's stack.
    @ViewBuilder
    static func studioRoot(entry: StudioEntry) -> some View {
        StudioLauncherView(entry: entry)
    }

    /// A step pushed inside the Studio cover.
    @ViewBuilder
    static func studioView(for route: StudioRoute) -> some View {
        switch route {
        case .formatPicker(let bountyID, let preselected):
            StudioFormatPickerView(bountyID: bountyID, preselected: preselected)
        case .script(let bountyID, let formatID, let hook, let draftID):
            StudioScriptView(bountyID: bountyID, formatID: formatID, hook: hook, draftID: draftID)
        case .capture(let bountyID, let draftID):
            StudioCaptureView(bountyID: bountyID, draftID: draftID)
        case .hookCoach(let draftID):
            StudioHookCoachView(draftID: draftID)
        case .permissionRecovery(let kind):
            StudioPermissionRecoveryView(kind: kind)
        case .takeReview(let draftID):
            StudioTakeReviewView(draftID: draftID)
        case .edit(let draftID):
            StudioEditView(draftID: draftID)
        case .captions(let draftID):
            StudioCaptionsView(draftID: draftID)
        case .silenceCut(let draftID):
            StudioSilenceCutView(draftID: draftID)
        case .screenOverlay(let draftID):
            StudioScreenOverlayView(draftID: draftID)
        case .score(let draftID):
            StudioScoreView(draftID: draftID)
        case .preflight(let draftID):
            StudioPreflightView(draftID: draftID)
        case .variants(let draftID):
            StudioVariantsView(draftID: draftID)
        case .submit(let draftID):
            StudioSubmitView(draftID: draftID)
        case .revision(let submissionID):
            StudioRevisionView(submissionID: submissionID)
        }
    }

    // MARK: Brand mode

    @ViewBuilder
    static func brandRoot(_ tab: BrandTab) -> some View {
        switch tab {
        case .overview:
            BrandOverviewView()
        case .review:
            BrandReviewQueueView()
        case .bounties:
            BrandBountiesView()
        case .insights:
            BrandInsightsView()
        case .wallet:
            BrandWalletView()
        }
    }

    @ViewBuilder
    static func brandView(for route: BrandRoute) -> some View {
        switch route {
        case .reviewDetail(let submissionID):
            BrandReviewDetailView(submissionID: submissionID)
        case .bountyDetail(let bountyID):
            BrandBountyDetailView(bountyID: bountyID)
        case .creators:
            BrandCreatorsView()
        case .creatorProfile(let creatorID):
            BrandCreatorProfileView(creatorID: creatorID)
        case .autoApproveRules:
            BrandAutoApproveRulesView()
        case .notificationsAndSettings:
            BrandNotificationsSettingsView()
        case .fundEscrow:
            BrandFundSheet()
        case .sendOffer(let creatorID):
            BrandOfferSheet(creatorID: creatorID)
        }
    }

    // MARK: Admin mode

    @ViewBuilder
    static func adminRoot(_ tab: AdminTab) -> some View {
        switch tab {
        case .control:
            AdminControlTowerView()
        case .queues:
            AdminQueuesView()
        case .money:
            AdminPayoutApprovalsView()
        case .market:
            AdminMarketHealthView()
        case .more:
            AdminMoreView()
        }
    }

    @ViewBuilder
    static func adminView(for route: AdminRoute) -> some View {
        switch route {
        case .fraudCase(let flagID):
            AdminFraudCaseView(flagID: flagID)
        case .dispute(let disputeID):
            AdminDisputeView(disputeID: disputeID)
        case .verification(let verificationID):
            AdminVerificationView(verificationID: verificationID)
        case .payoutRun(let runID):
            AdminPayoutRunView(runID: runID)
        case .mlCalibration:
            AdminMLCalibrationView()
        case .auditLog:
            AdminAuditLogView()
        case .lookup(let query):
            AdminLookupView(query: query)
        case .creatorDetail(let creatorID):
            AdminCreatorDetailView(creatorID: creatorID)
        case .brandDetail(let brandID):
            AdminBrandDetailView(brandID: brandID)
        }
    }
}

/// `Route.importVideo` has no parent screen to hand a result to, so the registry supplies it: the import sheet closes and the new draft opens in
/// the Studio (a push inside the cover when the sheet was opened from the Studio, otherwise a fresh Studio cover at the draft's stage).
struct StudioImportRouteHost: View {
    let bountyID: String?
    @Environment(Router.self) private var router: Router
    @Environment(StudioRouter.self) private var studio: StudioRouter?

    var body: some View {
        StudioImportSheet(bountyID: bountyID) { (draftID: String) in
            router.dismissSheet()
            if let studio = studio {
                studio.push(StudioRoute.score(draftID: draftID))
            } else {
                router.open(Route.studio(StudioEntry.resume(draftID: draftID)))
            }
        }
    }
}
