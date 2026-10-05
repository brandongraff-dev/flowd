import Foundation

/// The folders the app writes to. Drafts and their video files live in Application Support (kept, backed up with the device, never purged by the system);
/// caches live in Caches (the system may clear them); the widget snapshot lives in the App Group container (see `Shared/WidgetSnapshot.swift`).
enum FlowdDirectories {
    private static func directory(_ base: FileManager.SearchPathDirectory, _ name: String) -> URL {
        let manager: FileManager = FileManager.default
        let root: URL = manager.urls(for: base, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let url: URL = root.appendingPathComponent("Flowd", isDirectory: true).appendingPathComponent(name, isDirectory: true)
        if !manager.fileExists(atPath: url.path) {
            do {
                try manager.createDirectory(at: url, withIntermediateDirectories: true)
            } catch {
                FlowdLog.persistence.error("Could not create \(name, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        return url
    }

    /// `Application Support/Flowd/Drafts`: recorded takes and the draft database's sidecar files.
    static var drafts: URL {
        return directory(.applicationSupportDirectory, "Drafts")
    }

    /// `Application Support/Flowd/Uploads`: the upload queue file.
    static var uploads: URL {
        return directory(.applicationSupportDirectory, "Uploads")
    }

    /// `Caches/Flowd/Cache`: decoded API answers kept for a while (`DiskCache`).
    static var cache: URL {
        return directory(.cachesDirectory, "Cache")
    }

    /// The URL of a recorded take by file name (the file name is what a draft stores, never an absolute path: the app container moves between installs).
    static func draftVideo(_ fileName: String) -> URL {
        return drafts.appendingPathComponent(fileName, isDirectory: false)
    }
}
