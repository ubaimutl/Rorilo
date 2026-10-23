import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"$/m)?.[1];
const cargoLockVersion = read('src-tauri/Cargo.lock').match(/\[\[package\]\]\s+name = "rorilo"\s+version = "([^"]+)"/)?.[1];

for (const [file, version] of [
  ['package-lock.json', lock.version],
  ['package-lock.json root package', lock.packages?.['']?.version],
  ['src-tauri/tauri.conf.json', tauri.version],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src-tauri/Cargo.lock', cargoLockVersion],
]) {
  assert.equal(version, pkg.version, `Release version mismatch in ${file}`);
}

const tag = `v${pkg.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, tag, 'Release tag must match the application version');
}

const notes = path.join(root, 'releases', `${tag}.md`);
assert.ok(statSync(notes).isFile() && readFileSync(notes, 'utf8').trim(), `Release notes are missing for ${tag}`);
console.log(`Release versions and notes verified for ${tag}`);
