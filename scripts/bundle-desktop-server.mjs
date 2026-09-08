import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src-tauri', 'resources', 'server');
const standaloneDir = path.join(root, '.next', 'standalone');
const schemaOut = path.join(root, 'src-tauri', 'resources', 'schema.sql');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(from, to) {
  if (await exists(from)) {
    await cp(from, to, { recursive: true, force: true });
  }
}

function isLocalOnlyFile(name) {
  return (
    name === '.env' ||
    name.startsWith('.env.') ||
    name.endsWith('.db') ||
    name.endsWith('.sqlite') ||
    name.endsWith('.sqlite3') ||
    name.endsWith('.db-journal') ||
    name.endsWith('.sqlite-journal')
  );
}

async function scrubLocalOnlyFiles(dir) {
  if (!(await exists(dir))) {
    return;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scrubLocalOnlyFiles(target);
        return;
      }
      if (entry.isFile() && isLocalOnlyFile(entry.name)) {
        await rm(target, { force: true });
      }
    })
  );
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

if (!(await exists(path.join(standaloneDir, 'server.js')))) {
  throw new Error('Next standalone output is missing. Run npm run build first.');
}

await cp(standaloneDir, outDir, { recursive: true, force: true });
await scrubLocalOnlyFiles(outDir);
await mkdir(path.join(outDir, '.next'), { recursive: true });
await copyIfExists(path.join(root, '.next', 'static'), path.join(outDir, '.next', 'static'));
await copyIfExists(path.join(root, 'public'), path.join(outDir, 'public'));
await mkdir(path.join(outDir, 'prisma'), { recursive: true });
await copyIfExists(path.join(root, 'prisma', 'schema.prisma'), path.join(outDir, 'prisma', 'schema.prisma'));

await mkdir(path.join(outDir, 'node_modules'), { recursive: true });
await copyIfExists(path.join(root, 'node_modules', 'prisma'), path.join(outDir, 'node_modules', 'prisma'));
await copyIfExists(path.join(root, 'node_modules', '@prisma'), path.join(outDir, 'node_modules', '@prisma'));
await copyIfExists(path.join(root, 'node_modules', '.prisma'), path.join(outDir, 'node_modules', '.prisma'));

await rm(schemaOut, { force: true });

const diff = spawnSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script',
    '--output',
    schemaOut,
  ],
  { cwd: root, encoding: 'utf8' }
);

if (diff.error || diff.status !== 0) {
  const details = [diff.error?.message, diff.stderr, diff.stdout].filter(Boolean).join('\n').trim();
  throw new Error(details || `Could not generate desktop database schema. Exit status: ${diff.status}`);
}

const schemaStats = await stat(schemaOut);
if (schemaStats.size === 0) {
  throw new Error('Generated desktop database schema is empty.');
}

console.log(`Desktop server bundle written to ${path.relative(root, outDir)}`);
