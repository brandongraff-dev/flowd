import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct LessonView: View {
    let slug: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "book.fill",
                title: "Lesson",
                message: "To be built by ios-compete-grow. 5-minute cards, three-question quiz, badge award, next lesson, offline cache."
            )
        }
        .flowdNavigationTitle("Lesson", large: false)
    }
}

#Preview {
    NavigationStack {
        LessonView(slug: "first-video-in-15-minutes")
    }
    .flowdPreviewEnvironment()
}
