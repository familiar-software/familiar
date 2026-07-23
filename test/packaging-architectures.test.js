const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const buildSteps = [
    'npm run clean',
    'npm run build:apple-vision-ocr',
    'npm run build:active-window-detector',
    'npm run build:rg-bundle',
    'npm run build:diarization-models',
    'npm run build:speech-helper:universal',
    'npm run react:build:dashboard',
    'npm run css:build'
];

function readSpeechHelperSource () {
    const helperSourceDir = path.join(
        appRoot,
        'scripts',
        'familiar-speech-helper',
        'Sources',
        'FamiliarSpeechHelper'
    );
    return fs.readdirSync(helperSourceDir)
        .filter((name) => name.endsWith('.swift'))
        .map((name) => fs.readFileSync(path.join(helperSourceDir, name), 'utf-8'))
        .join('\n');
}

test('package scripts build mac dist for both arm64 and x64', () => {
    const packageJsonPath = path.join(appRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.equal(
        packageJson.scripts['dist:mac'],
        `${buildSteps.join(' && ')} && electron-builder --mac --arm64 --x64`
    );
    assert.equal(
        packageJson.scripts['dist:mac:arm64'],
        `${buildSteps.join(' && ')} && electron-builder --mac --arm64`
    );
    assert.equal(
        packageJson.scripts['dist:mac:x64'],
        `${buildSteps.join(' && ')} && electron-builder --mac --x64`
    );
});

test('Apple Vision OCR build script compiles universal helper', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-apple-vision-ocr.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /-arch arm64/);
    assert.match(script, /-arch x86_64/);
    assert.match(script, /lipo -info/);
    assert.match(script, /for arch in arm64 x86_64/);
});

test('package includes bundled rg resources and build script', () => {
    const packageJsonPath = path.join(appRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const resources = Array.isArray(packageJson.build?.extraResources)
        ? packageJson.build.extraResources
        : [];

    assert.equal(packageJson.scripts['build:rg-bundle'], 'bash scripts/build-rg-bundle.sh');
    assert.equal(
        resources.some(
            (resource) =>
                resource.from === 'scripts/bin/familiar-ocr-helper' &&
                resource.to === 'familiar-ocr-helper'
        ),
        true
    );
    assert.equal(
        resources.some((resource) => resource.from === 'scripts/bin/rg' && resource.to === 'rg'),
        true
    );
});

test('package includes meeting audio transcription resources', () => {
    const packageJsonPath = path.join(appRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const resources = Array.isArray(packageJson.build?.extraResources)
        ? packageJson.build.extraResources
        : [];

    assert.equal(
        resources.some(
            (resource) =>
                resource.from === 'scripts/bin/familiar-speech-helper' &&
                resource.to === 'familiar-speech-helper'
        ),
        true
    );
    assert.equal(
        resources.some(
            (resource) =>
                resource.from === 'scripts/bin/fluid-audio-models' &&
                resource.to === 'fluid-audio-models'
        ),
        true
    );
    assert.equal(
        resources.some(
            (resource) =>
                resource.from === 'build/third-party' &&
                resource.to === 'third-party'
        ),
        true
    );
    assert.equal(
        resources.some(
            (resource) =>
                resource.from === 'scripts/bin/whisperkit-models' &&
                resource.to === 'whisperkit-models'
        ),
        false
    );
    assert.equal(
        resources.some(
            (resource) =>
                resource.from?.toLowerCase().includes('blackhole') ||
                resource.to?.toLowerCase().includes('blackhole')
        ),
        false
    );
    assert.equal(
        packageJson.scripts['build:speech-helper'],
        'bash scripts/build-familiar-speech-helper.sh'
    );
    assert.equal(
        packageJson.scripts['build:speech-helper:universal'],
        'bash scripts/build-familiar-speech-helper.sh --universal'
    );
    assert.equal(
        packageJson.scripts['build:diarization-models'],
        'node scripts/build-fluid-audio-models.js'
    );
    assert.equal(packageJson.scripts['build:speech-models'], undefined);
    assert.equal(packageJson.scripts['build:audio-transcriber'], undefined);
    assert.equal(
        packageJson.build.mac.extendInfo.NSMicrophoneUsageDescription,
        'Familiar needs microphone access to record and transcribe meetings you explicitly start.'
    );
    assert.equal(
        packageJson.build.mac.extendInfo.NSScreenCaptureUsageDescription,
        'Familiar needs Screen Recording access to capture audio from calls you explicitly record.'
    );
});

test('package includes FluidAudio SDK and model attribution', () => {
    const noticesPath = path.join(appRoot, 'build', 'third-party', 'THIRD-PARTY-NOTICES.md');
    const apacheLicensePath = path.join(
        appRoot,
        'build',
        'third-party',
        'licenses',
        'FluidAudio-APACHE-2.0.txt'
    );
    const notices = fs.readFileSync(noticesPath, 'utf-8');
    const apacheLicense = fs.readFileSync(apacheLicensePath, 'utf-8');

    assert.match(notices, /FluidAudio 0\.15\.5/);
    assert.match(notices, /19600a485baa4998812e4654b70d2bab8f2c9949/);
    assert.match(notices, /1ed7a662fdc7109e36d822db793ee6eebdaf8594/);
    assert.match(notices, /CC-BY-4\.0/);
    assert.match(notices, /pyannote\/speaker-diarization-community-1/);
    assert.match(apacheLicense, /Apache License\s+Version 2\.0, January 2004/);
});

test('meeting audio transcription has packaged microphone entitlement', () => {
    const entitlementsPath = path.join(appRoot, 'build', 'entitlements.mac.plist');
    const entitlements = fs.readFileSync(entitlementsPath, 'utf-8');

    assert.match(entitlements, /com\.apple\.security\.device\.audio-input/);
});

test('meeting audio transcription pins FluidAudio for offline diarization', () => {
    const packageSwiftPath = path.join(
        appRoot,
        'scripts',
        'familiar-speech-helper',
        'Package.swift'
    );
    const packageResolvedPath = path.join(
        appRoot,
        'scripts',
        'familiar-speech-helper',
        'Package.resolved'
    );
    const packageSwift = fs.readFileSync(packageSwiftPath, 'utf-8');
    const packageResolved = JSON.parse(fs.readFileSync(packageResolvedPath, 'utf-8'));
    const fluidAudioPin = packageResolved.pins.find((pin) => pin.identity === 'fluidaudio');

    assert.doesNotMatch(packageSwift, /WhisperKit|argmax/i);
    assert.match(
        packageSwift,
        /\.package\([\s\S]*url: "https:\/\/github\.com\/FluidInference\/FluidAudio\.git",[\s\S]*exact: "0\.15\.5"/
    );
    assert.match(
        packageSwift,
        /\.product\(name: "FluidAudio", package: "FluidAudio"\)/
    );
    assert.equal(fluidAudioPin?.state?.version, '0.15.5');
    assert.equal(fluidAudioPin?.state?.revision, '19600a485baa4998812e4654b70d2bab8f2c9949');
});

test('speech helper uses Apple SpeechTranscriber with runtime availability checks', () => {
    const helperSource = readSpeechHelperSource();

    assert.match(helperSource, /import Speech/);
    assert.match(helperSource, /SpeechTranscriber/);
    assert.match(helperSource, /SpeechAnalyzer/);
    assert.match(helperSource, /AssetInventory/);
    assert.match(helperSource, /#available\(macOS 26\.0/);
    assert.match(helperSource, /supportedLocales/);
    assert.match(helperSource, /installed/);
    assert.match(helperSource, /"prewarm_model"/);
    assert.match(helperSource, /volatileResults/);
    assert.match(helperSource, /audioTimeRange/);
    assert.match(helperSource, /finalizeAndFinishThroughEndOfInput/);
    assert.match(helperSource, /TerminationSignalHandlers/);
    assert.match(helperSource, /install\(signalNumber: SIGTERM\)/);
    assert.doesNotMatch(helperSource, /WhisperKit|FAMILIAR_WHISPERKIT/);
});

test('speech helper bounds streaming audio queued for analysis', () => {
    const helperSource = readSpeechHelperSource();

    assert.match(helperSource, /bufferingNewest/);
    assert.match(helperSource, /Audio processing could not keep up/);
    assert.doesNotMatch(helperSource, /audioSamples\.append/);
});

test('speech helper build script can build a universal macOS helper', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-familiar-speech-helper.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /--universal/);
    assert.match(script, /build_arch arm64/);
    assert.match(script, /build_arch x86_64/);
    assert.match(script, /apple-macosx14\.0/);
    assert.match(script, /if ! swift build/);
    assert.match(script, /Failed to build \$arch speech helper/);
    assert.match(script, /lipo -create/);
    assert.match(script, /codesign --force --sign - "\$OUT"/);
});

test('speech model bundle script is removed', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-whisperkit-models.sh');

    assert.equal(fs.existsSync(buildScriptPath), false);
});

test('RG bundle script prepares binaries from official releases or env overrides', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-rg-bundle.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /FAMILIAR_RG_VERSION/);
    assert.match(script, /github\.com\/BurntSushi\/ripgrep\/releases\/download/);
    assert.match(script, /FAMILIAR_RG_DARWIN_ARM64_SOURCE/);
    assert.match(script, /FAMILIAR_RG_DARWIN_X64_SOURCE/);
});
