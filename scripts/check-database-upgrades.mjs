import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareDatabase } from './migrate-desktop-database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const currentSchema = path.join(root, 'src-tauri', 'resources', 'schema.sql');
const legacySchema = readFileSync(path.join(root, 'tests', 'fixtures', 'database-v0.1.0.sql'), 'utf8');

function fixture(t, schema = legacySchema) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rorilo-upgrade-test-'));
  const file = path.join(dir, 'rorilo.db');
  const db = new DatabaseSync(file);
  if (schema) db.exec(schema);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, file, db };
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name);
}

function seedCv(db) {
  db.prepare('INSERT INTO "CV" (id, originalFilename, extractedText, updatedAt) VALUES (?, ?, ?, ?)')
    .run('legacy-cv', 'original.txt', 'Existing CV text', '2026-01-01T00:00:00.000Z');
}

test('initializes a fresh database with every current table and column', t => {
  const { file, db } = fixture(t, '');
  const result = prepareDatabase(file, currentSchema);
  assert.ok(result.changes > 0);
  assert.equal(result.backupPath, null);
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(readFileSync(currentSchema, 'utf8'));
    for (const { name } of reference.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
      assert.deepEqual(columns(db, name), columns(reference, name));
    }
  } finally {
    reference.close();
  }
});

test('upgrades the actual v0.1.0 schema, preserving CVs, profiles, jobs, applications, and settings', t => {
  const { file, db } = fixture(t);
  seedCv(db);
  db.exec(`
    INSERT INTO "UserProfile" (id, firstName, updatedAt) VALUES ('default', 'Existing profile', '2026-01-01');
    INSERT INTO "Job" (id, deduplicationHash, title, company, description, updatedAt) VALUES ('job-1', 'hash-1', 'Existing job', 'Existing company', 'Existing description', '2026-01-01');
    INSERT INTO "Application" (id, jobId, status, updatedAt) VALUES ('app-1', 'job-1', 'INTERVIEW', '2026-01-01');
    INSERT INTO "FreeSourceSettings" (id, enabledSources, updatedAt) VALUES ('default', '["xing"]', '2026-01-01');
    INSERT INTO "AIProviderSettings" (id, apiKey, updatedAt) VALUES ('default', 'test-secret', '2026-01-01');
  `);
  const result = prepareDatabase(file, currentSchema);
  assert.equal(result.changes, 3);
  assert.ok(result.backupPath);
  assert.deepEqual({ ...db.prepare('SELECT extractedText, fileData, mimeType, fileSize FROM "CV"').get() }, {
    extractedText: 'Existing CV text', fileData: null, mimeType: null, fileSize: null,
  });
  assert.equal(db.prepare('SELECT firstName FROM "UserProfile"').get().firstName, 'Existing profile');
  assert.equal(db.prepare('SELECT title FROM "Job"').get().title, 'Existing job');
  assert.equal(db.prepare('SELECT status FROM "Application"').get().status, 'INTERVIEW');
  assert.equal(db.prepare('SELECT enabledSources FROM "FreeSourceSettings"').get().enabledSources, '["xing"]');
  assert.equal(db.prepare('SELECT apiKey FROM "AIProviderSettings"').get().apiKey, 'test-secret');
  const backup = new DatabaseSync(result.backupPath, { readOnly: true });
  try {
    assert.ok(!columns(backup, 'CV').includes('fileData'));
    assert.equal(backup.prepare('SELECT extractedText FROM "CV"').get().extractedText, 'Existing CV text');
    assert.equal(backup.prepare('SELECT status FROM "Application"').get().status, 'INTERVIEW');
  } finally {
    backup.close();
  }
});

test('is idempotent and does not create another backup at every startup', t => {
  const { file, db, dir } = fixture(t);
  seedCv(db);
  prepareDatabase(file, currentSchema);
  assert.deepEqual(prepareDatabase(file, currentSchema), { changes: 0, backupPath: null });
  assert.equal(readdirSync(dir).filter(name => name.includes('.before-upgrade-')).length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "CV"').get().count, 1);
});

test('backs up committed WAL data while another connection remains open', t => {
  const { file, db } = fixture(t);
  db.exec('PRAGMA journal_mode = WAL');
  seedCv(db);
  const result = prepareDatabase(file, currentSchema);
  const backup = new DatabaseSync(result.backupPath, { readOnly: true });
  try {
    assert.equal(backup.prepare('SELECT extractedText FROM "CV"').get().extractedText, 'Existing CV text');
    assert.equal(backup.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally {
    backup.close();
  }
});

test('rolls back the entire upgrade if a later index creation fails', t => {
  const { file, db, dir } = fixture(t, 'CREATE TABLE Account (id TEXT, email TEXT); INSERT INTO Account VALUES (\'1\', \'same\'), (\'2\', \'same\');');
  const schema = path.join(dir, 'target.sql');
  writeFileSync(schema, 'CREATE TABLE Account (id TEXT, email TEXT, newField TEXT); CREATE UNIQUE INDEX Account_email_key ON Account(email);');
  assert.throws(() => prepareDatabase(file, schema), /UNIQUE constraint failed/);
  assert.deepEqual(columns(db, 'Account'), ['id', 'email']);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Account').get().count, 2);
  assert.equal(readdirSync(dir).filter(name => name.includes('.before-upgrade-')).length, 1);
});

test('refuses to invent values for a new required field on existing rows', t => {
  const { file, db, dir } = fixture(t, 'CREATE TABLE Account (id TEXT); INSERT INTO Account VALUES (\'original\');');
  const schema = path.join(dir, 'target.sql');
  writeFileSync(schema, 'CREATE TABLE Account (id TEXT, requiredValue TEXT NOT NULL);');
  assert.throws(() => prepareDatabase(file, schema), /explicit migration is required/);
  assert.deepEqual(columns(db, 'Account'), ['id']);
  assert.equal(db.prepare('SELECT id FROM Account').get().id, 'original');
});

test('backfills declared defaults and preserves unknown tables and columns', t => {
  const { file, db, dir } = fixture(t, 'CREATE TABLE Account (id TEXT, legacyData TEXT); INSERT INTO Account VALUES (\'original\', \'keep\'); CREATE TABLE CustomData (value TEXT);');
  const schema = path.join(dir, 'target.sql');
  writeFileSync(schema, 'CREATE TABLE Account (id TEXT, enabled BOOLEAN NOT NULL DEFAULT true); CREATE TABLE MissingTable (id TEXT);');
  prepareDatabase(file, schema);
  assert.deepEqual({ ...db.prepare('SELECT * FROM Account').get() }, { id: 'original', legacyData: 'keep', enabled: 1 });
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='CustomData'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='MissingTable'").get());
});
