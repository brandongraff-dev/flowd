import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct WrappedView: View {
    let period: WrappedPeriod
    @Environment(\.dismiss) private var dismiss: DismissAction

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Wrapped", isLarge: false, trailing: { FlowdIconButton(systemImage: "xmark", label: "Close") { dismiss() } })
            EmptyStateView(
                systemImage: "gift.fill",
                title: "Wrapped",
                message: "To be built by ios-wallet-widgets. 8 to 10 segmented stories, hold to pause, tap to advance, share card, month and year."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    WrappedView(period: .month)
        .flowdPreviewEnvironment()
}
