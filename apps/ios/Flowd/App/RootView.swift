import SwiftUI

/// Root of the view hierarchy. This is the launch placeholder: the app-shell work
/// replaces its body with onboarding / `TabShell` routing driven by `AppState`.
struct RootView: View {
    var body: some View {
        ZStack {
            backdrop
            wordmark
        }
    }

    private var backdrop: some View {
        LinearGradient(
            colors: [Color.indigo, Color.blue, Color.teal],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var wordmark: some View {
        VStack(spacing: 12) {
            Text("flowd")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(Color.white)
            Text("Get paid for the videos that move apps.")
                .font(.system(.body, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.85))
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    RootView()
        .environment(AppState())
}
