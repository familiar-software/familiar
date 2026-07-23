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
            url: "https://github.com/FluidInference/FluidAudio.git",
            exact: "0.15.5"
        )
    ],
    targets: [
        .executableTarget(
            name: "FamiliarSpeechHelper",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ]
        ),
        .testTarget(
            name: "FamiliarSpeechHelperTests",
            dependencies: ["FamiliarSpeechHelper"]
        )
    ]
)
