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
    dependencies: [
        .package(
            url: "https://github.com/argmaxinc/argmax-oss-swift.git",
            exact: "1.0.0"
        )
    ],
    targets: [
        .executableTarget(
            name: "FamiliarSpeechHelper",
            dependencies: [
                .product(name: "WhisperKit", package: "argmax-oss-swift")
            ]
        )
    ]
)
