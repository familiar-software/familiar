// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "FamiliarSpeechHelper",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "familiar-speech-helper",
            targets: ["FamiliarSpeechHelper"]
        )
    ],
    targets: [
        .executableTarget(
            name: "FamiliarSpeechHelper",
            dependencies: []
        )
    ]
)
