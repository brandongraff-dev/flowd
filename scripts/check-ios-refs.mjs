#!/usr/bin/env node
// A poor man's compiler front end for the iOS Core layer (there is no Swift compiler on the dev machines). It reads every Swift file under
// apps/ios and cross-checks the hand-written files against the declarations it finds, so the mistakes a compiler would catch first are caught here:
//
//   1. TYPE NAMES   every capitalised identifier used in code must be declared in the module or be a known SDK type;
//   2. MEMBER NAMES every `.member` (and implicit `.member`) must be declared somewhere in the module or be a known SDK member;
//   3. CALL LABELS  every call of a module function or initialiser must match the argument labels of at least one declaration
//                   (order, omitted defaulted parameters, trailing closures);
//   4. BALANCE      braces, parentheses and brackets balance in every file;
//   5. SWITCHES     (--switches) `switch` over a known enum without `default` must name every case.
//
//   node scripts/check-ios-refs.mjs                 check apps/ios/Flowd/Core, apps/ios/Shared and apps/ios/FlowdTests
//   node scripts/check-ios-refs.mjs --all           also check DesignSystem, App, Features and FlowdWidgets
//   node scripts/check-ios-refs.mjs --verbose       print every finding (default prints the first 40 per category)
//
// Exit code 1 when anything is reported. It is heuristic (no type inference), so it only reports what is certain enough to be wrong; the macOS CI job
// remains the compiler of record.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iosRoot = path.join(root, "apps/ios");
const checkAll = process.argv.includes("--all");
const verbose = process.argv.includes("--verbose");
const checkSwitches = process.argv.includes("--switches");

// ── files ─────────────────────────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "Fixtures" || e.name === "Assets.xcassets" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".swift")) out.push(p);
  }
  return out;
}
const allFiles = walk(iosRoot);
const rel = (p) => path.relative(iosRoot, p).replace(/\\/g, "/");
const GENERATED = (f) => /Core\/Models\/(Enums|Entities)[A-Za-z]*\.swift$/.test(f) || /Core\/Engine\/Constants\.swift$/.test(f) || /DesignSystem\/Tokens\.swift$/.test(f) || /FormulaVectorsData\.swift$/.test(f);
const inScope = (f) => {
  const r = rel(f);
  if (GENERATED(r)) return false;
  if (checkAll) return true;
  return r.startsWith("Flowd/Core/") || r.startsWith("Shared/") || r.startsWith("FlowdTests/");
};

// ── tokenizer: blank comments and string literal text, keep interpolation code ──────────────────────
function clean(src) {
  const n = src.length;
  const out = new Array(n);
  let i = 0;
  const put = (k, ch) => {
    out[k] = ch === "\n" ? "\n" : ch;
  };
  const blank = (k) => {
    out[k] = src[k] === "\n" ? "\n" : " ";
  };
  function scanString(start, hashes, multiline) {
    // start: index just after the opening quote(s)
    let k = start;
    const close = (multiline ? '"""' : '"') + "#".repeat(hashes);
    const interp = "\\" + "#".repeat(hashes) + "(";
    while (k < n) {
      if (src.startsWith(close, k)) {
        for (let j = 0; j < close.length; j += 1) blank(k + j);
        out[k] = "\""; // keep a visible closing quote so argument counts survive
        return k + close.length;
      }
      if (src.startsWith(interp, k)) {
        for (let j = 0; j < interp.length; j += 1) blank(k + j);
        k += interp.length;
        // copy code until the matching paren
        let depth = 1;
        while (k < n && depth > 0) {
          const c = src[k];
          if (c === "(") depth += 1;
          else if (c === ")") {
            depth -= 1;
            if (depth === 0) {
              blank(k);
              k += 1;
              break;
            }
          }
          if (c === '"') {
            // nested string inside interpolation
            put(k, " ");
            k = scanString(k + 1, 0, false);
            continue;
          }
          put(k, c);
          k += 1;
        }
        continue;
      }
      if (hashes === 0 && src[k] === "\\") {
        blank(k);
        if (k + 1 < n) blank(k + 1);
        k += 2;
        continue;
      }
      if (!multiline && src[k] === "\n") return k; // unterminated
      blank(k);
      k += 1;
    }
    return k;
  }
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") {
        blank(i);
        i += 1;
      }
    } else if (c === "/" && c2 === "*") {
      let depth = 1;
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") {
          depth += 1;
          blank(i);
          blank(i + 1);
          i += 2;
        } else if (src[i] === "*" && src[i + 1] === "/") {
          depth -= 1;
          blank(i);
          blank(i + 1);
          i += 2;
        } else {
          blank(i);
          i += 1;
        }
      }
    } else if (c === "#" && /^#+"/.test(src.slice(i, i + 6))) {
      const m = /^(#+)("""|")/.exec(src.slice(i, i + 8));
      const hashes = m[1].length;
      const multiline = m[2] === '"""';
      for (let j = 0; j < m[0].length; j += 1) blank(i + j);
      out[i + m[0].length - 1] = "\"";
      i = scanString(i + m[0].length, hashes, multiline);
    } else if (c === '"') {
      if (src.startsWith('"""', i)) {
        blank(i);
        blank(i + 1);
        out[i + 2] = "\"";
        i = scanString(i + 3, 0, true);
      } else {
        out[i] = "\"";
        i = scanString(i + 1, 0, false);
      }
    } else {
      put(i, c);
      i += 1;
    }
  }
  return out.join("");
}

// ── declarations ──────────────────────────────────────────────────────────────────────────────────
const typeNames = new Set();
const memberNames = new Set();
const funcDecls = new Map(); // name -> [{labels:[{label,hasDefault}], file}]
const initDecls = new Map(); // type -> [{...}]
const typeKind = new Map();
const enumCases = new Map(); // enum -> Set(case)
const staticNested = new Map();

function matchParen(s, openIdx, open = "(", close = ")") {
  let depth = 0;
  for (let k = openIdx; k < s.length; k += 1) {
    const c = s[k];
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let angle = 0;
  for (let k = 0; k < s.length; k += 1) {
    const c = s[k];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    // a generic argument list: `<` glued to a type name and followed by a type, never a comparison operator
    if (c === "<" && depth === 0 && /\w/.test(s[k - 1] ?? "") && /[A-Z\[(]/.test(s[k + 1] ?? "")) angle += 1;
    if (c === ">" && depth === 0 && s[k - 1] !== "-" && angle > 0) angle -= 1;
    if (c === "," && depth === 0 && angle === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

function parseParams(text) {
  const out = [];
  for (const raw of splitTop(text)) {
    const p = raw.trim();
    if (p === "") continue;
    const colon = (() => {
      let depth = 0;
      for (let k = 0; k < p.length; k += 1) {
        const c = p[k];
        if (c === "(" || c === "[" || c === "<") depth += 1;
        else if (c === ")" || c === "]" || c === ">") depth -= 1;
        else if (c === ":" && depth === 0) return k;
      }
      return -1;
    })();
    if (colon < 0) continue;
    const names = p.slice(0, colon).trim().split(/\s+/);
    const label = names[0] === "_" ? null : names[0];
    const hasDefault = /(^|[^=!<>])=(?!=)/.test(p.slice(colon + 1)) && true;
    const variadic = /\.\.\.\s*(=|$)/.test(p.slice(colon + 1).trim());
    out.push({ label, hasDefault, variadic });
  }
  return out;
}

const fileInfo = new Map();
for (const f of allFiles) {
  const src = fs.readFileSync(f, "utf8");
  const cl = clean(src);
  fileInfo.set(f, { src, cl });
}

// type declarations + members (all files, generated included, so references into them resolve)
for (const [f, { cl }] of fileInfo) {
  for (const m of cl.matchAll(/\b(struct|class|enum|actor|protocol|typealias|associatedtype)\s+([A-Za-z_]\w*)/g)) {
    typeNames.add(m[2]);
    if (m[1] !== "typealias") typeKind.set(m[2], m[1]);
  }
  for (const m of cl.matchAll(/\bcase[ \t]+([^\n:=]+?)(?:[ \t]*=[^\n]*)?$/gm)) {
    for (const nm of m[1].split(",")) {
      const t = nm.trim().replace(/`/g, "").replace(/\(.*$/, "");
      if (/^[A-Za-z_]\w*$/.test(t)) memberNames.add(t);
    }
  }
  for (const m of cl.matchAll(/\b(?:var|let)\s+`?([A-Za-z_]\w*)`?/g)) memberNames.add(m[1]);
  for (const m of cl.matchAll(/\bfunc\s+`?([A-Za-z_]\w*)`?/g)) memberNames.add(m[1]);
  for (const m of cl.matchAll(/\bcase\s+`?([A-Za-z_]\w*)`?\s*\(/g)) memberNames.add(m[1]);
  // tuple labels in type positions: (week: String, mark: Mark)
  for (const m of cl.matchAll(/[(,]\s*([a-z_]\w*)\s*:\s*[A-Z\[(]/g)) memberNames.add(m[1]);
}

// function and initialiser declarations (all files)
for (const [f, { cl }] of fileInfo) {
  for (const m of cl.matchAll(/\b(func|init)\s*`?([A-Za-z_]\w*)?`?\s*(?:<[^>(]*>)?\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(cl, open);
    if (close < 0) continue;
    const params = parseParams(cl.slice(open + 1, close));
    const name = m[1] === "init" ? "init" : m[2];
    if (m[1] === "init") {
      // owner type: nearest enclosing declaration
      const owner = ownerType(cl, m.index);
      if (!initDecls.has(owner)) initDecls.set(owner, []);
      initDecls.get(owner).push({ params, file: f });
    } else {
      if (!funcDecls.has(name)) funcDecls.set(name, []);
      funcDecls.get(name).push({ params, file: f });
    }
  }
}

// enum cases with payloads are constructor calls too: `case bounty(id: String)` is called as `.bounty(id: x)`
for (const [f, { cl }] of fileInfo) {
  for (const m of cl.matchAll(/\bcase\s+`?([A-Za-z_]\w*)`?\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(cl, open);
    if (close < 0) continue;
    const inner = cl.slice(open + 1, close);
    // enum payloads are `label: Type` or bare `Type`
    const params = splitTop(inner).map((raw) => {
      const p = raw.trim();
      const lm = /^([A-Za-z_]\w*)\s*:/.exec(p);
      return { label: lm ? lm[1] : null, hasDefault: false, variadic: false };
    });
    const name = m[1];
    if (!funcDecls.has(name)) funcDecls.set(name, []);
    funcDecls.get(name).push({ params, file: f, enumCase: true });
  }
}

function ownerType(cl, idx) {
  // walk back to find the enclosing type declaration by brace depth
  let depth = 0;
  for (let k = idx - 1; k >= 0; k -= 1) {
    const c = cl[k];
    if (c === "}") depth += 1;
    else if (c === "{") {
      if (depth === 0) {
        const head = cl.slice(Math.max(0, k - 300), k);
        const m = /\b(?:struct|class|enum|actor|extension|protocol)\s+([A-Za-z_][\w.]*)[^{}]*$/.exec(head);
        if (m) return m[1].split(".").pop();
        return "?";
      }
      depth -= 1;
    }
  }
  return "?";
}

// memberwise initialisers for structs without an explicit init
for (const [f, { cl }] of fileInfo) {
  for (const m of cl.matchAll(/\bstruct\s+([A-Za-z_]\w*)[^{\n]*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(cl, open, "{", "}");
    if (close < 0) continue;
    const body = cl.slice(open + 1, close);
    let depth = 0;
    const props = [];
    for (const line of body.split("\n")) {
      if (depth === 0) {
        const p = /^\s*(?:(?:public|internal|fileprivate|private)\s+)?(var|let)\s+`?([A-Za-z_]\w*)`?\s*:\s*([^=\n]+?)\s*(=.*)?$/.exec(line);
        if (p && !/\{\s*$/.test(line) && !/^\s*static\b/.test(line) && !/^\s*private\b/.test(line) && !/^\s*fileprivate\b/.test(line)) {
          props.push({ label: p[2], hasDefault: Boolean(p[4]) || (p[1] === "var" && /\?\s*$/.test(p[3].trim())), variadic: false, isLet: p[1] === "let" });
        } else {
          const p2 = /^\s*(var)\s+`?([A-Za-z_]\w*)`?\s*=\s*/.exec(line);
          if (p2 && !/^\s*static\b/.test(line)) props.push({ label: p2[2], hasDefault: true, variadic: false });
          const p3 = /^\s*(let)\s+`?([A-Za-z_]\w*)`?\s*=\s*/.exec(line);
          if (p3 && !/^\s*static\b/.test(line)) {
            /* a let with a default is not part of the memberwise init */
          }
        }
      }
      for (const ch of line) {
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }
    }
    const name = m[1];
    const hasExplicit = /\binit\s*\(/.test(body.replace(/\{[^{}]*\}/g, (s) => s)) && explicitInitInBody(body);
    if (!hasExplicit) {
      if (!initDecls.has(name)) initDecls.set(name, []);
      initDecls.get(name).push({ params: props, file: f, memberwise: true });
    }
  }
}
function explicitInitInBody(body) {
  // an `init(` at depth 0 of the struct body
  let depth = 0;
  for (const line of body.split("\n")) {
    if (depth === 0 && /^\s*(?:public |internal |fileprivate |private |convenience )*init\s*[(?<]/.test(line)) return true;
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
  }
  return false;
}

// enum cases for exhaustiveness
for (const [f, { cl }] of fileInfo) {
  for (const m of cl.matchAll(/\benum\s+([A-Za-z_]\w*)[^{\n]*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(cl, open, "{", "}");
    if (close < 0) continue;
    const body = cl.slice(open + 1, close);
    const cases = new Set();
    let depth = 0;
    for (const line of body.split("\n")) {
      if (depth === 0) {
        const c = /^\s*case\s+(.*)$/.exec(line);
        if (c) {
          for (const nm of splitTop(c[1].replace(/=\s*"[^"]*"/g, "").replace(/=\s*[^,]*/g, ""))) {
            const t = nm.trim().replace(/`/g, "").replace(/\(.*$/, "");
            if (/^[A-Za-z_]\w*$/.test(t)) cases.add(t);
          }
        }
      }
      for (const ch of line) {
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }
    }
    if (cases.size > 0) enumCases.set(m[1], cases);
  }
}

// ── SDK allowlists ────────────────────────────────────────────────────────────────────────────────
const SDK_TYPES = new Set(
  `Swift NSNotFound CharacterSet Flowd Attribute NSTemporaryDirectory CancellationError Security CFTypeRef OSStatus SecItemCopyMatching SecItemDelete SecItemAdd CFDictionary ActivityUIDismissalPolicy WidgetCenter Int Int8 Int16 Int32 Int64 UInt UInt8 UInt16 UInt32 UInt64 Double Float CGFloat Bool String Character Substring Data Date URL URLRequest URLResponse HTTPURLResponse URLSession URLSessionConfiguration URLError
   TimeInterval TimeZone Calendar Locale DateComponents NSLock NSRegularExpression NSRange NSString NSNumber NSError NSCache NSNull NSObject Bundle ProcessInfo FileManager UUID Decimal Array Dictionary Set Optional Result Never Void Any AnyObject AnyHashable Self
   Codable Decodable Encodable Hashable Equatable Comparable Identifiable Sendable CaseIterable RawRepresentable CodingKey Error LocalizedError CustomStringConvertible Sequence Collection IteratorProtocol AsyncSequence AsyncStream
   Decoder Encoder JSONDecoder JSONEncoder KeyedDecodingContainer SingleValueDecodingContainer UnkeyedDecodingContainer KeyedEncodingContainer SingleValueEncodingContainer DecodingError EncodingError
   Task TaskGroup ThrowingTaskGroup CheckedContinuation MainActor Actor Logger OSLog OSAllocatedUnfairLock
   SwiftUI View Color Image Text Font Binding State Environment ObservableObject Published Observable Observation Foundation Combine
   ActivityKit ActivityAttributes ActivityContent Activity ActivityState ActivityAuthorizationInfo ActivityUIAuthorizationInfo
   WidgetKit SwiftData Model ModelContext ModelContainer ModelConfiguration FetchDescriptor Predicate SortDescriptor Schema Query
   XCTest XCTestCase XCTAssert XCTAssertEqual XCTAssertTrue XCTAssertFalse XCTAssertNil XCTAssertNotNil XCTFail XCTUnwrap XCTSkip XCTSkipIf XCTSkipUnless XCTExpectFailure
   Mirror ObjectIdentifier DispatchQueue DispatchTime DispatchSemaphore OperationQueue Thread RunLoop Timer Notification NotificationCenter UserDefaults ISO8601DateFormatter DateFormatter NumberFormatter
   InputStream OutputStream FileHandle JSONSerialization PropertyListEncoder PropertyListDecoder ByteCountFormatter MeasurementFormatter Measurement
   Regex Duration ContinuousClock SuspendingClock Mutex Atomic StaticString UTF8 UTF16
   CGPoint CGSize CGRect UIImage UIColor`
    .split(/\s+/),
);
const SDK_MEMBERS = new Set(
  `reverse cachesDirectory SearchPathDirectory reloadIgnoringLocalCacheData badServerResponse infoDictionary RawValue addTask reloadAllTimelines end Options substring numberOfRanges escapedPattern uuidString ID dataCorruptedError init self Self super Type none some map flatMap compactMap filter reduce reversed sorted sort first last min max count isEmpty contains contains(where) allSatisfy firstIndex lastIndex append insert remove removeAll removeFirst removeLast removeLast dropFirst dropLast prefix suffix joined split
   keys values enumerated indices startIndex endIndex index forEach lazy shuffled randomElement popLast reserveCapacity swapAt formIndex
   hasPrefix hasSuffix lowercased uppercased capitalized trimmingCharacters replacingOccurrences components range characters utf8 utf16 unicodeScalars description debugDescription hash hashValue rawValue localizedDescription
   whitespacesAndNewlines whitespaces newlines decimalDigits letters alphanumerics
   rounded down up toNearestOrAwayFromZero towardZero awayFromZero toNearestOrEven pow abs isFinite isNaN isInfinite magnitude squareRoot sign truncatingRemainder
   timeIntervalSince1970 timeIntervalSince timeIntervalSinceNow addingTimeInterval distantPast distantFuture now
   secondsFromGMT current autoupdatingCurrent identifier abbreviation
   absoluteString path host scheme query fragment pathExtension lastPathComponent standardizedFileURL appendingPathComponent deletingLastPathComponent appendingPathExtension isFileURL absoluteURL baseURL relativePath
   data json encode decode decodeIfPresent encodeIfPresent container unkeyedContainer singleValueContainer nestedContainer codingPath debugDescription context underlyingError key valueNotFound typeMismatch dataCorrupted keyNotFound stringValue intValue doubleValue boolValue jsonObject gmt badURL Code temporaryDirectory
   keyDecodingStrategy dateDecodingStrategy keyEncodingStrategy dateEncodingStrategy outputFormatting convertFromSnakeCase convertToSnakeCase custom sortedKeys prettyPrinted withoutEscapingSlashes iso8601 deferredToDate secondsSince1970 millisecondsSince1970 useDefaultKeys
   shared default standard main bundleURL bundleIdentifier url resourceURL path processInfo systemUptime environment arguments
   success failure get isSuccess
   fixedWidth fraction
   isAtEnd decodeNil
   utf8CString withUnsafeBytes
   lock unlock trylock
   timeoutIntervalForRequest timeoutIntervalForResource waitsForConnectivity httpAdditionalHeaders requestCachePolicy urlCache ephemeral
   httpMethod httpBody setValue addValue value allHTTPHeaderFields statusCode allHeaderFields mimeType expectedContentLength textEncodingName
   notConnectedToInternet networkConnectionLost timedOut cancelled cannotFindHost cannotConnectToHost dnsLookupFailed internationalRoamingOff dataNotAllowed secureConnectionFailed code
   cacheDirectory applicationSupportDirectory documentDirectory userDomainMask createDirectory withIntermediateDirectories fileExists contentsOfDirectory removeItem attributesOfItem moveItem copyItem urls for in
   atomic mappedIfSafe completeFileProtection write
   unspecified userInitiated utility background high low medium
   isCancelled checkCancellation sleep nanoseconds seconds milliseconds yield detached
   makeIterator next makeAsyncIterator
   debug info notice error fault warning critical log
   public private sensitive auto
   sync async
   isoWeek
   increment decrement
   bitPattern
   ordered
   zero infinity pi nan greatestFiniteMagnitude leastNormalMagnitude
   isMultiple remainder quotientAndRemainder
   utf8View
   uppercase lowercase
   year month day hour minute second weekday
   components
   startOfDay date dateComponents
   ISO8601 iso8601
   store save fetch fetchCount delete insertedModelsArray
   container modelContext mainContext autosaveEnabled
   hasChanges
   isStoredInMemoryOnly
   groupContainerURL containerURL forSecurityApplicationGroupIdentifier
   suiteName
   removeObject set object string integer bool array dictionary double
   addingPercentEncoding removingPercentEncoding urlQueryAllowed urlPathAllowed
   queryItems name URLQueryItem URLComponents
   unwrap
   asyncAfter
   bytes
   encoding
   isoString
   mappedIfSafe
   sorted by
   padding
   index offsetBy limitedBy
   dictionaryLiteral
   description
   rawValue
   allCases
   mapValues compactMapValues filterKeys updateValue removeValue
   merging merge
   keys values
   first last
   firstMatch matches numberOfMatches range rangeAt replacementString stringByReplacingMatches
   withMatch
   capture
   pattern options caseInsensitive
   NSRegularExpression
   pointee
   store
   minimumIntegerDigits maximumFractionDigits numberStyle currencyCode
   negate
   byteCount
   totalSeconds
   attributes
   escapeRegex
   uniqueKeysWithValues grouping
   filteredLines
   unicodeScalar
   isLetter isNumber isWhitespace isPunctuation isLowercase isUppercase isNewline isASCII asciiValue wholeNumberValue isHexDigit hexDigitValue
   lowercaseString
   range upperBound lowerBound
   starts elementsEqual
   last first
   addTimeInterval
   count
   removeSubrange replaceSubrange
   unicode
   bitWidth
   max min
   addingReportingOverflow multipliedReportingOverflow
   clamp
   leftover
   utf8
   endIndex
   formUnion union intersection subtracting symmetricDifference isSubset isSuperset isDisjoint insert update subtract
   remainingCapacity
   isEmpty
   description`
    .split(/\s+/),
);

// SwiftUI / ActivityKit / SwiftData / XCTest / design system members that appear in files we check
const EXTRA_MEMBERS = new Set(
  `ultraThinMaterial thinMaterial regularMaterial widget system rounded monospaced foregroundStyle font padding frame background overlay opacity
   contentState attributes staleDate relevanceScore request update end start dismissalPolicy immediate default after ActivityContent pushToken pushType token activityStateUpdates activityUpdates contentUpdates areActivitiesEnabled frequentPushesEnabled activities activityID id
   active ended dismissed stale pending
   unique attribute externalStorage cascade nullify originalName
   persistentModelID
   isStoredInMemoryOnly allowsSave url groupContainer cloudKitDatabase
   predicate sortBy fetchLimit
   XCTAssertEqual
   record test measure expectation fulfill wait waitForExpectations fulfillment
   accuracy
   failed
   addTeardownBlock
   tearDown setUp setUpWithError tearDownWithError`
    .split(/\s+/),
);
const KNOWN_FUNCS = new Set(
  `end min max abs print pow round floor ceil sqrt String Int Double Float Bool Character Array Set Dictionary Data Date URL UUID Decimal stride zip repeatElement sequence type(of) withCheckedContinuation withCheckedThrowingContinuation withTaskGroup
   withThrowingTaskGroup withTaskCancellationHandler withUnsafeContinuation precondition preconditionFailure assert assertionFailure fatalError swap exit readLine isKnownUniquelyReferenced
   XCTAssert XCTAssertEqual XCTAssertNotEqual XCTAssertTrue XCTAssertFalse XCTAssertNil XCTAssertNotNil XCTAssertGreaterThan XCTAssertGreaterThanOrEqual XCTAssertLessThan XCTAssertLessThanOrEqual XCTAssertThrowsError XCTAssertNoThrow XCTFail XCTUnwrap XCTAssertEqualWithAccuracy XCTAssertIdentical XCTAssertNotIdentical XCTSkip
   Logger NSLock NSRegularExpression NSRange NSString ISO8601DateFormatter JSONDecoder JSONEncoder URLSession URLRequest URLComponents URLQueryItem DateFormatter DateComponents TimeZone Locale Calendar ProcessInfo
   Task AsyncStream Mirror`
    .split(/\s+/),
);

// ── scan hand-written files ───────────────────────────────────────────────────────────────────────
const findings = { balance: [], types: [], members: [], labels: [], switches: [], conformance: [] };
const KEYWORDS = new Set(
  `if else guard switch case default for while repeat do try catch throw throws rethrows return break continue fallthrough defer in is as let var func init deinit struct class enum protocol extension actor typealias associatedtype import where self Self super nil true false some any await async static final private fileprivate internal public open override mutating nonmutating lazy weak unowned inout subscript operator precedencegroup indirect convenience required optional dynamic nonisolated isolated consuming borrowing willSet didSet get set Any Type Protocol`.split(
    /\s+/,
  ),
);

function lineOf(text, idx) {
  let line = 1;
  for (let k = 0; k < idx; k += 1) if (text[k] === "\n") line += 1;
  return line;
}

for (const f of allFiles.filter(inScope)) {
  const { cl } = fileInfo.get(f);
  const r = rel(f);
  // balance
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let bad = null;
  for (let k = 0; k < cl.length; k += 1) {
    const c = cl[k];
    if (c === "(" || c === "[" || c === "{") stack.push([c, k]);
    else if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top[0] !== pairs[c]) {
        bad = `unmatched '${c}' at line ${lineOf(cl, k)}`;
        break;
      }
    }
  }
  if (!bad && stack.length > 0) bad = `unclosed '${stack[stack.length - 1][0]}' opened at line ${lineOf(cl, stack[stack.length - 1][1])}`;
  if (bad) findings.balance.push(`${r}: ${bad}`);

  // type names: capitalised identifiers not preceded by '.' and not declared
  const localTypeParams = new Set();
  for (const m of cl.matchAll(/<\s*([A-Z]\w*)\s*(?::[^>]*)?(?:,\s*([A-Z]\w*)\s*(?::[^>]*)?)*>/g)) {
    localTypeParams.add(m[1]);
    if (m[2]) localTypeParams.add(m[2]);
  }
  for (const m of cl.matchAll(/\b(?:func|struct|class|enum|actor|extension)\s+[A-Za-z_][\w.]*\s*<([^>]*)>/g)) {
    for (const part of m[1].split(",")) localTypeParams.add(part.trim().split(/[\s:]/)[0]);
  }
  const seenType = new Set();
  for (const m of cl.matchAll(/(?<![\w.])([A-Z][A-Za-z0-9_]*)\b/g)) {
    const name = m[1];
    if (seenType.has(name)) continue;
    if (typeNames.has(name) || SDK_TYPES.has(name) || KNOWN_FUNCS.has(name) || localTypeParams.has(name) || KEYWORDS.has(name)) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(name) && name.length <= 3) continue; // T, U, ID
    // an enum case or constant referenced bare inside its own enum is lowercase in Swift; capitalised bare names are types
    seenType.add(name);
    findings.types.push(`${r}:${lineOf(cl, m.index)}: unknown type or symbol "${name}"`);
  }

  // member names
  const seenMember = new Set();
  for (const m of cl.matchAll(/(?<![\w\d)\]}"])\s*\.\s*([A-Za-z_]\w*)\b/g)) {
    const name = m[1];
    if (/^\d/.test(name)) continue;
    // skip ranges like 0...5 or 1..<3 (handled by the lookbehind) and decimal numbers
    if (memberNames.has(name) || SDK_MEMBERS.has(name) || EXTRA_MEMBERS.has(name) || typeNames.has(name) || funcDecls.has(name)) continue;
    const key = `${r}|${name}`;
    if (seenMember.has(key)) continue;
    seenMember.add(key);
    findings.members.push(`${r}:${lineOf(cl, m.index)}: unknown member ".${name}"`);
  }
  for (const m of cl.matchAll(/(?<=[\w)\]}>?!])\s*\.\s*([A-Za-z_]\w*)\b/g)) {
    const name = m[1];
    if (memberNames.has(name) || SDK_MEMBERS.has(name) || EXTRA_MEMBERS.has(name) || typeNames.has(name) || funcDecls.has(name)) continue;
    const before = cl.slice(Math.max(0, m.index - 1), m.index + 1);
    if (/\d\s*\.\s*$/.test(before)) continue;
    const key = `${r}|${name}`;
    if (seenMember.has(key)) continue;
    seenMember.add(key);
    findings.members.push(`${r}:${lineOf(cl, m.index)}: unknown member ".${name}"`);
  }

  // call labels
  for (const m of cl.matchAll(/(?<![\w])([A-Za-z_]\w*)\s*\(/g)) {
    const name = m[1];
    if (KEYWORDS.has(name) && name !== "init") continue;
    const open = m.index + m[0].length - 1;
    // skip declarations
    const before = cl.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(func|init|case|subscript)\s*$/.test(before)) continue;
    const isType = /^[A-Z]/.test(name);
    let decls = null;
    if (isType) decls = initDecls.get(name);
    else decls = funcDecls.get(name);
    if (!decls || decls.length === 0) continue;
    if (!isType && (KNOWN_FUNCS.has(name) || SDK_MEMBERS.has(name))) continue; // could be an SDK overload
    if (isType && (SDK_TYPES.has(name) || enumCases.has(name) && typeKind.get(name) === "enum")) continue; // enum init(rawValue:) etc.
    const close = matchParen(cl, open);
    if (close < 0) continue;
    const argText = cl.slice(open + 1, close);
    const args = splitTop(argText).map((a) => a.trim()).filter((a) => a !== "");
    if (args.some((a) => /^(let|var)\b/.test(a) || /^[A-Za-z_]\w*\s*:\s*(let|var)\b/.test(a))) continue; // a pattern, not a call
    const callLabels = args.map((a) => {
      const lm = /^([A-Za-z_]\w*)\s*:(?!:)/.exec(a);
      return lm ? lm[1] : null;
    });
    // trailing closure after the paren?
    const after = cl.slice(close + 1, close + 6);
    const trailing = /^\s*\{/.test(after);
    let ok = false;
    for (const d of decls) {
      if (matches(callLabels, d.params, trailing)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      const sigs = decls.map((d) => "(" + d.params.map((p) => (p.label ?? "_") + ":" + (p.hasDefault ? "=" : "")).join(" ") + ")").slice(0, 3).join(" | ");
      findings.labels.push(`${r}:${lineOf(cl, m.index)}: ${name}(${callLabels.map((l) => (l ?? "_") + ":").join(" ")}) does not match ${sigs}`);
    }
  }

  // switch exhaustiveness (best effort)
  if (checkSwitches) {
    for (const m of cl.matchAll(/\bswitch\b[^{\n]*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchParen(cl, open, "{", "}");
      if (close < 0) continue;
      const body = cl.slice(open + 1, close).replace(/,[ \t]*\n[ \t]*/g, ", ");
      if (/(^|\n)\s*default\s*:/.test(body)) continue;
      const names = new Set();
      let depth = 0;
      for (const line of body.split("\n")) {
        if (depth === 0) {
          const c = /^\s*case\s+(.*?):\s*(?:\/\/.*)?(?:[^\n]*)$/.exec(line);
          if (c) for (const part of splitTop(c[1])) {
            const t = part.trim().replace(/\(.*$/, "");
            const mm = /^\.([A-Za-z_]\w*)$/.exec(t);
            if (mm) names.add(mm[1]);
            else if (/\blet\b|\bvar\b/.test(t)) {
              /* binding pattern */
            }
          }
        }
        for (const ch of line) {
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
        }
      }
      if (names.size < 2) continue;
      // find an enum that contains all named cases
      let best = null;
      for (const [en, cases] of enumCases) {
        if ([...names].every((nm) => cases.has(nm))) {
          if (!best || cases.size < enumCases.get(best).size) best = en;
        }
      }
      if (best) {
        const missing = [...enumCases.get(best)].filter((c) => !names.has(c));
        if (missing.length > 0) findings.switches.push(`${r}:${lineOf(cl, m.index)}: switch over ${best}? missing ${missing.join(", ")}`);
      }
    }
  }
}

// ── protocol conformance: every requirement of a module protocol must be declared by each conforming type ──
{
  const protocols = new Map(); // name -> { parents: [], funcs: [{name, labels}], vars: [name] }
  for (const [f, { cl }] of fileInfo) {
    for (const m of cl.matchAll(/\bprotocol\s+([A-Za-z_]\w*)\s*(?::\s*([^{]+))?\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchParen(cl, open, "{", "}");
      if (close < 0) continue;
      const body = cl.slice(open + 1, close);
      const parents = (m[2] ?? "").split(",").map((p) => p.trim()).filter((p) => p !== "");
      const funcs = [];
      const vars = [];
      let depth = 0;
      let idx = 0;
      for (const line of body.split("\n")) {
        if (depth === 0) {
          const fm = /^\s*(?:static\s+)?func\s+`?([A-Za-z_]\w*)`?\s*(?:<[^>(]*>)?\s*\(/.exec(line);
          if (fm) {
            const lineStart = body.indexOf(line, idx);
            const openIdx = lineStart + line.indexOf("(", fm.index + fm[0].length - 1);
            const closeIdx = matchParen(body, openIdx);
            const params = parseParams(body.slice(openIdx + 1, closeIdx));
            funcs.push({ name: fm[1], labels: params.map((p) => p.label ?? "_") });
          }
          const vm = /^\s*var\s+([A-Za-z_]\w*)\s*:[^{]*\{\s*get/.exec(line);
          if (vm) vars.push(vm[1]);
        }
        idx += line.length + 1;
        for (const ch of line) {
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
        }
      }
      protocols.set(m[1], { parents, funcs, vars });
    }
  }
  const flatten = (name, seen = new Set()) => {
    const p = protocols.get(name);
    if (!p || seen.has(name)) return { funcs: [], vars: [] };
    seen.add(name);
    let funcs = [...p.funcs];
    let vars = [...p.vars];
    for (const parent of p.parents) {
      const r = flatten(parent, seen);
      funcs = funcs.concat(r.funcs);
      vars = vars.concat(r.vars);
    }
    return { funcs, vars };
  };
  const conformers = new Map(); // type -> Set(protocol)
  for (const [f, { cl }] of fileInfo) {
    for (const m of cl.matchAll(/\b(?:struct|class|actor|enum|extension)\s+([A-Za-z_]\w*)\s*:\s*([^{\n]+)\{/g)) {
      for (const p of m[2].split(",").map((x) => x.trim().split(/\s+/)[0]).filter((x) => protocols.has(x))) {
        if (!conformers.has(m[1])) conformers.set(m[1], new Set());
        conformers.get(m[1]).add(p);
      }
    }
  }
  if (process.argv.includes("--debug")) for (const [t, set] of conformers) console.log("conformer", t, [...set].map((p) => p + ":" + flatten(p).funcs.length + "f").join(" "));
  for (const [type, set] of conformers) {
    const declared = new Map(); // name -> [labels]
    const declaredVars = new Set();
    for (const [f, { cl }] of fileInfo) {
      for (const m of cl.matchAll(/\bfunc\s+`?([A-Za-z_]\w*)`?\s*(?:<[^>(]*>)?\s*\(/g)) {
        if (ownerType(cl, m.index) !== type) continue;
        const open = m.index + m[0].length - 1;
        const close = matchParen(cl, open);
        if (close < 0) continue;
        const labels = parseParams(cl.slice(open + 1, close)).map((p) => p.label ?? "_");
        if (!declared.has(m[1])) declared.set(m[1], []);
        declared.get(m[1]).push(labels);
      }
      for (const m of cl.matchAll(/\b(?:var|let)\s+`?([A-Za-z_]\w*)`?/g)) {
        if (ownerType(cl, m.index) === type) declaredVars.add(m[1]);
      }
    }
    for (const protocol of set) {
      const { funcs, vars } = flatten(protocol);
      for (const req of funcs) {
        const have = declared.get(req.name) ?? [];
        if (!have.some((labels) => labels.length === req.labels.length && labels.every((l, i) => l === req.labels[i]))) {
          // protocol extensions may supply a default; look for one
          let hasDefault = false;
          for (const [f, { cl }] of fileInfo) {
            for (const m of cl.matchAll(/\bfunc\s+`?([A-Za-z_]\w*)`?\s*(?:<[^>(]*>)?\s*\(/g)) {
              if (m[1] !== req.name) continue;
              if (ownerType(cl, m.index) !== protocol && !flatten(protocol).funcs.length) continue;
              const owner = ownerType(cl, m.index);
              const inProtoFamily = owner === protocol || (protocols.get(protocol)?.parents ?? []).includes(owner);
              if (!inProtoFamily) continue;
              const open = m.index + m[0].length - 1;
              const labels = parseParams(cl.slice(open + 1, matchParen(cl, open))).map((p) => p.label ?? "_");
              if (labels.length === req.labels.length && labels.every((l, i) => l === req.labels[i])) hasDefault = true;
            }
          }
          if (!hasDefault) findings.conformance.push(`${type}: protocol ${protocol} requires ${req.name}(${req.labels.map((l) => l + ":").join("")}) but it is not declared (declared overloads: ${have.map((l) => "(" + l.map((x) => x + ":").join("") + ")").join(" ") || "none"})`);
        }
      }
      for (const v of vars) if (!declaredVars.has(v) && !declared.has(v)) findings.conformance.push(`${type}: protocol ${protocol} requires property ${v}`);
    }
  }
}

function matches(callLabels, params, trailing) {
  // Swift: arguments are matched to parameters in order; a parameter may be skipped only when it has a default (or is variadic);
  // an unlabeled argument matches a parameter without a label.
  let ci = 0;
  for (let pi = 0; pi < params.length; pi += 1) {
    const p = params[pi];
    if (ci < callLabels.length) {
      const want = callLabels[ci];
      if ((want ?? null) === (p.label ?? null)) {
        ci += 1;
        if (p.variadic) while (ci < callLabels.length && callLabels[ci] === null) ci += 1;
        continue;
      }
    }
    if (p.hasDefault || p.variadic) continue;
    if (trailing && pi >= params.length - 2) continue; // a trailing closure supplies the last required parameter(s)
    return false;
  }
  return ci === callLabels.length;
}

// ── report ────────────────────────────────────────────────────────────────────────────────────────
let total = 0;
for (const [kind, list] of Object.entries(findings)) {
  if (list.length === 0) continue;
  total += list.length;
  console.log(`\n== ${kind} (${list.length})`);
  for (const line of verbose ? list : list.slice(0, 60)) console.log("  " + line);
  if (!verbose && list.length > 60) console.log(`  ... ${list.length - 60} more (use --verbose)`);
}
const scanned = allFiles.filter(inScope).length;
console.log(`\ncheck-ios-refs: ${scanned} files scanned, ${typeNames.size} types, ${memberNames.size} member names, ${funcDecls.size} functions, ${initDecls.size} initialisers; ${total} finding(s)`);
process.exit(total > 0 ? 1 : 0);
