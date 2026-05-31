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
    'npm run build:speech-helper:universal',
    'npm run build:speech-models',
    'npm run css:build'
];

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
                resource.from === 'scripts/bin/whisperkit-models' &&
                resource.to === 'whisperkit-models'
        ),
        true
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
        packageJson.scripts['build:speech-models'],
        'bash scripts/build-whisperkit-models.sh'
    );
    assert.equal(packageJson.scripts['build:audio-transcriber'], undefined);
    assert.equal(
        packageJson.build.mac.extendInfo.NSMicrophoneUsageDescription,
        'Familiar needs microphone access to record and transcribe meetings you explicitly start.'
    );
});

test('meeting audio transcription pins the official WhisperKit package', () => {
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
    const argmaxPin = packageResolved.pins.find((pin) => pin.identity === 'argmax-oss-swift');

    assert.match(packageSwift, /https:\/\/github\.com\/argmaxinc\/argmax-oss-swift\.git/);
    assert.match(packageSwift, /exact: "1\.0\.0"/);
    assert.equal(argmaxPin.state.version, '1.0.0');
    assert.equal(argmaxPin.state.revision, '25c62997041c134b03ca82731ce2f6fd2cae1eb9');
});

test('speech helper uses plain transcript streaming and packaged model root override', () => {
    const helperSourcePath = path.join(
        appRoot,
        'scripts',
        'familiar-speech-helper',
        'Sources',
        'FamiliarSpeechHelper',
        'main.swift'
    );
    const helperSource = fs.readFileSync(helperSourcePath, 'utf-8');

    assert.match(helperSource, /FAMILIAR_WHISPERKIT_MODEL_ROOT/);
    assert.match(helperSource, /modelFolder: localModelFolder\?\.path/);
    assert.match(helperSource, /tokenizerFolder: modelRoot/);
    assert.match(helperSource, /withoutTimestamps:\s*true/);
    assert.doesNotMatch(helperSource, /wordTimestamps:\s*true/);
    assert.doesNotMatch(helperSource, /"segments": segmentPayloads/);
});

test('speech helper build script can build a universal macOS helper', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-familiar-speech-helper.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /--universal/);
    assert.match(script, /build_arch arm64/);
    assert.match(script, /build_arch x86_64/);
    assert.match(script, /apple-macosx14\.0/);
    assert.match(script, /lipo -create/);
});

test('RG bundle script prepares binaries from official releases or env overrides', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-rg-bundle.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /FAMILIAR_RG_VERSION/);
    assert.match(script, /github\.com\/BurntSushi\/ripgrep\/releases\/download/);
    assert.match(script, /FAMILIAR_RG_DARWIN_ARM64_SOURCE/);
    assert.match(script, /FAMILIAR_RG_DARWIN_X64_SOURCE/);
});
