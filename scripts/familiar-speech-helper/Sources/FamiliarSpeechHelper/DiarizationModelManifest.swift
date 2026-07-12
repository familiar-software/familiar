import CryptoKit
import Foundation

private let diarizationManifestFilename = "fluid-audio-model-manifest.json"

private struct BundledDiarizationModelManifest: Decodable {
    let schemaVersion: Int
    let localDirectory: String
    let files: [BundledDiarizationModelFile]
}

private struct BundledDiarizationModelFile: Decodable {
    let path: String
    let size: Int
    let sha256: String
}

enum DiarizationModelValidationError: Error, LocalizedError {
    case invalidManifest(details: String)
    case missingFile(path: String)
    case symbolicLink(path: String)
    case invalidFileType(path: String)
    case invalidSize(path: String, expected: Int, actual: Int)
    case invalidHash(path: String)
    case unexpectedFiles(paths: [String])

    var errorDescription: String? {
        switch self {
        case .invalidManifest(let details):
            return "The FluidAudio model manifest is invalid: \(details)"
        case .missingFile(let path):
            return "The FluidAudio model bundle is missing \(path)."
        case .symbolicLink(let path):
            return "The FluidAudio model bundle contains a symbolic link: \(path)."
        case .invalidFileType(let path):
            return "The FluidAudio model asset is not a regular file: \(path)."
        case .invalidSize(let path, let expected, let actual):
            return "FluidAudio model \(path) has \(actual) bytes; expected \(expected)."
        case .invalidHash(let path):
            return "FluidAudio model \(path) failed SHA-256 validation."
        case .unexpectedFiles(let paths):
            return "The FluidAudio model bundle contains unexpected files: " +
                paths.joined(separator: ", ")
        }
    }
}

func validateBundledDiarizationModels(at bundleRoot: URL) throws {
    let manifestURL = bundleRoot.appendingPathComponent(diarizationManifestFilename)
    let manifestData = try Data(contentsOf: manifestURL)
    let manifest = try JSONDecoder().decode(
        BundledDiarizationModelManifest.self,
        from: manifestData
    )
    guard manifest.schemaVersion == 1 else {
        throw DiarizationModelValidationError.invalidManifest(
            details: "unsupported schemaVersion \(manifest.schemaVersion)"
        )
    }
    guard let directoryComponents = safeRelativePathComponents(manifest.localDirectory),
          directoryComponents.count == 1 else {
        throw DiarizationModelValidationError.invalidManifest(
            details: "unsafe local directory \(manifest.localDirectory)"
        )
    }
    guard !manifest.files.isEmpty else {
        throw DiarizationModelValidationError.invalidManifest(details: "no model files")
    }

    let modelRoot = bundleRoot.appendingPathComponent(
        manifest.localDirectory,
        isDirectory: true
    )
    try validateDirectory(modelRoot, displayPath: manifest.localDirectory)
    var expectedPaths = Set<String>()
    for file in manifest.files {
        guard let components = safeRelativePathComponents(file.path) else {
            throw DiarizationModelValidationError.invalidManifest(
                details: "unsafe model path \(file.path)"
            )
        }
        guard expectedPaths.insert(file.path).inserted else {
            throw DiarizationModelValidationError.invalidManifest(
                details: "duplicate model path \(file.path)"
            )
        }
        try validateModelFile(file, components: components, modelRoot: modelRoot)
    }

    let unexpectedPaths = try modelFilePaths(in: modelRoot).subtracting(expectedPaths).sorted()
    guard unexpectedPaths.isEmpty else {
        throw DiarizationModelValidationError.unexpectedFiles(paths: unexpectedPaths)
    }
}

private func safeRelativePathComponents(_ path: String) -> [String]? {
    guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\") else {
        return nil
    }
    let components = path.split(
        separator: "/",
        omittingEmptySubsequences: false
    ).map(String.init)
    guard components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
        return nil
    }
    return components
}

private func validateDirectory(_ url: URL, displayPath: String) throws {
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw DiarizationModelValidationError.missingFile(path: displayPath)
    }
    let values = try url.resourceValues(forKeys: [
        .isDirectoryKey,
        .isSymbolicLinkKey,
    ])
    if values.isSymbolicLink == true {
        throw DiarizationModelValidationError.symbolicLink(path: displayPath)
    }
    guard values.isDirectory == true else {
        throw DiarizationModelValidationError.invalidFileType(path: displayPath)
    }
}

private func validateModelFile(
    _ file: BundledDiarizationModelFile,
    components: [String],
    modelRoot: URL
) throws {
    let hashRange = file.sha256.range(
        of: "^[a-f0-9]{64}$",
        options: .regularExpression
    )
    guard file.size >= 0, hashRange != nil else {
        throw DiarizationModelValidationError.invalidManifest(
            details: "invalid metadata for \(file.path)"
        )
    }
    var fileURL = modelRoot
    for component in components {
        fileURL.appendPathComponent(component)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw DiarizationModelValidationError.missingFile(path: file.path)
        }
        let values = try fileURL.resourceValues(forKeys: [.isSymbolicLinkKey])
        if values.isSymbolicLink == true {
            throw DiarizationModelValidationError.symbolicLink(path: file.path)
        }
    }

    let values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard values.isRegularFile == true else {
        throw DiarizationModelValidationError.invalidFileType(path: file.path)
    }
    let actualSize = values.fileSize ?? -1
    guard actualSize == file.size else {
        throw DiarizationModelValidationError.invalidSize(
            path: file.path,
            expected: file.size,
            actual: actualSize
        )
    }
    guard try sha256Hex(at: fileURL) == file.sha256 else {
        throw DiarizationModelValidationError.invalidHash(path: file.path)
    }
}

private func modelFilePaths(in modelRoot: URL) throws -> Set<String> {
    let resolvedRoot = modelRoot.resolvingSymlinksInPath()
    guard let enumerator = FileManager.default.enumerator(
        at: resolvedRoot,
        includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
        options: []
    ) else {
        throw DiarizationModelValidationError.invalidFileType(path: modelRoot.path)
    }
    let rootPrefix = resolvedRoot.path + "/"
    var paths = Set<String>()
    for case let url as URL in enumerator {
        let values = try url.resourceValues(forKeys: [
            .isRegularFileKey,
            .isSymbolicLinkKey,
        ])
        guard values.isRegularFile == true || values.isSymbolicLink == true else {
            continue
        }
        let resolvedURL = url.resolvingSymlinksInPath()
        guard resolvedURL.path.hasPrefix(rootPrefix) else {
            throw DiarizationModelValidationError.symbolicLink(path: resolvedURL.path)
        }
        paths.insert(String(resolvedURL.path.dropFirst(rootPrefix.count)))
    }
    return paths
}

private func sha256Hex(at url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer {
        do {
            try handle.close()
        } catch {
            writeDiagnostic("Failed to close model asset after validation: \(error)")
        }
    }
    var hasher = SHA256()
    while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty {
        hasher.update(data: data)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}
