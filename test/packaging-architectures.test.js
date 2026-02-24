const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');

test('package scripts build mac dist for both arm64 and x64', () => {
    const packageJsonPath = path.join(appRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.equal(
        packageJson.scripts['dist:mac'],
        'npm run clean && npm run build:apple-vision-ocr && npm run build:rg-bundle && npm run css:build && electron-builder --mac --arm64 --x64'
    );
    assert.equal(
        packageJson.scripts['dist:mac:arm64'],
        'npm run clean && npm run build:apple-vision-ocr && npm run build:rg-bundle && npm run css:build && electron-builder --mac --arm64'
    );
    assert.equal(
        packageJson.scripts['dist:mac:x64'],
        'npm run clean && npm run build:apple-vision-ocr && npm run build:rg-bundle && npm run css:build && electron-builder --mac --x64'
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

test('RG bundle script prepares binaries from official releases or env overrides', () => {
    const buildScriptPath = path.join(appRoot, 'scripts', 'build-rg-bundle.sh');
    const script = fs.readFileSync(buildScriptPath, 'utf-8');

    assert.match(script, /FAMILIAR_RG_VERSION/);
    assert.match(script, /github\.com\/BurntSushi\/ripgrep\/releases\/download/);
    assert.match(script, /FAMILIAR_RG_DARWIN_ARM64_SOURCE/);
    assert.match(script, /FAMILIAR_RG_DARWIN_X64_SOURCE/);
});
