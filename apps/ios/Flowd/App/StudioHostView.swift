import SwiftUI
import Observation

// The Studio full-screen cover. It is a presentation of its own (`Route.studio`), with its own `NavigationStack` driven by `StudioRouter`, so the
// capture and edit agents share one navigation vocabulary (`StudioRoute`) and one state carrier (the draft, `DraftSnapshot`, in `DraftStore`).
//
//   launcher -> formatPicker -> script -> capture -> hookCoach -> takeReview -> edit -> (captions, silenceCut, screenOverlay) -> score
//            -> preflight -> (variants) -> submit
//
// Inside the cover a Studio view reaches:
//   @Environment(StudioRouter.self) private var studio     push(_:), pop(), popToRoot(), replaceTop(with:), chosenHook
//   @Environment(Router.self) private var router            router.dismissStudio() to close; router.open(...) for sheets and other screens
// Sheets opened with `router.open(...)` while the cover is up are hosted by the cover (see `Router.present`).

/// Navigation inside the Studio cover.
@MainActor
@Observable
final class StudioRouter {
    /// The steps pushed on top of the launcher, oldest first.
    var path: [StudioRoute]
    let entry: StudioEntry
    /// The hook the creator chose in the hook library sheet; the script step reads it and sets it back to nil.
    var chosenHook: String?

    init(entry: StudioEntry, path: [StudioRoute] = []) {
        self.entry = entry
        self.path = path
        self.chosenHook = nil
    }

    func push(_ route: StudioRoute) {
        path.append(route)
    }

    func pop() {
        if !path.isEmpty {
            path.removeLast()
        }
    }

    func popToRoot() {
        path.removeAll()
    }

    /// Replaces the top step (for example capture to takeReview without leaving a back stack of retakes).
    func replaceTop(with route: StudioRoute) {
        if path.isEmpty {
            path = [route]
        } else {
            path[path.count - 1] = route
        }
    }

    /// Replaces the whole stack above the launcher.
    func replacePath(_ routes: [StudioRoute]) {
        path = routes
    }
}

struct StudioHostView: View {
    let entry: StudioEntry
    @State private var studio: StudioRouter

    /// `draft` is the stored draft for `.resume` entries (the cover looks it up so the right step is on screen on the first frame).
    init(entry: StudioEntry, draft: DraftSnapshot? = nil) {
        self.entry = entry
        _studio = State(initialValue: StudioRouter(entry: entry, path: entry.initialPath(draft: draft)))
    }

    var body: some View {
        @Bindable var studio = studio
        NavigationStack(path: $studio.path) {
            ScreenRegistry.studioRoot(entry: entry)
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: StudioRoute.self) { (route: StudioRoute) in
                    ScreenRegistry.studioView(for: route)
                        .toolbar(.hidden, for: .navigationBar)
                }
        }
        .environment(studio)
        .modifier(CoverSheetHost())
        .flowdToastHost()
        .flowdRoot()
    }
}

#Preview {
    StudioHostView(entry: StudioEntry.launcher)
        .flowdPreviewEnvironment()
}
