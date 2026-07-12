import Foundation

func bundledDiarizationModelDirectory(
    executableURL: URL = URL(fileURLWithPath: CommandLine.arguments[0])
) -> URL {
    executableURL.standardizedFileURL
        .deletingLastPathComponent()
        .appendingPathComponent("fluid-audio-models", isDirectory: true)
}
