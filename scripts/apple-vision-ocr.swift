#!/usr/bin/env swift

import Foundation
import ImageIO
import Vision

enum OcrLevel: String {
    case accurate
    case fast
}

struct Options {
    var imagePath: String = ""
    var level: OcrLevel = .accurate
    var languages: [String] = []
    var usesLanguageCorrection: Bool = true
    var minConfidence: Double = 0.0
    var emitObservations: Bool = true
}

func usage() -> String {
    [
        "Usage:",
        "  xcrun swift scripts/apple-vision-ocr.swift --image <path> [--level accurate|fast] [--languages en-US,es-ES] [--no-correction] [--min-confidence 0.0-1.0] [--no-observations]",
        "",
        "Output:",
        "  JSON to stdout: { meta, lines, observations? }",
    ].joined(separator: "\n")
}

func fail(_ message: String, exitCode: Int32 = 1) -> Never {
    fputs("error: \(message)\n", stderr)
    exit(exitCode)
}

func parseArgs(_ argv: [String]) -> Options {
    var options = Options()
    var i = 0

    func takeValue(_ name: String) -> String {
        let next = i + 1
        if next >= argv.count { fail("Missing value for \(name).") }
        i = next
        return argv[i]
    }

    while i < argv.count {
        let arg = argv[i]
        if arg == "--help" || arg == "-h" {
            print(usage())
            exit(0)
        }
        if arg == "--image" {
            options.imagePath = takeValue("--image")
        } else if arg.hasPrefix("--image=") {
            options.imagePath = String(arg.split(separator: "=", maxSplits: 1)[1])
        } else if arg == "--level" {
            let raw = takeValue("--level").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard let parsed = OcrLevel(rawValue: raw) else { fail("Invalid --level: \(raw)") }
            options.level = parsed
        } else if arg.hasPrefix("--level=") {
            let raw = String(arg.split(separator: "=", maxSplits: 1)[1]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard let parsed = OcrLevel(rawValue: raw) else { fail("Invalid --level: \(raw)") }
            options.level = parsed
        } else if arg == "--languages" || arg == "--langs" || arg == "--lang" {
            let raw = takeValue(arg)
            options.languages = raw
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        } else if arg.hasPrefix("--languages=") || arg.hasPrefix("--langs=") || arg.hasPrefix("--lang=") {
            let raw = String(arg.split(separator: "=", maxSplits: 1)[1])
            options.languages = raw
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        } else if arg == "--no-correction" {
            options.usesLanguageCorrection = false
        } else if arg == "--min-confidence" {
            let raw = takeValue("--min-confidence")
            guard let parsed = Double(raw), parsed >= 0.0, parsed <= 1.0 else {
                fail("Invalid --min-confidence: \(raw) (expected 0.0..1.0)")
            }
            options.minConfidence = parsed
        } else if arg.hasPrefix("--min-confidence=") {
            let raw = String(arg.split(separator: "=", maxSplits: 1)[1])
            guard let parsed = Double(raw), parsed >= 0.0, parsed <= 1.0 else {
                fail("Invalid --min-confidence: \(raw) (expected 0.0..1.0)")
            }
            options.minConfidence = parsed
        } else if arg == "--no-observations" {
            options.emitObservations = false
        } else if arg.hasPrefix("-") {
            fail("Unknown option: \(arg)")
        } else if options.imagePath.isEmpty {
            options.imagePath = arg
        } else {
            // Ignore extra positional args.
        }

        i += 1
    }

    if options.imagePath.isEmpty {
        fail("Image path is required.\n\n\(usage())")
    }

    return options
}

func loadCgImage(_ filePath: String) -> (cgImage: CGImage, width: Int, height: Int) {
    let url = URL(fileURLWithPath: filePath)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        fail("Failed to create image source: \(filePath)")
    }
    guard let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fail("Failed to decode image data: \(filePath)")
    }

    return (cgImage: cgImage, width: cgImage.width, height: cgImage.height)
}

func bboxToDict(_ rect: CGRect) -> [String: Any] {
    [
        "x": rect.origin.x,
        "y": rect.origin.y,
        "w": rect.size.width,
        "h": rect.size.height,
    ]
}

let options = parseArgs(Array(CommandLine.arguments.dropFirst()))
let startedAt = Date()

let url = URL(fileURLWithPath: options.imagePath)
let (cgImage, width, height) = loadCgImage(options.imagePath)

let request = VNRecognizeTextRequest()
request.recognitionLevel = (options.level == .accurate) ? .accurate : .fast
request.usesLanguageCorrection = options.usesLanguageCorrection
if !options.languages.isEmpty {
    request.recognitionLanguages = options.languages
}

// Prefer URL-based handler: it lets Vision handle decoding/orientation internally.
let handler = VNImageRequestHandler(url: url, options: [:])
do {
    try handler.perform([request])
} catch {
    fail("Vision OCR failed: \(String(describing: error))")
}

let results = request.results ?? []

struct Entry {
    let text: String
    let confidence: Float
    let bbox: CGRect
}

var entries: [Entry] = []
entries.reserveCapacity(results.count)

for obs in results {
    guard let candidate = obs.topCandidates(1).first else { continue }
    if Double(candidate.confidence) < options.minConfidence { continue }
    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty { continue }
    entries.append(Entry(text: text, confidence: candidate.confidence, bbox: obs.boundingBox))
}

// Vision returns observations unsorted; approximate reading order.
entries.sort { a, b in
    let ay = a.bbox.origin.y
    let by = b.bbox.origin.y
    if abs(ay - by) > 0.02 {
        return ay > by
    }
    return a.bbox.origin.x < b.bbox.origin.x
}

var lines: [String] = []
for entry in entries {
    for rawLine in entry.text.split(separator: "\n", omittingEmptySubsequences: true) {
        let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            lines.append(trimmed)
        }
    }
}

var meta: [String: Any] = [
    "engine": "apple-vision",
    "image_width": width,
    "image_height": height,
    "level": options.level.rawValue,
    "languages": options.languages,
    "uses_language_correction": options.usesLanguageCorrection,
    "min_confidence": options.minConfidence,
    "duration_ms": Int(Date().timeIntervalSince(startedAt) * 1000.0),
]

var payload: [String: Any] = [
    "meta": meta,
    "lines": lines,
]

if options.emitObservations {
    payload["observations"] = entries.map { entry in
        [
            "text": entry.text,
            "confidence": entry.confidence,
            "bbox": bboxToDict(entry.bbox),
        ] as [String: Any]
    }
}

do {
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.withoutEscapingSlashes])
    if let json = String(data: data, encoding: .utf8) {
        // Ensure trailing newline for easier piping.
        print(json)
    } else {
        fail("Failed to encode JSON output as UTF-8.")
    }
} catch {
    fail("Failed to serialize JSON: \(error.localizedDescription)")
}
