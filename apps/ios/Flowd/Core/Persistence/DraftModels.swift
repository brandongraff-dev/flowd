import Foundation
import SwiftData

/// Where a Studio take is in the flow: script, capture, edit, score, submit.
enum DraftStage: String, Codable, Hashable, Sendable, CaseIterable {
    case script
    case capture
    case edit
    case score
    case submit

    var title: String {
        switch self {
        case .script: return "Script"
        case .capture: return "Capture"
        case .edit: return "Edit"
        case .score: return "Score"
        case .submit: return "Submit"
        }
    }

    /// 0 to 4.
    var index: Int {
        switch self {
        case .script: return 0
        case .capture: return 1
        case .edit: return 2
        case .score: return 3
        case .submit: return 4
        }
    }
}

/// A Studio take in progress, as plain data: what the Studio view models read and write. Drafts survive app restarts (SwiftData `DraftRecord`), so a take
/// is never lost to a crash, a call or a low battery.
struct DraftSnapshot: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var bountyId: String
    var title: String
    var script: String
    var hookText: String
    /// The creator's own caption words; the disclosure and tracking line are added by `BriefHelpers.caption` and can never be removed.
    var caption: String
    var formatId: FormatId?
    var stage: DraftStage
    /// A file in `FlowdDirectories.drafts` (never an absolute path).
    var videoFileName: String?
    var durationMs: Int
    var width: Int
    var height: Int
    var hookBand: ScoreBand
    var hookPoints: Int
    var flowBand: ScoreBand
    var flowPoints: Int
    var qaPass: Int
    var qaWarn: Int
    var qaFail: Int
    /// The shot checklist ticks, by beat id (`hook`, `app_reveal`, ...).
    var checklist: [String: Bool]
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = "draft_" + UUID().uuidString.lowercased(),
        bountyId: String,
        title: String = "",
        script: String = "",
        hookText: String = "",
        caption: String = "",
        formatId: FormatId? = nil,
        stage: DraftStage = .script,
        videoFileName: String? = nil,
        durationMs: Int = 0,
        width: Int = FlowdConstants.Studio.width,
        height: Int = FlowdConstants.Studio.height,
        hookBand: ScoreBand = .c,
        hookPoints: Int = 0,
        flowBand: ScoreBand = .c,
        flowPoints: Int = 0,
        qaPass: Int = 0,
        qaWarn: Int = 0,
        qaFail: Int = 0,
        checklist: [String: Bool] = [:],
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.bountyId = bountyId
        self.title = title
        self.script = script
        self.hookText = hookText
        self.caption = caption
        self.formatId = formatId
        self.stage = stage
        self.videoFileName = videoFileName
        self.durationMs = durationMs
        self.width = width
        self.height = height
        self.hookBand = hookBand
        self.hookPoints = hookPoints
        self.flowBand = flowBand
        self.flowPoints = flowPoints
        self.qaPass = qaPass
        self.qaWarn = qaWarn
        self.qaFail = qaFail
        self.checklist = checklist
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// True once there is a recorded or imported video to score.
    var hasVideo: Bool {
        return videoFileName != nil && durationMs > 0
    }

    /// A short line for the drafts list: "Capture. 0:24 recorded." or "Script. Nothing recorded yet."
    var summaryLine: String {
        if hasVideo {
            return stage.title + ". " + Fmt.timecode(ms: durationMs) + " recorded."
        }
        return stage.title + ". Nothing recorded yet."
    }

    /// The local video, when there is one.
    var videoURL: URL? {
        guard let name = videoFileName else {
            return nil
        }
        return FlowdDirectories.draftVideo(name)
    }
}

/// The SwiftData row behind a draft. Enums are stored by raw value so a new case never breaks an old store; the plain `DraftSnapshot` is what the rest of
/// the app sees.
@Model
final class DraftRecord {
    @Attribute(.unique) var id: String
    var bountyId: String
    var title: String
    var script: String
    var hookText: String
    var caption: String
    var formatIdRaw: String?
    var stageRaw: String
    var videoFileName: String?
    var durationMs: Int
    var width: Int
    var height: Int
    var hookBandRaw: String
    var hookPoints: Int
    var flowBandRaw: String
    var flowPoints: Int
    var qaPass: Int
    var qaWarn: Int
    var qaFail: Int
    var checklistData: Data
    var createdAt: Date
    var updatedAt: Date

    init(snapshot: DraftSnapshot) {
        self.id = snapshot.id
        self.bountyId = snapshot.bountyId
        self.title = snapshot.title
        self.script = snapshot.script
        self.hookText = snapshot.hookText
        self.caption = snapshot.caption
        self.formatIdRaw = snapshot.formatId?.rawValue
        self.stageRaw = snapshot.stage.rawValue
        self.videoFileName = snapshot.videoFileName
        self.durationMs = snapshot.durationMs
        self.width = snapshot.width
        self.height = snapshot.height
        self.hookBandRaw = snapshot.hookBand.rawValue
        self.hookPoints = snapshot.hookPoints
        self.flowBandRaw = snapshot.flowBand.rawValue
        self.flowPoints = snapshot.flowPoints
        self.qaPass = snapshot.qaPass
        self.qaWarn = snapshot.qaWarn
        self.qaFail = snapshot.qaFail
        self.checklistData = DraftRecord.encode(snapshot.checklist)
        self.createdAt = snapshot.createdAt
        self.updatedAt = snapshot.updatedAt
    }

    /// Copies a snapshot onto this row (an update).
    func apply(_ snapshot: DraftSnapshot) {
        bountyId = snapshot.bountyId
        title = snapshot.title
        script = snapshot.script
        hookText = snapshot.hookText
        caption = snapshot.caption
        formatIdRaw = snapshot.formatId?.rawValue
        stageRaw = snapshot.stage.rawValue
        videoFileName = snapshot.videoFileName
        durationMs = snapshot.durationMs
        width = snapshot.width
        height = snapshot.height
        hookBandRaw = snapshot.hookBand.rawValue
        hookPoints = snapshot.hookPoints
        flowBandRaw = snapshot.flowBand.rawValue
        flowPoints = snapshot.flowPoints
        qaPass = snapshot.qaPass
        qaWarn = snapshot.qaWarn
        qaFail = snapshot.qaFail
        checklistData = DraftRecord.encode(snapshot.checklist)
        updatedAt = snapshot.updatedAt
    }

    /// The plain value.
    var snapshot: DraftSnapshot {
        return DraftSnapshot(
            id: id,
            bountyId: bountyId,
            title: title,
            script: script,
            hookText: hookText,
            caption: caption,
            formatId: formatIdRaw.flatMap { (raw: String) -> FormatId? in
                return FormatId(rawValue: raw)
            },
            stage: DraftStage(rawValue: stageRaw) ?? .script,
            videoFileName: videoFileName,
            durationMs: durationMs,
            width: width,
            height: height,
            hookBand: ScoreBand(rawValue: hookBandRaw) ?? .c,
            hookPoints: hookPoints,
            flowBand: ScoreBand(rawValue: flowBandRaw) ?? .c,
            flowPoints: flowPoints,
            qaPass: qaPass,
            qaWarn: qaWarn,
            qaFail: qaFail,
            checklist: DraftRecord.decode(checklistData),
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private static func encode(_ checklist: [String: Bool]) -> Data {
        return (try? JSONEncoder().encode(checklist)) ?? Data()
    }

    private static func decode(_ data: Data) -> [String: Bool] {
        return (try? JSONDecoder().decode([String: Bool].self, from: data)) ?? [:]
    }
}
