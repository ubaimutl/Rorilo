import { copyFile, mkdir, rm, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRoot = path.join(root, 'src-tauri', 'resources', 'node');
const isWindows = process.platform === 'win32';
const target = isWindows ? path.join(nodeRoot, 'node.exe') : path.join(nodeRoot, 'bin', 'node');

await stat(process.execPath);
await rm(nodeRoot, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await copyFile(process.execPath, target);

if (!isWindows) {
  await chmod(target, 0o755);
}

console.log(`Bundled Node runtime from ${process.execPath}`);
