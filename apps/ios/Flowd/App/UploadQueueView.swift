import SwiftUI

/// The upload queue (`Route.uploadQueue`, a sheet): every take that is waiting, sending, paused or stopped, with its state and a way to try again.
/// Takes are resumable and survive a restart; a failure leaves the take safe on the phone ("Stopped. Your take is saved on this phone.").
struct UploadQueueView: View {
    @Environment(AppState.self) private var appState: AppState
    @State private var jobs: [UploadJob] = []
    @State private var hasLoaded: Bool = false

    var body: some View {
        FlowdScreen(aurora: FlowdAuroraIntensity.calm) {
            if hasLoaded && jobs.isEmpty {
                EmptyStateView(
                    systemImage: "checkmark.icloud",
                    title: "Everything is sent",
                    message: "Takes you submit upload here. If you lose your connection they wait, and carry on from where they stopped."
                )
            } else if !jobs.isEmpty {
                FlowdCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(jobs) { (job: UploadJob) in
                            row(job)
                            if job.id != jobs.last?.id {
                                FlowdDivider(inset: FlowdSpacing.md)
                            }
                        }
                    }
                }
            }
        }
        .flowdNavigationTitle("Uploads", large: false)
        .task {
            await reload()
        }
    }

    private func row(_ job: UploadJob) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
            ListRow(
                title: title(job),
                subtitle: job.statusLine,
                systemImage: symbol(job),
                tone: tone(job)
            ) {
                if job.state == UploadState.failed || job.state == UploadState.paused {
                    Button {
                        Task {
                            _ = await appState.uploadQueue.resume(id: job.id)
                            await reload()
                            await appState.refreshPendingUploads()
                        }
                    } label: {
                        Text("Try again")
                            .flowdText(FlowdFont.buttonCompact)
                            .foregroundStyle(FlowdColor.accent)
                            .frame(minHeight: FlowdLayout.hitTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(FlowdPressStyle())
                }
            }
            if job.state == UploadState.uploading || job.state == UploadState.queued {
                FlowdProgressBar(progress: job.progress, tone: FlowdTone.accent, height: 6, label: "Upload progress")
            }
        }
        .padding(.vertical, FlowdSpacing.xs)
        .padding(.horizontal, FlowdSpacing.md)
    }

    private func title(_ job: UploadJob) -> String {
        if let draft = appState.draftStore?.draft(id: job.draftId), !draft.title.isEmpty {
            return draft.title
        }
        return "Your take"
    }

    private func symbol(_ job: UploadJob) -> String {
        switch job.state {
        case .queued: return "clock"
        case .uploading: return "arrow.up.circle.fill"
        case .paused: return "pause.circle.fill"
        case .failed: return "exclamationmark.circle.fill"
        case .done: return "checkmark.circle.fill"
        }
    }

    private func tone(_ job: UploadJob) -> FlowdTone {
        switch job.state {
        case .queued, .uploading: return FlowdTone.info
        case .paused: return FlowdTone.neutral
        case .failed: return FlowdTone.ember
        case .done: return FlowdTone.mint
        }
    }

    private func reload() async {
        let pending: [UploadJob] = await appState.uploadQueue.pending()
        jobs = pending
        hasLoaded = true
    }
}

#Preview {
    NavigationStack {
        UploadQueueView()
    }
    .flowdPreviewEnvironment()
}
