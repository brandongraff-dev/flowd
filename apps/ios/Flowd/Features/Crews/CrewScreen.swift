import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct CrewScreen: View {
    let crewID: String?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.3.fill",
                title: "Crew",
                message: "To be built by ios-compete-grow. Members, crew bonus meter, activity, invite, leave; nil id is the creator's own crew; empty state links to discover."
            )
        }
        .flowdNavigationTitle("Crew", large: false)
    }
}

#Preview {
    NavigationStack {
        CrewScreen(crewID: nil)
    }
    .flowdPreviewEnvironment()
}
