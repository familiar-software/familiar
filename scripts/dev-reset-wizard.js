#!/usr/bin/env node
/*
 * Dev-only helper: resets wizard state in the dev settings dir so the
 * onboarding wizard replays on next launch.
 *
 * Hard-guarded: refuses to run unless FAMILIAR_SETTINGS_DIR is set AND
 * does not equal ~/.familiar. This makes it impossible to accidentally
 * touch the packaged app's real settings.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsDir = process.env.FAMILIAR_SETTINGS_DIR;

if (!settingsDir) {
  console.error('Refusing to run: FAMILIAR_SETTINGS_DIR is not set.');
  console.error('Set it to a dev-only path (e.g. $HOME/.familiar-dev) and retry.');
  process.exit(1);
}

const realDefault = path.join(os.homedir(), '.familiar');
if (path.resolve(settingsDir) === path.resolve(realDefault)) {
  console.error(`Refusing to run: FAMILIAR_SETTINGS_DIR points at ${realDefault} (the real settings dir).`);
  process.exit(1);
}

const settingsPath = path.join(settingsDir, 'settings.json');

if (!fs.existsSync(settingsPath)) {
  console.log(`No settings file at ${settingsPath}. Nothing to reset — wizard will run on next launch.`);
  process.exit(0);
}

const raw = fs.readFileSync(settingsPath, 'utf-8');
let data;
try {
  data = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  console.error(`Could not parse ${settingsPath}:`, err.message);
  process.exit(1);
}

if (data.wizardCompleted !== true) {
  console.log(`wizardCompleted is already ${JSON.stringify(data.wizardCompleted)} in ${settingsPath}.`);
} else {
  data.wizardCompleted = false;
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Reset wizardCompleted=false in ${settingsPath}.`);
}
