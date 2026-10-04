// Shared naming rules for the iOS model generator (scripts/gen-ios-models.mjs) and the drift checker
// (scripts/check-ios-models.mjs). Zero dependencies. Keep this file the single place where a contract name
// differs from its Swift name.

/** Contract type name -> Swift type name, for names that would shadow a SwiftUI / Foundation / ObjC symbol. */
export const TYPE_RENAMES = {
  App: "BrandApp", // SwiftUI.App
  Visibility: "BountyVisibility", // SwiftUI.Visibility
  Notification: "AppNotification", // Foundation.Notification
  Category: "AppCategory", // ObjectiveC.Category typedef, and "category" is the app category everywhere in the contract
};

/** Swift names that must never be declared by the models (frameworks the app imports). Used by the generator as a guard. */
export const FRAMEWORK_SYMBOLS = new Set(
  (
    "App Scene View Text Image Label Section Group Form List Menu Toggle Slider Stepper Picker Link Button Color Font Shape Path Spacer " +
    "Divider Visibility Layout Alignment Edge Animation Transaction Binding State Environment Namespace Gesture Toolbar Tab TabView Table " +
    "Gauge ProgressView Canvas Material ColorScheme DynamicTypeSize LayoutDirection ScenePhase Capsule Circle Rectangle Ellipse Angle " +
    "Notification Date Data URL Calendar Locale Measurement Operation Process Progress Thread Timer Bundle Decimal Formatter Scanner Set " +
    "Result Error Optional Never Range Array Dictionary String Character Substring Sequence Collection Identifiable Hashable Codable " +
    "Duration Mirror Regex Chart AxisMarks BarMark LineMark Query Schema ModelContext Model Observable Activity ActivityState " +
    "ActivityContent Category Method Protocol Selector Class Object Item Entry Task Job Action Event Message Session Context " +
    "Result Value Key Index Element Iterator Slice Self Type Any Void Bool Int Double Float UInt Unit Sendable Equatable Comparable " +
    "Encodable Decodable CaseIterable Error Logger OSLog UUID TimeZone IndexSet CharacterSet NSObject Predicate SortDescriptor"
  ).split(/\s+/),
);

/** The Swift name of a contract type. */
export const swiftTypeName = (name) => TYPE_RENAMES[name] ?? name;

/**
 * Foundation's JSONDecoder.KeyDecodingStrategy.convertFromSnakeCase, reimplemented: the first component is lowercased,
 * every following component is capitalized (first letter upper, the rest lower), leading/trailing underscores kept,
 * a key without an inner underscore is left untouched.
 */
export function camelFromSnake(key) {
  if (key.length === 0) return key;
  const first = [...key].findIndex((c) => c !== "_");
  if (first === -1) return key;
  let last = key.length - 1;
  while (last > first && key[last] === "_") last -= 1;
  const lead = key.slice(0, first);
  const trail = key.slice(last + 1);
  const body = key.slice(first, last + 1);
  const parts = body.split("_").filter((p) => p.length > 0);
  if (parts.length === 1) return lead + body + trail;
  const capitalized = (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  return lead + parts[0].toLowerCase() + parts.slice(1).map(capitalized).join("") + trail;
}

/** Swift keywords that need backticks when used as an identifier in a declaration. */
export const SWIFT_KEYWORDS = new Set(
  (
    "associatedtype class deinit enum extension fileprivate func import init inout internal let operator private precedencegroup protocol " +
    "public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in " +
    "repeat return throw switch where while Any as await false is nil super self Self throws true try Type"
  ).split(/\s+/),
);

/** Escape an identifier for a declaration. */
export const ident = (name) => (SWIFT_KEYWORDS.has(name) ? "`" + name + "`" : name);

/** Enum value (snake_case or code) -> Swift case name. Special cases keep names safe from `none`/`open` ambiguity and from keywords. */
const CASE_OVERRIDES = {
  "MmpKind.none": "noMmp",
  "TaxStatus.none": "notStarted",
};
export function caseName(enumName, value) {
  const override = CASE_OVERRIDES[`${enumName}.${value}`];
  if (override) return override;
  const camel = camelFromSnake(value.toLowerCase());
  // Country codes and score bands are upper-case in JSON; the case name is lower-case ("us", "a").
  return ident(camel);
}
