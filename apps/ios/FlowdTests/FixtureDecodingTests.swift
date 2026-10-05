import XCTest
@testable import Flowd

/// Every bundled demo fixture decodes strictly into its Swift model, the row counts match the world manifest, and the JSON rules (snake_case keys,
/// tolerant ISO-8601 dates, `unknown` fallbacks) behave as the contract says.
final class FixtureDecodingTests: XCTestCase {
    private struct Stamp: Decodable {
        var postedAt: Date
        var clearedAt: Date?
    }

    private struct Holder: Decodable {
        var status: SubmissionStatus
        var tier: Tier
    }

    func testEveryContractTableHasExactlyOneDecoder() {
        var registered: [String] = []
        for entry in FixtureRegistry.decoders {
            registered.append(entry.table)
        }
        XCTAssertEqual(Set(registered).count, registered.count, "A table is registered twice.")
        XCTAssertEqual(registered.sorted(), FixtureLoader.allTables.sorted(), "FixtureLoader.allTables and the generated registry drifted apart.")
    }

    func testEveryFixtureFileIsBundled() {
        let loader: FixtureLoader = TestSupport.loader()
        for table in FixtureLoader.allTables {
            XCTAssertTrue(loader.exists(table), "Fixtures/" + table + ".json is not in the app bundle. Run `npm run sync`.")
        }
    }

    func testEveryBundledFixtureDecodesIntoItsModel() {
        let loader: FixtureLoader = TestSupport.loader()
        for entry in FixtureRegistry.decoders {
            do {
                let rows: Int = try entry.decode(loader)
                XCTAssertGreaterThan(rows, 0, entry.table + " decoded to zero rows.")
            } catch {
                XCTFail(entry.table + " failed to decode: " + String(describing: error))
            }
        }
    }

    func testRowCountsMatchTheWorldManifest() throws {
        let loader: FixtureLoader = TestSupport.loader()
        let world: World = try loader.load(World.self, named: "world")
        XCTAssertFalse(world.counts.isEmpty)
        for entry in FixtureRegistry.decoders {
            guard let expected = world.counts[entry.table] else {
                continue
            }
            let rows: Int = try entry.decode(loader)
            XCTAssertEqual(rows, expected, entry.table + " has " + String(rows) + " rows, the world manifest says " + String(expected) + ".")
        }
    }

    func testTheDemoWorldIsPinnedToTheDemoNow() throws {
        let world: World = try TestSupport.loader().load(World.self, named: "world")
        XCTAssertEqual(world.now, FlowdClock.demoNow)
        XCTAssertEqual(FlowdDates.string(from: world.now), "2026-10-03T14:00:00Z")
        XCTAssertEqual(world.personas.creator.creatorId, "cr_maya")
        XCTAssertEqual(world.personas.creator.handle, "maya.makes")
        XCTAssertEqual(FlowdCalendar.isoWeek(world.now), "2026-W40")
        XCTAssertEqual(FlowdCalendar.weekday(world.now), 6, "2026-10-03 is a Saturday.")
    }

    func testMissingFixtureThrowsANamedFixtureError() {
        let loader: FixtureLoader = TestSupport.loader()
        XCTAssertFalse(loader.exists("no_such_table"))
        do {
            _ = try loader.load([Brand].self, named: "no_such_table")
            XCTFail("Loading a missing fixture must throw.")
        } catch let error as FlowdAPIError {
            if case .fixture(let table, _) = error {
                XCTAssertEqual(table, "no_such_table")
            } else {
                XCTFail("Expected a fixture error, got " + error.code)
            }
        } catch {
            XCTFail("Expected a FlowdAPIError, got " + String(describing: error))
        }
    }

    func testOptionalTablesLoadAsEmptyWhenAbsent() throws {
        let rows: [Brand] = try TestSupport.loader().loadIfPresent([Brand].self, named: "no_such_table")
        XCTAssertTrue(rows.isEmpty)
    }

    // MARK: JSON rules

    func testSnakeCaseKeysAndDatesDecode() throws {
        let json: String = #"{"posted_at":"2026-10-03T14:00:00Z","cleared_at":"2026-10-07T14:00:00.250Z"}"#
        let stamp: Stamp = try FlowdJSON.decode(Stamp.self, from: Data(json.utf8))
        XCTAssertEqual(stamp.postedAt, FlowdClock.demoNow)
        let cleared: Date = try XCTUnwrap(stamp.clearedAt)
        XCTAssertEqual(cleared.timeIntervalSince(FlowdClock.demoNow), 4 * 86_400 + 0.25, accuracy: 0.001)
    }

    func testDatesWithOffsetsAndBareDaysDecode() {
        XCTAssertEqual(FlowdDates.parse("2026-10-03T16:00:00+02:00"), FlowdClock.demoNow)
        XCTAssertEqual(FlowdDates.parse("2026-10-03T09:00:00-05:00"), FlowdClock.demoNow)
        XCTAssertEqual(FlowdDates.parse("2026-10-03"), FlowdCalendar.make(year: 2026, month: 10, day: 3))
        XCTAssertNil(FlowdDates.parse("yesterday"))
        XCTAssertNil(FlowdDates.parse("2026-13-40T00:00:00Z"))
    }

    func testDatesRoundTripThroughTheEncoder() throws {
        let data: Data = try FlowdJSON.encode(["at": FlowdClock.demoNow])
        let text: String = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(text.contains("2026-10-03T14:00:00Z"), text)
        let back: [String: Date] = try FlowdJSON.decode([String: Date].self, from: data)
        XCTAssertEqual(back["at"], FlowdClock.demoNow)
    }

    func testUnknownEnumValuesFallBackToUnknown() throws {
        let json: String = #"{"status":"teleported","tier":"diamond"}"#
        let holder: Holder = try FlowdJSON.decode(Holder.self, from: Data(json.utf8))
        XCTAssertEqual(holder.status, .unknown)
        XCTAssertEqual(holder.tier, .unknown)
        XCTAssertFalse(holder.status.isKnown)
    }

    func testKnownEnumValuesKeepTheirContractMeaning() throws {
        let json: String = #"{"status":"changes_requested","tier":"platinum"}"#
        let holder: Holder = try FlowdJSON.decode(Holder.self, from: Data(json.utf8))
        XCTAssertEqual(holder.status, .changesRequested)
        XCTAssertEqual(holder.tier, .platinum)
        XCTAssertEqual(SubmissionStatus.changesRequested.rawValue, "changes_requested")
    }

    func testTiersAreOrderedBronzeToElite() {
        XCTAssertEqual(Tier.allCases, [.bronze, .silver, .gold, .platinum, .elite])
        XCTAssertTrue(Tier.gold.atLeast(.silver))
        XCTAssertFalse(Tier.bronze.atLeast(.silver))
        XCTAssertEqual(Tier.silver.next, .gold)
        XCTAssertNil(Tier.elite.next)
    }

    func testLossyArraySkipsABadRowInsteadOfFailingTheList() throws {
        let json: String = #"[{"status":"approved","tier":"gold"},{"status":7},{"status":"posted","tier":"silver"}]"#
        struct Row: Decodable {
            var status: SubmissionStatus
            var tier: Tier
        }
        let lossy: LossyArray<Row> = try FlowdJSON.decode(LossyArray<Row>.self, from: Data(json.utf8))
        XCTAssertEqual(lossy.elements.count, 2)
        XCTAssertEqual(lossy.skipped, 1)
        XCTAssertEqual(lossy.elements.last?.status, .posted)
    }

    // MARK: Spot checks on the seeded creator

    func testMayaIsASilverCreatorWithAConnectedPrimaryAccount() throws {
        let loader: FixtureLoader = TestSupport.loader()
        let creators: [Creator] = try loader.load([Creator].self, named: "creators")
        let maya: Creator = try XCTUnwrap(creators.first(where: { (c: Creator) -> Bool in
            return c.id == "cr_maya"
        }))
        XCTAssertEqual(maya.tier, .silver)
        XCTAssertEqual(maya.handle, "maya.makes")
        XCTAssertEqual(maya.verificationStatus, .verified)
        XCTAssertEqual(maya.payoutMethod?.status, .active)
        let accounts: [SocialAccount] = try loader.load([SocialAccount].self, named: "social_accounts").filter { (a: SocialAccount) -> Bool in
            return a.creatorId == "cr_maya"
        }
        XCTAssertEqual(accounts.count, 2)
        XCTAssertEqual(accounts.first(where: { (a: SocialAccount) -> Bool in return a.primary })?.platform, .tiktok)
    }

    func testEveryBountyHoldsTheEscrowIdentity() throws {
        let bounties: [Bounty] = try TestSupport.loader().load([Bounty].self, named: "bounties")
        XCTAssertFalse(bounties.isEmpty)
        for bounty in bounties {
            XCTAssertTrue(SettlementEngine.escrowIdentityHolds(bounty), bounty.id + ": escrow funded must equal reserved + spent + remaining + refunded.")
        }
    }
}
