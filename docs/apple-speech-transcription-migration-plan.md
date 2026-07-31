# Apple Speech Transcription Migration Plan

## Status

- [x] Inspect the existing WhisperKit recording and transcription pipeline.
- [x] Confirm the target Apple APIs and macOS requirement.
- [x] Complete the Xcode 26 first-launch setup and establish a passing baseline.
- [x] Decide how Familiar should handle Hebrew, which SpeechTranscriber does not support.
- [x] Add tests for the Apple helper protocol and streamed result behavior.
- [x] Replace WhisperKit with Apple SpeechAnalyzer and native audio capture.
- [x] Remove WhisperKit assets, dependencies, configuration, and packaging.
- [x] Pass focused unit, integration, real-audio, and targeted end-to-end checks.
- [x] Pass the complete desktop-app verification suite.

Verification refreshed after merging current `main` on July 31, 2026:

- Desktop unit suite: 420 tests, 416 passed and 4 explicit real-audio skips.
- Unit performance guard: passed in 3.611 seconds.
- Complete Electron E2E suite: 41 passed, one explicit real-screen-content skip, and zero
  failures.
- Focused voice Electron E2E suite: 8/8 passed.
- Swift helper suite: 44 tests, 41 passed and 3 explicit hardware-integration skips.
- Real Apple analyzer concurrency and bundled offline FluidAudio model loading passed separately
  for arm64 and for the x86_64 helper path under Rosetta.

## Objective

Replace WhisperKit with Apple's on-device speech-to-text implementation while preserving
Familiar's existing user interface, recording controls, settings, transcript files, and
Node-side transcription event contract.

The completed implementation must prove that live and final speech transcription work
with real audio. A successful build or mocked protocol test is not sufficient.

## Capability Probe Results

Verified on July 11, 2026 with macOS 26.5.2 and Xcode 26.6 on the development Mac:

- `SpeechTranscriber.isAvailable` is `true`.
- The current `en-IL` locale resolves to `en-US`; its SpeechTranscriber asset is supported.
- `he-IL` resolves to `he-IL`, but it is absent from `SpeechTranscriber.supportedLocales`
  and its SpeechTranscriber asset status is `unsupported`.
- Requesting installation still creates a request, but `downloadAndInstall()` fails with
  `SFSpeechErrorDomain Code=1`: `transcription.he asset unavailable after attempted download`.
- Apple's on-device `DictationTranscriber` reports its `he-IL` asset as supported.
- The macOS 26.5 Speech SDK does not expose `AnalyzerInputConverter`; use
  `AVAudioConverter` to produce `SpeechAnalyzer.bestAvailableAudioFormat` instead.

`supportedLocales` is the complete set of locales whose assets are available to
`SpeechTranscriber`, not only the assets already installed on a Mac. `installedLocales` is the
installed subset. Installing Hebrew as a macOS display, keyboard, or Dictation language therefore
does not add Hebrew to `SpeechTranscriber`. The `supportedLocale(equivalentTo:)` result only shows
that the locale can be normalized; the failed `AssetInventory` installation proves that no Hebrew
`SpeechTranscriber` model is currently available.

Decision: use only `SpeechTranscriber` and do not offer Hebrew selection for now. Familiar maps the
user's current locale to an entry that is actually present in `SpeechTranscriber.supportedLocales`.
If no supported equivalent exists, meeting transcription is unavailable. Do not add
`DictationTranscriber`, retain WhisperKit for Hebrew, or keep the unshipped Hebrew setting.

## Constraints

- Keep the existing Audio settings and tray interactions substantially unchanged.
- Do not add a transcript-language setting while Familiar uses one SpeechTranscriber path.
- Map the user's current locale to a locale that is present in
  `SpeechTranscriber.supportedLocales`; do not trust locale normalization alone.
- Keep audio processing and transcription local after macOS has installed the required
  system-managed model asset.
- Do not retain WhisperKit as a fallback.
- Disable meeting recording for unsupported macOS versions, unavailable hardware/frameworks,
  unsupported locales, denied microphone permission, missing helper binaries, and model
  preparation failures. Starting through IPC or a keyboard shortcut must enforce the same gate.
- Xcode is a build-time requirement only. A user's Mac needs macOS 26 or newer and the packaged
  helper, but does not need Xcode installed.
- Do not accumulate a meeting-length raw PCM buffer in memory.
- Continue supporting named input devices, including virtual devices used by tests.
- Keep the application-wide macOS 14 deployment target unless a separate decision changes
  it. Gate the Apple transcription capability to macOS 26 or newer.
- Continue producing universal application packages. Determine SpeechTranscriber support
  at runtime before enabling transcription on a specific Mac.

## Existing Architecture to Preserve

The Electron main process owns the recording lifecycle. It launches
`familiar-speech-helper`, communicates with it using newline-delimited JSON, consumes
partial and final transcription events, and writes the transcript through the existing
transcript writer.

The provider-neutral event payload remains:

```text
text
isFinal
startedAtMs
endedAtMs
segments[]
  text
  startedAtMs
  endedAtMs
  words[]
```

The Swift implementation behind that boundary will change. The React interface and the
transcript writer should not need provider-specific logic.

## Target Native Architecture

### Apple speech engine

- Configure `SpeechTranscriber` for the resolved locale.
- Use volatile results for the live transcript.
- Request audio time-range attributes for timestamps.
- Do not enable the faster, lower-accuracy reporting option initially.
- Feed converted audio continuously into `SpeechAnalyzer`.
- Finish the input sequence and call `finalizeAndFinishThroughEndOfInput()` when recording
  stops so all remaining final text is delivered.
- Keep the runtime to one `SpeechTranscriber` and one `SpeechAnalyzer` per recording.
- Treat each result's `isFinal` value as authoritative and preserve the existing transcript
  writer's range-based partial replacement behavior.

### Model assets

- Ask `AssetInventory` for the configured modules' status during preparation.
- If the assets are already installed, continue without a download.
- If a supported asset is missing, let macOS download and install it during background
  preparation. Keep the recording action disabled until preparation completes.
- Treat missing network access as an explicit preparation failure only when an asset is not
  already installed.
- Recheck asset availability on each preparation because macOS may reclaim unused assets.

### Audio capture

- Replace WhisperKit's `AudioProcessor` with AVFoundation/CoreAudio.
- Enumerate input-capable CoreAudio devices and preserve the current matching behavior.
- Select the requested device on Familiar's audio unit without changing the user's system
  default device.
- Copy callback-owned audio buffers before asynchronous processing.
- Convert buffers with `AVAudioConverter` to the analyzer's preferred format.
- Serialize conversion and analyzer input through a bounded queue.
- Surface an explicit overload error rather than silently dropping audio or allowing
  unbounded memory growth.
- Preserve the existing timeout that detects a capture session receiving no samples.

### Source layout

Split the current helper entry point into focused files, keeping every source file below
the repository's 500-line limit:

- `HelperProtocol.swift`: typed commands, responses, and events.
- `SpeechLocaleResolver.swift`: current-locale to supported-locale resolution.
- `CoreAudioInputDevices.swift`: enumeration and selected-device resolution.
- `AudioCaptureEngine.swift`: AVAudioEngine lifecycle and sample delivery.
- `AudioBufferConverter.swift`: bounded conversion to the analyzer's format.
- `AppleSpeechRuntime.swift`: assets, analyzer lifecycle, and result consumption.
- `TranscriptionResultMapper.swift`: Apple attributed results to Familiar payloads.
- `SpeechService.swift`: runtime availability and command lifecycle.
- `main.swift`: thin command loop and lifecycle coordination.

Names may be adjusted if an existing repository abstraction already owns the responsibility.

## Implementation Sequence and Verification Gates

### Phase 0: Toolchain and baseline

1. Accept the Xcode 26 license and run its first-launch setup.
2. Record `xcodebuild -version`, the selected developer directory, and macOS version.
3. Inspect the actual uncommitted diff before modifying overlapping files.
4. Run the current focused meeting-recording unit and integration tests.
5. Build the current helper so failures introduced by the migration can be distinguished
   from pre-existing failures.

Baseline result: 37 focused tests passed, three opt-in real-audio tests were skipped, and
the current WhisperKit helper built successfully with Xcode 26.6.

Gate: Git, Swift builds, and the existing focused test suite run successfully, or every
pre-existing failure is recorded before implementation begins.

### Phase 1: Executable SpeechAnalyzer capability probe

1. Add the smallest testable Swift probe using the installed macOS 26 SDK.
2. Verify `SpeechTranscriber.isAvailable` on the development Mac.
3. Resolve the current locale and `he-IL` with `supportedLocale(equivalentTo:)`.
4. Check/install the needed asset and transcribe a deterministic supported-language fixture.
5. Record whether Intel supports the same module; do not infer this from OS version alone.

Gate: the current locale maps to an entry in `supportedLocales`, its asset installs, and real audio
produces non-empty expected text on the development Mac.

### Phase 2: Test the provider-neutral boundary first

Add or update tests for:

- preparation responses and installed-asset status;
- installed assets requiring no download;
- unsupported OS, hardware, locale, permission, and asset-preparation failures;
- availability state disabling the tray action and preventing IPC/shortcut starts;
- partial transcript replacement without duplicate file output;
- stop-time flush and finalization;
- timestamp ordering and conversion to milliseconds;
- runtime analyzer errors reaching the Node controller;
- repeated prepare/start/stop attempts producing explicit valid state transitions.

Gate: the new tests fail for the missing Apple behavior while unrelated existing tests stay
green.

### Phase 3: Implement the native helper

1. Introduce typed protocol and result structures.
2. Implement locale resolution and asset preparation.
3. Implement CoreAudio device enumeration and AVAudioEngine capture.
4. Implement bounded audio conversion and SpeechAnalyzer input.
5. Implement live and final result consumption.
6. Map results to the existing provider-neutral payload.
7. Implement orderly stop, flush, finalization, and process termination.
8. Remove replaced WhisperKit source logic rather than keeping parallel engines.

Verification after each meaningful step:

- build the Swift helper with zero warnings;
- build the universal helper;
- run Node speech-helper-client and transcript-writer tests;
- run the real-audio transcriber test once audio reaches SpeechAnalyzer.

Gate: a real supported-language fixture can flow through the built helper and produce the
expected final protocol event with segment and word timestamps.

### Phase 4: Integrate with the existing recording lifecycle

1. Replace WhisperKit model loading with an Apple capability preparation command. Apple model
   assets are system-managed, so recording can safely create a fresh prepared helper process.
2. Keep existing recording actions and transcript output unchanged; remove the unshipped Hebrew
   selector and its provider-specific settings.
3. Expose readiness and unavailable reasons through the existing recording status channels.
4. Let the helper launch below macOS 26 only to report that transcription is unavailable; never
   call macOS 26 Speech APIs there.
5. Preserve input-device discovery and selection behavior.

Gate: focused controller, shortcut, helper-client, and transcript-writer tests pass; the
targeted recording E2E test passes with its fake helper.

### Phase 5: Remove WhisperKit and shrink packaging

Remove:

- the Argmax/WhisperKit Swift package dependency and lockfile entries;
- bundled WhisperKit model directories and model build script;
- `FAMILIAR_WHISPERKIT_*` environment handling;
- WhisperKit model constants and windowing code;
- package scripts that build speech models;
- `extraResources` entries for WhisperKit models;
- tests and documentation that describe obsolete behavior.

Keep microphone usage descriptions and entitlements required by native capture.

Gate: repository searches find no active WhisperKit/Argmax references, and a packaged app
contains the native helper but no bundled speech model directory.

### Phase 6: End-to-end and resource verification

Run, at minimum:

1. Complete desktop-app unit test suite.
2. Focused and complete integration test suites.
3. Targeted Playwright audio/recording tests through `npm run test:e2e:target`.
4. Complete Playwright suite outside the sandbox.
5. Swift tests and universal helper build.
6. Real English audio transcription through the production helper binary.
7. Unsupported-locale capability test proving the recording action stays disabled.
8. Stop-during-speech test proving the final phrase is flushed once.
9. A 30-60 minute soak test measuring CPU and resident memory.
10. An unsigned local packaged-app smoke test, followed by a signed/notarized build check
    before release.

Gate: all required checks pass with zero warnings. Any check that cannot run must be listed
with the exact command, reason, and remaining risk.

## Acceptance Criteria

- Familiar's visible recording controls and transcript format remain substantially unchanged.
- No WhisperKit code, dependency, model asset, environment configuration, or fallback remains.
- The packaged app does not contain speech model weights.
- Installed Apple assets allow subsequent transcription without network connectivity.
- A supported-language real-audio test produces useful expected text.
- Unsupported Macs, locales, permissions, or unavailable assets show a disabled recording action
  and cannot start through other entry points.
- Partial transcript updates do not duplicate durable transcript text.
- Stopping captures all spoken text exactly once.
- Segment and word timestamps are monotonic and within the recording interval.
- Long recordings do not retain raw audio proportional to meeting duration.
- Input-device selection, including the virtual test device, still works.
- Permission, model, locale, device, analyzer, and overload failures are explicit.
- Focused tests pass throughout implementation, followed by all unit, integration, lint,
  and end-to-end checks.

## Working Rule

Update the status checklist in this file as phases complete. Do not mark a phase complete
based only on compilation or mocks when the phase claims real speech-to-text behavior.
