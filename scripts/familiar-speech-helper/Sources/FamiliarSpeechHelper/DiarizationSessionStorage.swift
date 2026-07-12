import Foundation

let staleDiarizationSessionAge: TimeInterval = 24 * 60 * 60

func prepareDiarizationProcessingRoot(_ requestedRoot: URL) throws -> URL {
    let fileManager = FileManager.default
    let temporaryRoot = fileManager.temporaryDirectory.standardizedFileURL
    let processingRoot = requestedRoot.standardizedFileURL
    let temporaryPathPrefix = temporaryRoot.path.hasSuffix("/")
        ? temporaryRoot.path
        : "\(temporaryRoot.path)/"
    guard processingRoot.path.hasPrefix(temporaryPathPrefix) else {
        throw HelperError.message(
            "Diarization processing must stay inside the system temporary directory."
        )
    }

    let relativePath = processingRoot.path.dropFirst(temporaryPathPrefix.count)
    let components = relativePath.split(separator: "/").map(String.init)
    guard !components.isEmpty else {
        throw HelperError.message("Diarization processing requires a private subdirectory.")
    }

    var currentURL = temporaryRoot
    for component in components {
        currentURL.appendPathComponent(component, isDirectory: true)
        try preparePrivateDirectory(currentURL, fileManager: fileManager)
    }
    return processingRoot
}

func removeStaleDiarizationSessions(
    processingRoot: URL = defaultDiarizationProcessingRoot(),
    olderThan maximumAge: TimeInterval = staleDiarizationSessionAge,
    now: Date = Date()
) throws -> Int {
    guard maximumAge > 0 else {
        throw HelperError.message("Diarization stale-session age must be positive.")
    }
    let fileManager = FileManager.default
    let processingRoot = try prepareDiarizationProcessingRoot(processingRoot)
    let resourceKeys: Set<URLResourceKey> = [
        .contentModificationDateKey,
        .isDirectoryKey,
        .isSymbolicLinkKey,
    ]
    let entries = try fileManager.contentsOfDirectory(
        at: processingRoot,
        includingPropertiesForKeys: Array(resourceKeys),
        options: []
    )
    var removedCount = 0
    for entry in entries {
        guard UUID(uuidString: entry.lastPathComponent) != nil else {
            continue
        }
        let values = try entry.resourceValues(forKeys: resourceKeys)
        guard values.isSymbolicLink != true,
              values.isDirectory == true,
              let modificationDate = values.contentModificationDate,
              now.timeIntervalSince(modificationDate) >= maximumAge else {
            continue
        }
        guard entry.deletingLastPathComponent().standardizedFileURL == processingRoot else {
            throw HelperError.message(
                "Refusing to clean a stale session outside the diarization root."
            )
        }
        try fileManager.removeItem(at: entry)
        removedCount += 1
    }
    return removedCount
}

private func preparePrivateDirectory(
    _ directoryURL: URL,
    fileManager: FileManager
) throws {
    if (try? fileManager.destinationOfSymbolicLink(atPath: directoryURL.path)) != nil {
        throw HelperError.message(
            "Refusing to use a symbolic link for diarization processing."
        )
    }
    var isDirectory: ObjCBool = false
    if fileManager.fileExists(atPath: directoryURL.path, isDirectory: &isDirectory) {
        guard isDirectory.boolValue else {
            throw HelperError.message("Diarization processing path is not a directory.")
        }
    } else {
        try fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
    }
    try fileManager.setAttributes(
        [.posixPermissions: 0o700],
        ofItemAtPath: directoryURL.path
    )
}
