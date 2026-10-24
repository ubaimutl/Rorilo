import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function quote(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

function objects(db, type) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name").all(type);
}

function changesFor(db, reference) {
  const changes = [];
  const existingTables = new Set(objects(db, 'table').map(row => row.name.toLowerCase()));
  for (const table of objects(reference, 'table')) {
    if (!existingTables.has(table.name.toLowerCase())) {
      changes.push(table.sql);
      continue;
    }
    const have = new Set(db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(row => row.name.toLowerCase()));
    for (const column of reference.prepare(`PRAGMA table_info(${quote(table.name)})`).all()) {
      if (have.has(column.name.toLowerCase())) continue;
      if (column.pk) throw new Error(`An explicit migration is required for primary key ${table.name}.${column.name}`);
      if (column.notnull && column.dflt_value === null && db.prepare(`SELECT 1 FROM ${quote(table.name)} LIMIT 1`).get()) {
        throw new Error(`An explicit migration is required for required column ${table.name}.${column.name}; existing rows cannot be given an invented value`);
      }
      let sql = `ALTER TABLE ${quote(table.name)} ADD COLUMN ${quote(column.name)} ${column.type}`;
      if (column.notnull) sql += ' NOT NULL';
      if (column.dflt_value !== null) sql += ` DEFAULT ${column.dflt_value}`;
      changes.push(sql);
    }
  }
  const existingIndexes = new Set(objects(db, 'index').map(row => row.name.toLowerCase()));
  for (const index of objects(reference, 'index')) {
    if (!existingIndexes.has(index.name.toLowerCase())) changes.push(index.sql);
  }
  return changes;
}

export function prepareDatabase(databasePath, schemaPath) {
  const reference = new DatabaseSync(':memory:');
  let database;
  let backupPath = null;
  try {
    reference.exec(readFileSync(schemaPath, 'utf8'));
    mkdirSync(path.dirname(databasePath), { recursive: true });
    const existed = existsSync(databasePath);
    database = new DatabaseSync(databasePath);
    if (!existed) chmodSync(databasePath, 0o600);
    database.exec('PRAGMA busy_timeout = 30000');
    const integrity = database.prepare('PRAGMA quick_check').all();
    if (integrity.some(row => row.quick_check !== 'ok')) throw new Error('Database integrity check failed; the database was not upgraded');
    if (changesFor(database, reference).length === 0) return { changes: 0, backupPath };

    if (objects(database, 'table').length > 0) {
      backupPath = `${databasePath}.before-upgrade-${Date.now()}-${randomUUID().slice(0, 8)}.db`;
      // SQLite creates a consistent backup, including committed WAL contents.
      database.prepare('VACUUM main INTO ?').run(backupPath);
      chmodSync(backupPath, 0o600);
    }

    database.exec('BEGIN IMMEDIATE');
    try {
      // Recheck under the write lock in case another app instance upgraded first.
      const changes = changesFor(database, reference);
      for (const sql of changes) database.exec(sql);
      database.exec('COMMIT');
      return { changes: changes.length, backupPath };
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // SQLite can already have rolled back after an I/O failure.
      }
      if (backupPath) error.message += `; pre-upgrade backup: ${backupPath}`;
      throw error;
    }
  } finally {
    database?.close();
    reference.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [databasePath, schemaPath] = process.argv.slice(2);
    if (!databasePath || !schemaPath) throw new Error('Usage: node migrate-desktop-database.mjs <database> <schema.sql>');
    const result = prepareDatabase(path.resolve(databasePath), path.resolve(schemaPath));
    console.log(`Database ready; applied ${result.changes} schema changes.${result.backupPath ? ` Backup: ${result.backupPath}` : ''}`);
  } catch (error) {
    console.error(`Could not prepare the desktop database: ${error.message}`);
    process.exitCode = 1;
  }
}
