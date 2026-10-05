import XCTest
@testable import Flowd

/// Direct offers and the rate card: the creator answers (accept, counter up to three rounds, decline), the brand answers on its own median reply time,
/// and an accepted direct offer becomes a private, fully funded bounty.
final class MockOffersTests: XCTestCase {
    /// Lumi's offer to Maya: awaiting the creator, $240.00 for two videos at a 10% take rate, ask $280.00.
    private let offerId: String = "offer_0033"

    // MARK: Reading

    func testOffersListTheOnesWaitingOnTheCreatorFirst() async throws {
        let h: MockHarness = TestSupport.harness()
        let offers: [OfferSummary] = try await h.api.offers()
        XCTAssertEqual(offers.count, 5)
        XCTAssertEqual(offers.first?.awaitingMe, true)
        XCTAssertEqual(offers.first?.offer.id, offerId)
        var seenOther: Bool = false
        for summary in offers {
            if !summary.awaitingMe {
                seenOther = true
            } else {
                XCTAssertFalse(seenOther, summary.id + ": offers waiting on the creator come first.")
            }
            XCTAssertFalse(summary.expiresLabel.isEmpty)
        }
    }

    func testTheOfferDetailExplainsPriceRightsAndCounterRoundsLeft() async throws {
        let h: MockHarness = TestSupport.harness()
        let detail: OfferDetail = try await h.api.offerDetail(id: offerId)
        XCTAssertEqual(detail.summary.offer.amountCents, 24_000)
        XCTAssertEqual(detail.summary.offer.allInCents, 24_000 + MoneyMath.mulRate(24_000, 0.10))
        XCTAssertTrue(detail.canAccept)
        XCTAssertTrue(detail.canCounter)
        XCTAssertTrue(detail.canDecline)
        XCTAssertEqual(detail.counterRoundsLeft, FlowdConstants.Windows.maxCounterRounds)
        XCTAssertFalse(detail.rightsLines.isEmpty)
        XCTAssertNotNil(detail.payContext, "The flat price is shown against what the creator earns on views.")
        XCTAssertNotNil(detail.scorecard)
    }

    func testAnOfferThatIsNotTheCreatorsIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.offerDetail(id: "offer_nope")
        }
        guard case .notFound? = error as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: error))
            return
        }
    }

    // MARK: Countering

    func testACounterSendsTheBallBackAndUsesARound() async throws {
        let h: MockHarness = TestSupport.harness()
        let offer: Offer = try await h.api.counterOffer(
            id: offerId,
            OfferCounterRequest(amountCents: 28_000, rightsDays: 60, message: "Two videos with 60 days of paid usage is $280.")
        )
        XCTAssertEqual(offer.status, .awaitingBrand)
        XCTAssertEqual(offer.amountCents, 28_000)
        XCTAssertEqual(offer.originalAmountCents, 24_000, "The opening price is kept.")
        XCTAssertEqual(offer.allInCents, 28_000 + MoneyMath.mulRate(28_000, 0.10))
        XCTAssertEqual(offer.rounds, 1)
        XCTAssertEqual(offer.thread.count, 2)
        XCTAssertEqual(offer.thread.last?.type, .counter)
        XCTAssertEqual(offer.expiresAt, FlowdCalendar.addDays(FlowdClock.demoNow, 7), "Every counter resets the seven-day clock.")

        let detail: OfferDetail = try await h.api.offerDetail(id: offerId)
        XCTAssertFalse(detail.canAccept)
        XCTAssertFalse(detail.canCounter)
        XCTAssertEqual(detail.counterRoundsLeft, FlowdConstants.Windows.maxCounterRounds - 1)
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.counterOffer(id: self.offerId, OfferCounterRequest(amountCents: 30_000))
        }
        guard case .conflict? = again as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: again))
            return
        }
    }

    func testACounterIsIdempotentAndHasAFloor() async throws {
        let h: MockHarness = TestSupport.harness()
        let first: Offer = try await h.api.counterOffer(id: offerId, OfferCounterRequest(amountCents: 27_000, idempotencyKey: "counter-1"))
        let second: Offer = try await h.api.counterOffer(id: offerId, OfferCounterRequest(amountCents: 27_000, idempotencyKey: "counter-1"))
        XCTAssertEqual(first.id, second.id)
        XCTAssertEqual(second.rounds, 1, "A double tap uses one round.")

        let other: MockHarness = TestSupport.harness()
        let tooLow: Error? = await TestSupport.thrownError {
            _ = try await other.api.counterOffer(id: self.offerId, OfferCounterRequest(amountCents: 2_000))
        }
        guard case .validationFailed? = tooLow as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: tooLow))
            return
        }
    }

    func testTheBrandAcceptsACounterInsideWhatItWillPayOnItsMedianReplyTime() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.counterOffer(id: offerId, OfferCounterRequest(amountCents: 28_000))
        let waiting: OfferDetail = try await h.api.offerDetail(id: offerId)
        XCTAssertEqual(waiting.summary.offer.status, .awaitingBrand)

        _ = try await h.api.advanceDemoClock(hours: 14)
        let detail: OfferDetail = try await h.api.offerDetail(id: offerId)
        let offer: Offer = detail.summary.offer
        XCTAssertEqual(offer.status, .accepted, "Lumi replies in about 12.6 hours and $280.00 is inside what it pays.")
        XCTAssertTrue(offer.escrowFunded)
        let bountyId: String = try XCTUnwrap(offer.bountyId)
        let bounty: Bounty = try await h.api.bountyDetail(id: bountyId).item.bounty
        XCTAssertEqual(bounty.type, .direct)
        XCTAssertEqual(bounty.visibility, .private)
        XCTAssertTrue(bounty.funded)
        XCTAssertEqual(bounty.flatFeeCents, 14_000, "$280.00 over two videos.")
        XCTAssertEqual(bounty.escrowFundedCents, 28_000 + MoneyMath.mulRate(28_000, 0.10))
        XCTAssertTrue(SettlementEngine.escrowIdentityHolds(bounty))
        let notifications: [AppNotification] = try await h.api.notifications(filter: .offers)
        XCTAssertTrue(notifications.contains(where: { (n: AppNotification) -> Bool in
            return n.kind == .offerAccepted && n.refId == offerId
        }))
    }

    func testTheBrandMeetsInTheMiddleWhenACounterIsTooHigh() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.counterOffer(id: offerId, OfferCounterRequest(amountCents: 40_000))
        _ = try await h.api.advanceDemoClock(hours: 14)
        let offer: Offer = try await h.api.offerDetail(id: offerId).summary.offer
        XCTAssertEqual(offer.status, .awaitingCreator)
        XCTAssertEqual(offer.amountCents, 32_000, "Halfway between $240.00 and $400.00, rounded down to $5.00.")
        XCTAssertEqual(offer.rounds, 2)
        XCTAssertEqual(offer.thread.last?.authorRole, .brand)
        XCTAssertEqual(offer.thread.last?.type, .counter)
    }

    // MARK: Accepting and declining

    func testAcceptingAFlatOfferFundsAPrivateBountyAndJoinsIt() async throws {
        let h: MockHarness = TestSupport.harness()
        let offer: Offer = try await h.api.acceptOffer(id: offerId)
        XCTAssertEqual(offer.status, .accepted)
        XCTAssertNotNil(offer.acceptedAt)
        XCTAssertTrue(offer.escrowFunded, "The brand's wallet funds the direct bounty on accept.")
        let bountyId: String = try XCTUnwrap(offer.bountyId)

        let detail: BountyDetail = try await h.api.bountyDetail(id: bountyId)
        XCTAssertEqual(detail.item.bounty.flatFeeCents, 12_000, "$240.00 over two videos.")
        XCTAssertEqual(detail.item.bounty.escrowFundedCents, 24_000 + MoneyMath.mulRate(24_000, 0.10))
        XCTAssertEqual(detail.item.bounty.visibility, .private)
        XCTAssertTrue(detail.state.joined, "An accepted direct offer opens the bounty to this creator.")

        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.acceptOffer(id: self.offerId)
        }
        guard case .conflict? = again as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: again))
            return
        }
    }

    func testAcceptingTwiceWithOneKeyReturnsTheSameOffer() async throws {
        let h: MockHarness = TestSupport.harness()
        let first: Offer = try await h.api.acceptOffer(id: offerId, idempotencyKey: "accept-1")
        let second: Offer = try await h.api.acceptOffer(id: offerId, idempotencyKey: "accept-1")
        XCTAssertEqual(first.id, second.id)
        XCTAssertEqual(first.bountyId, second.bountyId, "One direct bounty, not two.")
    }

    func testDecliningClosesTheOfferAndKeepsTheThread() async throws {
        let h: MockHarness = TestSupport.harness()
        let declined: Offer = try await h.api.declineOffer(id: offerId)
        XCTAssertEqual(declined.status, .declined)
        XCTAssertNotNil(declined.closedAt)
        XCTAssertEqual(declined.thread.last?.type, .decline)
        let detail: OfferDetail = try await h.api.offerDetail(id: offerId)
        XCTAssertFalse(detail.canAccept)
        let blocked: Error? = await TestSupport.thrownError {
            _ = try await h.api.sendOfferMessage(id: self.offerId, body: "Changed my mind")
        }
        XCTAssertNotNil(blocked, "A declined offer takes no more messages.")
    }

    func testAnOfferThatIsNotAnsweredInSevenDaysExpires() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 7 * 24)
        let offer: Offer = try await h.api.offerDetail(id: offerId).summary.offer
        XCTAssertEqual(offer.status, .expired)
    }

    func testAMessageOnAnOpenOfferIsAppendedToTheThread() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Offer = try await h.api.offerDetail(id: offerId).summary.offer
        let after: Offer = try await h.api.sendOfferMessage(id: offerId, body: "Can the paid usage start after the launch week?")
        XCTAssertEqual(after.thread.count, before.thread.count + 1)
        XCTAssertEqual(after.thread.last?.authorRole, .creator)
        XCTAssertEqual(after.status, before.status, "A message never changes whose turn it is.")
        let empty: Error? = await TestSupport.thrownError {
            _ = try await h.api.sendOfferMessage(id: self.offerId, body: "   ")
        }
        XCTAssertNotNil(empty)
    }

    // MARK: Rate card

    func testTheRateCardIsUnlockedAtSilverAndShowsAMarketBand() async throws {
        let h: MockHarness = TestSupport.harness()
        let view: RateCardView = try await h.api.rateCard()
        XCTAssertTrue(view.unlocked)
        XCTAssertEqual(view.tier, .silver)
        let card: RateCard = try XCTUnwrap(view.card)
        XCTAssertEqual(card.pricePerVideoCents, 14_000)
        XCTAssertNotNil(view.suggested)
        XCTAssertNil(view.lockText)
    }

    func testTheRateCardIsLockedForABronzeCreator() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        _ = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: nil))
        let view: RateCardView = try await h.api.rateCard()
        XCTAssertFalse(view.unlocked)
        XCTAssertEqual(view.tier, .bronze)
        XCTAssertNotNil(view.lockText, "A locked rate card says how to unlock it.")
    }
}
