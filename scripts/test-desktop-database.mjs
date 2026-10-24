import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resources = path.resolve(process.argv[2] || path.join(root, 'src-tauri', 'resources'));
const server = path.join(resources, 'server');
const node = path.join(resources, 'node', ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']));

assert.ok(statSync(node).isFile(), 'The bundled Node runtime is missing');
assert.ok(statSync(path.join(server, 'server.js')).isFile(), 'The desktop server is missing');
assert.ok(statSync(path.join(server, 'migrate-desktop-database.mjs')).isFile(), 'The database upgrade helper is missing');
if (process.platform === 'linux' && process.arch === 'x64') {
  for (const target of ['debian-openssl-1.1.x', 'debian-openssl-3.0.x']) {
    const engine = path.join(server, 'node_modules', '.prisma', 'client', `libquery_engine-${target}.so.node`);
    assert.ok(statSync(engine).isFile(), `The desktop bundle is missing the ${target} engine`);
  }
}

const temp = mkdtempSync(path.join(os.tmpdir(), 'rorilo-desktop-db-'));
const worker = path.join(root, 'scripts', 'desktop-database-smoke.mjs');

try {
  const env = { ...process.env };
  delete env.PRISMA_QUERY_ENGINE_LIBRARY;
  delete env.PRISMA_QUERY_ENGINE_BINARY;
  const result = spawnSync(node, [worker, server, temp, path.join(resources, 'schema.sql'), path.join(root, 'tests', 'fixtures', 'database-v0.1.0.sql')], {
    cwd: temp,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'The packaged desktop database smoke test failed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
