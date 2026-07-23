# FluidAudio Offline Diarization Implementation Plan

## Status

- [x] Inspect the current Apple SpeechTranscriber capture and transcript pipeline.
- [x] Select FluidAudio's offline diarization pipeline as the initial local diarizer.
- [x] Define automatic microphone-versus-system-audio source detection.
- [x] Complete the FluidAudio dependency, model, universal-build, and resource spike.
- [x] Add behavior-first tests for speaker alignment and final transcript replacement.
- [x] Implement shared-microphone diarization for nearby conversations.
- [x] Prove concurrent microphone and system-audio transcription is viable.
- [x] Implement source-separated system-audio capture and diarization.
- [x] Replace manual profiles with automatic source selection and echo deduplication.
- [x] Add automatic-capture capability gating and model attribution.
- [x] Add finalization progress and stale-session cleanup.
- [ ] Pass focused, real-audio, end-to-end, packaging, and soak verification.
- [x] Pass the complete desktop-app verification suite.

## Objective

Add fully local speaker diarization behind Familiar's existing recording and transcript workflow.
Keep Apple's `SpeechTranscriber` as the speech-to-text engine and use FluidAudio's
`OfflineDiarizerManager` after capture stops to determine who spoke when.

Support both recording situations without asking the user to select one:

1. **Nearby conversation:** the Mac's selected microphone hears every person in the room.
2. **Online meeting:** the local user speaks through the microphone while remote participants
   arrive through Mac system audio.

The recording action, keyboard shortcut, and transcript location remain unchanged. Every recording
captures microphone and Mac audio separately. Finalized system-audio speech determines which track
FluidAudio diarizes. The internal helper protocol carries readiness, progress, automatic source
metadata, and final-replacement fields, but no capture-profile setting.

This plan extends the completed Apple migration described in
[`apple-speech-transcription-migration-plan.md`](apple-speech-transcription-migration-plan.md).
It does not replace Apple speech-to-text with FluidAudio ASR.

## Confirmed Product Decision

Automatic capture requires a continuous ScreenCaptureKit system-audio stream. On July 12, 2026,
the product accepted the expected macOS recording privacy indicator while voice recording is
active, overriding the timer-only indicator decision for this audio workflow.

Screen Recording permission is therefore required for every voice recording. Familiar does not
silently fall back to microphone-only capture when system audio is unavailable.

## Starting Baseline

The starting helper had several useful boundaries that should be preserved:

- `AudioCaptureEngine` captures one selected CoreAudio microphone through
  `AVAudioEngine.inputNode`.
- `AppleSpeechRuntime` sends converted microphone buffers to one `SpeechAnalyzer` and emits live
  and final Apple results.
- `TranscriptionResultMapper` already produces word-level start and end timestamps.
- The Node helper client already normalizes `speaker` and `speakerId` on transcript segments.
- The transcript writer already renders labeled segments as `Speaker: text`.
- The transcript writer currently appends final Apple events as they arrive. A later complete
  diarized result would therefore duplicate text unless final replacement is added.
- The helper does not capture direct Mac system audio. Remote participants using headphones are
  absent from the current recording and cannot be diarized.
- The app packages a universal `arm64` and `x86_64` helper and gates Apple transcription to macOS
  26 at runtime.

## Implemented Capture Slices

As of July 12, 2026, the working tree implements one automatic capture path:

- FluidAudio `0.15.5` is pinned at `19600a485baa4998812e4654b70d2bab8f2c9949`;
  `Package.resolved` is included in this change.
- The 21 model files are pinned at `1ed7a662fdc7109e36d822db793ee6eebdaf8594`
  and total 21,599,417 bytes.
- Build-time and runtime checks reject missing, changed, extra, or symlinked model files. Runtime
  downloading is disabled.
- Microphone and Mac-audio buffers each feed Apple transcription and a private 16 kHz mono CAF
  recording. On stop, finalized system-audio words select exactly one FluidAudio input. Apple
  words are aligned by time overlap, and the writer atomically replaces live text with
  deterministic speaker segments.
- The release helper builds for `arm64` and `x86_64`; the reviewed universal helper is 16,211,584
  bytes with FluidAudio 0.15.5.
- A real M1/BlackHole test separates Samantha and Rishi, and a complementary test keeps Samantha
  as exactly one speaker. A real offline model-load test reports no download attempt.
- Separate microphone and ScreenCaptureKit analyzers run on one host clock. If Mac audio contains
  finalized speech, microphone words are labeled `You`, matching time-aligned echo words are
  removed, Mac audio is diarized, and both timelines are merged. Otherwise the microphone track is
  diarized as a nearby conversation.
- Audio settings describe the automatic voice source without exposing a source selector. Missing
  system-audio permission or capability disables voice recording with its concrete reason.
- Live Apple results identify their physical source as `Microphone` or `Mac audio`. If Apple
  finalization, FluidAudio diarization, or final replacement fails, Familiar removes the stale live
  block, preserves source-labeled finalized text, and reports the recording as failed.
- Final transcript metadata records `microphone` or `system-audio` as the automatically detected
  source of other voices.
- FluidAudio and model attribution are packaged under `third-party/`.

Concurrent analyzers pass on this Mac, and system-audio behavior passes focused and E2E tests.
A real packaged ScreenCaptureKit/TCC run, source-separated hardware fixture, long-recording tests,
Intel inference, and packaged offline smoke remain open.

Automatic-source verification on July 12, 2026:

- Swift: 41 tests, 38 passed and 3 explicit real-integration skips; focused automatic and
  system-audio transcript tests passed 8/8.
- Desktop unit suite: 414 tests, 410 passed and 4 explicit real-audio skips; the timed guard passed
  in 9.40 seconds on its final standalone run.
- Targeted Electron integration: 15/15 passed for Audio settings, meeting recording, and settings.
- Complete Electron integration: 41 passed and one existing real-screen-content test skipped.
- Real integrations: concurrent Apple analyzers passed; bundled FluidAudio models loaded locally
  with no download.
- Universal helper: `arm64` and `x86_64`, strict code-sign verification passed, 15,718,656 bytes.

PR review verification on July 19, 2026:

- Desktop unit suite: 419 tests, 415 passed and 4 explicit real-audio skips.
- Focused Electron integration: 15/15 passed for Audio settings and meeting recording.
- FluidAudio 0.15.5 loaded the complete bundled model set in offline mode with no download.
- Unsigned arm64 app packaging passed. The app was 349 MB unpacked; its 16,211,584-byte speech
  helper contained `arm64` and `x86_64`, both with a macOS 14 minimum and SDK 26.5.
- Strict deep code-sign verification passed with the local ad-hoc signature. The packaged Info.plist
  contained microphone and Screen Recording descriptions, all 22 model-bundle files matched, and
  no WhisperKit or BlackHole resources were present.
- Signed/notarized release verification, Intel FluidAudio inference, real source-separated capture,
  and long-duration soak measurements remain open.

## Architecture Decisions

### Keep transcription and diarization separate

- Apple `SpeechTranscriber` remains responsible for words and word timestamps.
- FluidAudio is responsible only for anonymous speaker time ranges.
- Familiar aligns Apple words to FluidAudio time ranges after recording stops.
- Do not introduce FluidAudio ASR, streaming diarization, or speaker recognition in this work.
- Speaker labels are session-local. `Speaker 1` in one recording has no relationship to
  `Speaker 1` in another recording.

### Detect the source automatically

Do not infer meeting intent from application names, window titles, raw volume, or language-specific
keywords. Capture both sources and use finalized Apple system-audio words as the typed signal:

| Detected result | Evidence | FluidAudio input | Speaker treatment |
| --- | --- | --- | --- |
| Nearby conversation | No finalized system-audio words | Microphone | `Speaker N` |
| Mac-audio conversation | System words | Mac audio | Mic: `You`; Mac: `Speaker N` |

The existing start and stop controls remain unchanged, with all copy in the microcopy module.

### Use offline diarization

- Use `OfflineDiarizerManager`, not FluidAudio's streaming diarizers.
- Keep `exclusiveSegments` enabled so each Apple word resolves to at most one diarized speaker.
- Leave speaker count automatic unless a future user-facing requirement supplies an exact count.
- Use FluidAudio Community-1's `0.6` clustering threshold; meaningful one- and two-speaker
  real-audio turns must pass. Retune only against a broader labeled fixture set.
- Run FluidAudio only after Apple analyzers have finalized and released active inference work.
  This minimizes contention and avoids provisional speaker labels changing during capture.

### Bundle only the required diarization model assets

The initial model strategy is build-time bundling, not a runtime download:

- Bundle only the four required compiled model directories and `plda-parameters.json` (21 files),
  plus the integrity manifest.
- The official repository reported 21,599,417 bytes for those files on July 12, 2026. Measure the
  resulting compressed DMG, installed app, helper, and loaded resident memory separately.
- Store a checked-in manifest containing the model revision, source URLs, file sizes, and SHA-256
  hashes. Keep downloaded model binaries generated and out of Git.
- Add a build script that downloads missing assets from the official FluidInference model
  repository, validates every hash, and is a no-op when the validated set already exists.
- Package the validated directory beside `familiar-speech-helper` and resolve it relative to the
  helper executable. Inject an explicit model path in tests; do not add path fallbacks.
- Validate the complete asset manifest before calling `OfflineDiarizerModels.load(from:)`.
- Do not call `OfflineDiarizerManager.prepareModels()` in production because it may download at
  runtime. Prove in a network-disabled packaged-app test that validated bundled assets load.
- If any asset is missing or corrupt, mark diarization unavailable and disable recording. Do not
  silently produce an unlabeled transcript as a successful result.

FluidAudio's SDK is Apache-2.0 and the selected model is CC-BY-4.0. Package the Apache license and
the model's source, license URI, revision, parent-model attribution, and modification notice.

### Pin and audit the dependency

- Use exact FluidAudio `0.15.5`, released July 7, 2026, after it satisfied the repository's
  seven-day dependency-age rule. It includes deterministic offline re-clustering, compute-unit
  handling, cancellation, and progress fixes relevant to this pipeline.
- Pin revision `19600a485baa4998812e4654b70d2bab8f2c9949` in `Package.resolved`.
- FluidAudio `0.15.5` uses Swift tools 6.0 and has no external Swift package dependency. Its library
  target links only FluidAudio's local `FastClusterWrapper` and `MachTaskSelfWrapper` targets.
- The universal helper is 16,211,584 bytes; the models add 21,599,417 bytes before packaging.
- Track the upstream SwiftPM warning for undeclared `benchmark.md`; do not fork solely to hide it.
- Do not fork FluidAudio, copy selected source files, or remove dependency targets unless a later
  explicit architecture decision approves maintaining that code.

## Automatic Audio Flow

```text
selected microphone ----> Apple SpeechAnalyzer A --> microphone words
                    `---> 16 kHz mono recorder A

Mac system audio -------> Apple SpeechAnalyzer B --> system-audio words
                    `---> 16 kHz mono recorder B

finalized system-audio words?
  |-- no --> FluidAudio recorder A --> nearby `Speaker N` transcript
  `-- yes -> FluidAudio recorder B --> remove matching mic echo
                                  --> mic `You` + system `Speaker N` transcript

selected words + speaker ranges --> atomic final replacement
```

When no system speech is recognized, every person heard by the microphone is anonymous. Do not
assume which diarized cluster is the Mac owner. When system speech is recognized, microphone words
are `You` and system-audio speakers receive deterministic `Speaker N` labels. Keep the sources
separate because mixing them makes simultaneous speech and source attribution ambiguous.

An opt-in production-session test now proves that two Apple analyzers can run concurrently on this
Mac. Long-duration CPU, memory, energy, quality, and stop-latency measurements remain required
before release; failure of those gates requires a new explicit architecture decision.

## Capture and Timeline Design

### Microphone capture

- Keep named CoreAudio input-device selection.
- Extend captured buffers to retain `AVAudioTime`; the current tap discards it.
- Continue copying callback-owned buffers before asynchronous processing.
- Preserve bounded queues and fail explicitly if either transcription or recording cannot keep up.

### System-audio capture

- Add a focused `SystemAudioCaptureEngine` using ScreenCaptureKit.
- Capture audio only; do not add a screen-video output.
- Exclude Familiar's own process audio.
- Convert ScreenCaptureKit sample buffers into owned `AVAudioPCMBuffer` values before handing them
  to asynchronous work.
- Stop the system stream immediately when the user stops recording, before offline processing.
- Verify Screen Recording permission and TCC attribution for both the development helper and the
  signed packaged app. Existing Electron permission is not proof that a child helper can capture.
- If system audio lacks permission or a usable stream, disable automatic voice recording and show
  the existing guided permission flow. Never substitute microphone-only recording.

### Common clock

Both source analyzers and the diarization file must use one recording timeline:

- Establish a monotonic session origin before starting either source.
- Preserve microphone host time and ScreenCaptureKit presentation timestamps.
- Record each source's first-sample offset from the session origin.
- Offset Apple word ranges and FluidAudio segments into that shared timeline before merging.
- Test startup skew, different source sample rates, conversion rounding, pauses, and stop-time
  flushes. Timestamp drift must not accumulate with recording duration.

### Disk-backed diarization input

- Write both sources until final system-audio speech results determine which source needs
  diarization. Run FluidAudio on exactly one finalized track and delete both afterward.
- Convert incrementally to 16 kHz mono Float32 raw PCM, FluidAudio's native input format.
- At Float32, each diarization track is approximately 230.4 MB per hour. Automatic capture retains
  two tracks temporarily, so the current upper bound is 460.8 MB per recorded hour plus small fixed
  metadata.
- Implement a Familiar-owned file-backed `AudioSampleSource` so FluidAudio reads chunks without
  materializing a meeting-length `[Float]` and without creating a second converted raw copy.
- Keep text and timestamp accumulators in memory; never retain meeting-length PCM in memory.

Store temporary audio under one dedicated app-owned processing root with a random session
directory and restrictive file permissions. On every success, error, cancellation, or process
shutdown, close handles before deleting the session directory.

Startup cleanup must only remove stale directories beneath that exact processing root. It must
reject symlinks, resolve and verify the canonical path, enforce an age threshold, and have unit,
integration, and end-to-end deletion tests. It must never traverse the context folder or touch a
transcript.

## Transcript and Speaker Alignment

### Accumulation

- Add a typed transcript accumulator per audio source.
- Preserve every final Apple word and its exact text and timestamps.
- Continue emitting current live transcription events during capture.
- Do not use live text as the source of truth for final speaker alignment.

### Assignment

For each Apple word on a diarized source:

1. Find FluidAudio segments with positive time overlap.
2. Select the segment with the greatest overlap duration.
3. Resolve equal overlaps deterministically by earlier segment start, then stable speaker ID.
4. Leave a word unlabeled when there is no overlap; do not guess the nearest speaker.
5. Normalize FluidAudio cluster IDs to `Speaker N` by first appearance.
6. Group adjacent words with the same normalized speaker into transcript segments.

When system speech is present, label microphone words `You` without clustering that source. Remove
only normalized-equal microphone and system words whose midpoints are within 500 ms; preserve
different simultaneous words. Merge microphone and remote segments by common-timeline start,
preserving stable source order for equal timestamps.

The first implementation does not identify real names, enroll known voices, or link identities
between sessions.

### Atomic final replacement

The current writer appends final Apple chunks, so offline labeling needs one explicit completion
operation:

- Extend the helper payload with a complete-transcript replacement marker.
- Retain existing partial and final events during recording so the live file keeps working.
- After diarization and alignment, emit one complete ordered segment snapshot.
- Have the transcript writer re-run redaction and atomically replace the transcript body while
  preserving the header and file path.
- Never append the complete snapshot to the existing body.
- Verify that replacement is idempotent and that repeating the same completion event cannot
  duplicate text.

If diarization fails after useful Apple text was written, preserve that text, remove any stale live
block, mark finalization as failed, and surface an explicit error. Do not fabricate speakers or
report successful diarization.

## Availability and Lifecycle

### Capability gates

Automatic voice capture is available only when all of these pass:

- macOS 26 and Apple `SpeechTranscriber` availability;
- a supported locale and installed Apple transcription asset;
- microphone permission and a usable selected input;
- packaged helper and validated FluidAudio model assets;
- FluidAudio model load on the current hardware;
- Screen Recording permission;
- ScreenCaptureKit system-audio availability;
- successful preparation of an Apple analyzer during prewarm.

Starting a recording then prepares the second analyzer and starts both capture sources before the
controller reports `recording`. Any startup failure marks the capability unavailable with its
concrete reason; prewarm does not activate a system-audio stream or privacy indicator.

Expose one readiness state. Any failed requirement disables voice recording with a concrete reason.

### Stop and finalization

Stopping recording has two distinct stages:

1. Stop microphone and system capture and finalize all Apple analyzers.
2. Run offline diarization, align speakers, and replace the final transcript.

Keep the existing `stopping` state active through finalization. Use FluidAudio's progress callback
to emit bounded progress or heartbeat events. Replace the current fixed stop timeout with a
progress-aware watchdog whose final limit is chosen from measured long-recording behavior. The
helper must still terminate on a genuine stall.

Unload analyzer and diarizer models after completion and verify resident memory returns near the
idle baseline. Define explicit behavior for app quit, sleep, helper crash, and stop during model
loading.

## Native Source Boundaries

The implementation separates model loading, audio recording, final-word accumulation, speaker
alignment, common-clock capture, system audio, source merging, and session finalization into
focused files. `AppleSpeechRuntime` coordinates their lifecycle. Protocols remain at model and
capture boundaries so tests mock frameworks, not alignment logic.

## Implementation Sequence and Verification Gates

### Phase 0: Baseline and fixtures

1. Record the current focused unit, helper build, real-audio, and targeted E2E results.
2. Record current helper size, packaged app size, prewarm time, peak RSS, and one-hour temporary
   storage behavior.
3. Add repository-owned synthetic two-speaker room fixtures and source-separated online fixtures.
4. Store ground-truth words, source offsets, speaker turns, and RTTM-style annotations with each
   fixture. Do not use private user recordings.

Gate: existing behavior is green or every pre-existing failure is recorded, and deterministic
fixtures cover both detected source outcomes.

### Phase 1: Dependency and feasibility spike

1. Pin an eligible FluidAudio release and commit the resolved dependency graph.
2. Build and run one offline fixture through `OfflineDiarizerManager` from a file-backed source.
3. Prove model loading with network access disabled.
4. Build the helper for `arm64` and `x86_64`; inspect architectures, linked libraries, signatures,
   warnings, helper size, and app-size increase.
5. Run the real model on Apple Silicon and Intel hardware supported by Familiar.
6. Prototype audio-only ScreenCaptureKit in the packaged helper and verify TCC behavior.
7. Prototype two concurrent Apple analyzers and measure CPU, RSS, energy, transcription quality,
   startup skew, and stop latency.
8. Record whether speaker-output leakage into the microphone causes duplicate online transcript
   text when using speakers as well as headphones.

Gate: FluidAudio is local, universal, packageable, and within measured budgets; direct system
audio works in the packaged app; two analyzers preserve both sources. If any gate fails, stop and
choose a revised architecture explicitly before production implementation.

### Phase 2: Test provider-neutral behavior first

Add failing tests for:

- automatic source detection and global capability gating;
- deterministic speaker label normalization;
- word/segment overlap, exact boundaries, ties, gaps, and no-overlap words;
- source offsets and long-duration timestamp drift;
- local `You` labels and remote speaker labels;
- overlapping local and remote speech;
- complete transcript replacement, redaction, idempotency, and no duplication;
- diarization failure preserving text while reporting incomplete finalization;
- missing/corrupt model assets and network-disabled model loading;
- bounded audio queues, disk-write errors, cancellation, and path-safe cleanup;
- finalization progress and stall detection.

Deliberately break speaker assignment and replacement once to prove the tests fail for the intended
reason before implementing the behavior.

Gate: new tests fail because the requested behavior is absent, while unrelated tests remain green.

### Phase 3: Nearby-conversation implementation

1. Add the selected FluidAudio dependency and validated bundled model assets.
2. Tee microphone buffers to Apple transcription and the bounded disk writer.
3. Finalize Apple words, close audio, run FluidAudio, and align speakers after stop.
4. Emit and atomically apply the complete labeled transcript.
5. Add model timing, speaker-count, unmatched-word, cleanup, and error logging.

Run Swift tests, speech-helper client tests, transcript-writer tests, a two-speaker real-model
fixture, and a targeted E2E test after each meaningful step.

Gate: two people near one Mac produce one complete transcript with deterministic distinct speaker
labels, no duplicated or lost text, and no retained raw audio.

### Phase 4: Automatic dual-source implementation

1. Replace the explicit Audio profile setting with an `Automatic` status.
2. Implement audio-only ScreenCaptureKit capture and its permission/status path.
3. Run microphone and system Apple analyzers on a common timeline.
4. Record both sources, then select one FluidAudio input from finalized system-audio words.
5. Label microphone words `You` for system-audio conversations, remove matching time-aligned echo,
   align remote words, and merge both source timelines.
6. Test nearby speech, system-audio speech, silence, notifications, source startup skew,
   simultaneous local/remote speech, and matching speaker-output leakage.
7. Store the detected source in final transcript metadata and delete both temporary tracks.

Gate: one recording action handles both physical-space and Mac-audio conversations, labels them
correctly, and never silently records microphone-only when system audio is unavailable.

### Phase 5: Packaging, permissions, and cleanup

1. Add the model asset build/verification script to development, test, and distribution commands.
2. Package only the required offline model files and third-party notices.
3. Verify universal helper dependencies, signing, hardened runtime, notarization, and offline load.
4. Add automatic-capture permission and unavailable states to existing settings and status surfaces.
5. Run path-safety tests for every temporary-file cleanup route.
6. Verify stale cleanup cannot follow symlinks or leave the dedicated processing root.

Gate: unsigned and signed packaged apps work offline after installation, all attribution is present,
and no temporary audio survives successful, failed, cancelled, crashed, or restarted sessions.

### Phase 6: Full verification

Run, at minimum:

1. Swift unit and integration tests with zero warnings.
2. Universal helper build and architecture inspection.
3. Complete desktop-app unit and timed-unit suites.
4. Focused speech-helper, controller, queue, writer, permission, and packaging tests.
5. Targeted Playwright tests through `npm run test:e2e:target`.
6. Complete Playwright suite outside the sandbox.
7. Real nearby two-speaker capture through the production helper.
8. Real source-separated online capture through the production helper.
9. Network-disabled packaged-app recording and finalization.
10. Thirty- and sixty-minute tests measuring drift, CPU, energy, peak RSS, finalization time, and
    temporary disk growth on Apple Silicon and Intel.
11. Local unsigned DMG smoke test followed by signed/notarized verification before release.

Gate: all required checks pass with zero warnings. Record the exact command and remaining risk for
any check that cannot run; do not mark the plan complete while a required hardware case is untested.

## Acceptance Criteria

- One automatic recording path handles nearby conversations and Mac-audio conversations.
- Nearby conversation diarizes multiple people heard by one selected microphone.
- Mac-audio conversation captures microphone and Mac audio directly and diarizes remote speakers.
- Automatic capture never silently falls back to microphone-only capture.
- Apple remains the only speech-to-text engine.
- FluidAudio inference and Apple transcription remain local and work without network access after
  installation.
- Speaker labels are deterministic within a session and are not presented as real identities.
- Local speech is labeled `You` when other voices come from Mac audio; system and nearby speakers
  use `Speaker N` labels.
- Word text and punctuation are preserved while adding speaker labels.
- Final replacement produces no missing or duplicated transcript text and is idempotent.
- Simultaneous local and remote speech can coexist as overlapping timestamped segments.
- Long recordings never accumulate meeting-length PCM in memory.
- Two 16 kHz diarization tracks are retained temporarily, at no more than 460.8 MB per hour plus
  fixed overhead; FluidAudio runs on exactly one selected track.
- Temporary audio is removed on every terminal path, and stale cleanup cannot escape its dedicated
  app-owned root.
- Missing models, permissions, sources, unsupported hardware, analyzer errors, diarizer errors,
  overload, and finalization stalls are explicit.
- The app remains universal, and real FluidAudio processing is verified on supported Apple Silicon
  and Intel Macs.
- The packaged app contains the required FluidAudio/model attribution and only the selected offline
  diarization assets.
- Focused tests pass throughout implementation, followed by all unit, integration, real-audio,
  packaging, lint, and end-to-end checks.

## Research Basis

Verified July 12, 2026:

- <https://github.com/FluidInference/FluidAudio>
- <https://github.com/FluidInference/FluidAudio/blob/main/Documentation/API.md>
- <https://github.com/FluidInference/FluidAudio/releases/tag/v0.15.5>
- <https://huggingface.co/FluidInference/speaker-diarization-coreml>
- [Apple ScreenCaptureKit capture guide][apple-screen-capture]

[apple-screen-capture]:
  https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos
