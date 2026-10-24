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
if (process.platform === 'linux' && process.arch === 'x64') {
  for (const target of ['debian-openssl-1.1.x', 'debian-openssl-3.0.x']) {
    const engine = path.join(server, 'node_modules', '.prisma', 'client', `libquery_engine-${target}.so.node`);
    assert.ok(statSync(engine).isFile(), `The desktop bundle is missing the ${target} engine`);
  }
}

const temp = mkdtempSync(path.join(os.tmpdir(), 'rorilo-desktop-db-'));
const worker = String.raw`
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { createRequire } = require('node:module');
  const [server, temp] = process.argv.slice(1);
  const bundledRequire = createRequire(path.join(server, 'server.js'));
  const { PrismaClient } = bundledRequire('@prisma/client');
  const database = path.join(temp, 'smoke.db').split(path.sep).join('/');
  const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + database } } });
  async function main() {
    try {
      await prisma.$executeRawUnsafe('CREATE TABLE "UserProfile" ("id" TEXT NOT NULL PRIMARY KEY)');
      await prisma.$executeRawUnsafe('INSERT INTO "UserProfile" ("id") VALUES (?)', 'desktop-smoke');
      const profile = await prisma.userProfile.findFirst({ select: { id: true } });
      assert.equal(profile?.id, 'desktop-smoke');
      console.log('Packaged Prisma client opened, wrote, and read a temporary SQLite database.');
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }
  main().catch(error => { console.error(error); process.exitCode = 1; });
`;

try {
  const env = { ...process.env };
  delete env.PRISMA_QUERY_ENGINE_LIBRARY;
  delete env.PRISMA_QUERY_ENGINE_BINARY;
  const result = spawnSync(node, ['-e', worker, server, temp], {
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
