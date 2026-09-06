import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = ['tauri', 'build'];

if (process.platform === 'linux') {
  args.push('--bundles', 'deb');
}

const child = spawn('cargo', args, {
  cwd: path.join(root, 'src-tauri'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
