import SwiftUI

// Sibling glass belongs in ONE container: glass cannot sample other glass, so neighbouring glass in different containers renders
// inconsistently. On iOS 26 the container also blends nearby shapes and morphs them when views enter or leave inside an animation.
// Before iOS 26 it is a pass-through. Keep the number of containers on screen small, and never wrap scrolling rows.

/// Groups sibling glass so it samples together, blends and can morph (iOS 26). Pass-through before iOS 26.
/// `spacing` is the distance at which neighbouring glass shapes merge: equal to the inner stack spacing keeps them apart at rest;
/// larger fuses them into one liquid shape.
struct FlowdGlassContainer<Content: View>: View {
    private let spacing: CGFloat?
    private let content: Content

    init(spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) {
                content
            }
        } else {
            content
        }
    }
}

// MARK: - Morph helpers

extension View {
    /// Morph identity inside a `FlowdGlassContainer`. iOS 26: `glassEffectID`. Before: `matchedGeometryEffect`.
    /// Change state inside `withAnimation` or nothing morphs. All participating views share one `@Namespace`.
    @ViewBuilder
    func flowdGlassID<ID: Hashable & Sendable>(_ id: ID, in namespace: Namespace.ID) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffectID(id, in: namespace)
        } else {
            self.matchedGeometryEffect(id: id, in: namespace)
        }
    }

    /// Several views contribute to one glass shape at rest (iOS 26). No-op before iOS 26.
    @ViewBuilder
    func flowdGlassUnion<ID: Hashable & Sendable>(id: ID, namespace: Namespace.ID) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffectUnion(id: id, namespace: namespace)
        } else {
            self
        }
    }

    /// Scale + fade for glass views that enter or leave a cluster (iOS 26 uses the native glass transition).
    @ViewBuilder
    func flowdMorphTransition() -> some View {
        if #available(iOS 26.0, *) {
            self
        } else {
            self.transition(AnyTransition.scale(scale: 0.6).combined(with: AnyTransition.opacity))
        }
    }
}

// MARK: - Preview

private struct GlassMorphPreview: View {
    @State private var isOpen: Bool = false
    @Namespace private var namespace

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.xl) {
                FlowdGlassContainer(spacing: 18) {
                    HStack(spacing: 18) {
                        if isOpen {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(FlowdColor.fg)
                                .frame(width: 56, height: 56)
                                .flowdGlassCircle(interactive: true)
                                .flowdGlassID("camera", in: namespace)
                                .flowdMorphTransition()
                        }
                        Image(systemName: isOpen ? "xmark" : "plus")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(FlowdColor.fg)
                            .frame(width: 56, height: 56)
                            .flowdGlassCircle(interactive: true)
                            .flowdGlassID("toggle", in: namespace)
                    }
                }
                Button(isOpen ? "Close" : "Open") {
                    withAnimation(FlowdMotion.snappy) { isOpen.toggle() }
                }
                .buttonStyle(FlowdGlassButtonStyle(.secondary))
            }
            .padding(FlowdSpacing.xl)
        }
    }
}

#Preview("Glass container morph") {
    GlassMorphPreview()
}
