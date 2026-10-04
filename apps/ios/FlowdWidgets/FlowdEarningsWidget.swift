import SwiftUI
import WidgetKit

/// Timeline entry for the earnings widget. Placeholder content until the app group
/// cache (`group.app.flowd.creator`) feeds it real wallet numbers.
struct FlowdEarningsEntry: TimelineEntry {
    let date: Date
}

struct FlowdEarningsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FlowdEarningsEntry {
        FlowdEarningsEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (FlowdEarningsEntry) -> Void) {
        completion(FlowdEarningsEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FlowdEarningsEntry>) -> Void) {
        let entry = FlowdEarningsEntry(date: Date())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct FlowdEarningsWidgetView: View {
    let entry: FlowdEarningsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("flowd")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(Color.white)
            Text("Your earnings, live.")
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .accessibilityElement(children: .combine)
    }
}

struct FlowdEarningsWidget: Widget {
    let kind: String = "FlowdEarningsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FlowdEarningsProvider()) { entry in
            FlowdEarningsWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(
                        colors: [Color.indigo, Color.blue, Color.teal],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
        }
        .configurationDisplayName("Earnings")
        .description("Your flowd earnings at a glance.")
        .supportedFamilies([.systemSmall])
    }
}

#Preview {
    FlowdEarningsWidgetView(entry: FlowdEarningsEntry(date: Date()))
        .padding()
        .frame(width: 170, height: 170)
        .background(Color.indigo)
}
