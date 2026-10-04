import Foundation

// Text helpers used by hook scoring, auto-QA and the brief helpers. Pure and locale-independent. Mirrors apps/web/src/lib/engine/text.ts.

/// A tiny cache around NSRegularExpression so a pattern is compiled once. A pattern that fails to compile never crashes: it simply never matches.
enum Rx {
    private static let lock: NSLock = NSLock()
    private static var cache: [String: NSRegularExpression] = [:]

    static func regex(_ pattern: String, caseInsensitive: Bool = false) -> NSRegularExpression? {
        let key: String = (caseInsensitive ? "i:" : "s:") + pattern
        lock.lock()
        defer { lock.unlock() }
        if let cached = cache[key] {
            return cached
        }
        let options: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
        guard let compiled = try? NSRegularExpression(pattern: pattern, options: options) else {
            return nil
        }
        cache[key] = compiled
        return compiled
    }

    /// True when the pattern matches anywhere in `text`.
    static func test(_ pattern: String, in text: String, caseInsensitive: Bool = false) -> Bool {
        guard let compiled = regex(pattern, caseInsensitive: caseInsensitive) else {
            return false
        }
        let range: NSRange = NSRange(location: 0, length: (text as NSString).length)
        return compiled.firstMatch(in: text, options: [], range: range) != nil
    }

    /// True when any of the patterns match.
    static func testAny(_ patterns: [String], in text: String, caseInsensitive: Bool = false) -> Bool {
        for pattern in patterns {
            if test(pattern, in: text, caseInsensitive: caseInsensitive) {
                return true
            }
        }
        return false
    }

    /// The text of every match of the pattern.
    static func matches(_ pattern: String, in text: String, caseInsensitive: Bool = false) -> [String] {
        guard let compiled = regex(pattern, caseInsensitive: caseInsensitive) else {
            return []
        }
        let ns: NSString = text as NSString
        let range: NSRange = NSRange(location: 0, length: ns.length)
        var out: [String] = []
        for match in compiled.matches(in: text, options: [], range: range) {
            out.append(ns.substring(with: match.range))
        }
        return out
    }

    /// The first capture group (1) of the first match, when there is one.
    static func firstGroup(_ pattern: String, in text: String, caseInsensitive: Bool = false) -> String? {
        guard let compiled = regex(pattern, caseInsensitive: caseInsensitive) else {
            return nil
        }
        let ns: NSString = text as NSString
        let range: NSRange = NSRange(location: 0, length: ns.length)
        guard let match = compiled.firstMatch(in: text, options: [], range: range), match.numberOfRanges > 1 else {
            return nil
        }
        let group: NSRange = match.range(at: 1)
        guard group.location != NSNotFound else {
            return nil
        }
        return ns.substring(with: group)
    }

    /// Replaces every match with `template`.
    static func replace(_ pattern: String, in text: String, with template: String, caseInsensitive: Bool = false) -> String {
        guard let compiled = regex(pattern, caseInsensitive: caseInsensitive) else {
            return text
        }
        let range: NSRange = NSRange(location: 0, length: (text as NSString).length)
        return compiled.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: template)
    }
}

enum TextTools {
    /// Lower-cases, turns curly quotes and dashes into plain ones and collapses whitespace. Keeps # and digits.
    static func normalize(_ text: String) -> String {
        var t: String = text.lowercased()
        t = t.replacingOccurrences(of: "\u{2018}", with: "'")
        t = t.replacingOccurrences(of: "\u{2019}", with: "'")
        t = t.replacingOccurrences(of: "\u{02BC}", with: "'")
        t = t.replacingOccurrences(of: "\u{201C}", with: "\"")
        t = t.replacingOccurrences(of: "\u{201D}", with: "\"")
        t = t.replacingOccurrences(of: "\u{2013}", with: "-")
        t = t.replacingOccurrences(of: "\u{2014}", with: "-")
        let parts: [String] = t.components(separatedBy: CharacterSet.whitespacesAndNewlines).filter { (part: String) -> Bool in
            return !part.isEmpty
        }
        return parts.joined(separator: " ")
    }

    /// Word tokens: letters, digits, apostrophes inside words, and a leading # for hashtags.
    static func tokenize(_ text: String) -> [String] {
        return Rx.matches(#"#?[a-z0-9]+(?:'[a-z0-9]+)*"#, in: normalize(text))
    }

    static func wordCount(_ text: String) -> Int {
        return tokenize(text).count
    }

    private static let stopWords: Set<String> = [
        "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "is", "are", "was", "were", "be", "it",
        "this", "that", "these", "those", "so", "just", "really", "very", "i", "you", "my", "your", "me", "we", "our", "as", "by"
    ]

    /// Tokens without common function words; used to compare what is said with what is shown.
    static func contentTokens(_ text: String) -> [String] {
        return tokenize(text).filter { (token: String) -> Bool in
            return !stopWords.contains(token)
        }
    }

    /// Jaccard similarity of two token sets, 0...1. Two empty sets are 0 (nothing to compare).
    static func jaccard(_ a: [String], _ b: [String]) -> Double {
        if a.isEmpty || b.isEmpty {
            return 0
        }
        let sa: Set<String> = Set(a)
        let sb: Set<String> = Set(b)
        let inter: Int = sa.intersection(sb).count
        return Double(inter) / Double(sa.count + sb.count - inter)
    }

    /// Share of `needle` tokens that appear in `haystack`, 0...1. Order-insensitive.
    static func containment(_ needle: [String], _ haystack: [String]) -> Double {
        if needle.isEmpty {
            return 0
        }
        let hs: Set<String> = Set(haystack)
        var hit: Int = 0
        for token in needle where hs.contains(token) {
            hit += 1
        }
        return Double(hit) / Double(needle.count)
    }

    /// How closely on-screen text mirrors a spoken line, 0...1: the larger of Jaccard and containment of the shorter one's content words in the
    /// longer one. A burned-in caption that shortens the spoken line still counts as a mirror.
    static func textParity(spoken: String, onscreen: String) -> Double {
        let a: [String] = contentTokens(spoken)
        let b: [String] = contentTokens(onscreen)
        if a.isEmpty || b.isEmpty {
            return 0
        }
        let shorter: [String] = a.count <= b.count ? a : b
        let longer: [String] = a.count <= b.count ? b : a
        return max(jaccard(a, b), containment(shorter, longer))
    }

    static func escapeRegex(_ text: String) -> String {
        return NSRegularExpression.escapedPattern(for: text)
    }

    /// Case-insensitive whole-phrase search. Returns the first matching phrase and its character index, or nil.
    static func findPhrase(in text: String, phrases: [String]) -> (phrase: String, index: Int)? {
        let hay: String = normalize(text)
        var best: (phrase: String, index: Int)? = nil
        for phrase in phrases {
            let p: String = normalize(phrase)
            if p.isEmpty {
                continue
            }
            let pattern: String = "(^|[^a-z0-9#])" + escapeRegex(p) + "(?![a-z0-9])"
            guard let compiled = Rx.regex(pattern) else {
                continue
            }
            let ns: NSString = hay as NSString
            let range: NSRange = NSRange(location: 0, length: ns.length)
            if let match = compiled.firstMatch(in: hay, options: [], range: range) {
                let lead: Int = match.numberOfRanges > 1 && match.range(at: 1).location != NSNotFound ? match.range(at: 1).length : 0
                let index: Int = match.range.location + lead
                if let current = best {
                    if index < current.index {
                        best = (phrase: phrase, index: index)
                    }
                } else {
                    best = (phrase: phrase, index: index)
                }
            }
        }
        return best
    }

    /// Every phrase from the list that occurs in the text (whole phrase, case-insensitive).
    static func findPhrases(in text: String, phrases: [String]) -> [String] {
        return phrases.filter { (phrase: String) -> Bool in
            return findPhrase(in: text, phrases: [phrase]) != nil
        }
    }

    /// URL-safe slug: lower-case, a-z0-9 and single hyphens.
    static func slugify(_ text: String) -> String {
        var t: String = normalize(text)
        t = t.replacingOccurrences(of: "&", with: " and ")
        t = Rx.replace("[^a-z0-9]+", in: t, with: "-")
        t = Rx.replace("^-+|-+$", in: t, with: "")
        return t
    }

    /// Uppercases the first character.
    static func capitalize(_ text: String) -> String {
        guard let first = text.first else {
            return text
        }
        return String(first).uppercased() + text.dropFirst()
    }

    // MARK: Calls to action

    /// The distinct things a call to action can ask for. Several phrasings of the same ask ("link in bio" or "search the App Store") are one.
    enum CtaObjective: String, Hashable, Sendable {
        case getTheApp = "get_the_app"
        case follow
        case engage
        case visitSite = "visit_site"
    }

    private static let ctaPatterns: [(CtaObjective, String)] = [
        (.getTheApp, #"\b(?:download|install|get (?:the|it|our|my|this)?\s*(?:app|it)|grab (?:it|the app)|try (?:it|\w+)?\s*(?:free|for free|today|now|out)|start (?:your |a )?(?:free )?trial|claim (?:your|a|the)|sign up|use (?:my |the |our )?code|code [a-z0-9-]{3,}|link in (?:my |the )?bio|tap the link|click the link|search (?:for )?(?:it |the app |\w+ )?(?:in|on) the app store|available on the app store)\b"#),
        (.follow, #"\b(?:follow (?:me|us|for)|subscribe to (?:my|our)|hit follow)\b"#),
        (.engage, #"\b(?:like (?:this|and|&)|comment (?:below|\w+)|share (?:this|it|with)|tag a friend|save this)\b"#),
        (.visitSite, #"\b(?:visit (?:our|my|the)?\s*(?:site|website)|go to [a-z0-9.-]+\.[a-z]{2,}|check out [a-z0-9.-]+\.[a-z]{2,})\b"#)
    ]

    /// The distinct calls to action a line of copy makes. More than one means the CTA is unclear.
    static func callsToAction(_ text: String) -> [CtaObjective] {
        var out: [CtaObjective] = []
        for (objective, pattern) in ctaPatterns {
            if Rx.test(pattern, in: text, caseInsensitive: true) {
                out.append(objective)
            }
        }
        return out
    }
}
