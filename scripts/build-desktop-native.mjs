import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const args = [tauriCli, 'build'];

if (process.platform === 'linux') {
  const tauriCache = path.join(process.env.HOME ?? '', '.cache', 'tauri');
  const gtkPluginSource = path.join(root, 'scripts', 'tauri-linux', 'linuxdeploy-plugin-gtk.sh');
  const gtkPluginTarget = path.join(tauriCache, 'linuxdeploy-plugin-gtk.sh');

  const releaseDir = path.join(root, 'src-tauri', 'target', 'release');
  await rm(path.join(releaseDir, 'bundle'), {
    recursive: true,
    force: true,
  });
  await rm(path.join(releaseDir, 'rolevia'), { force: true });
  await rm(path.join(releaseDir, 'rolevia.d'), { force: true });
  await mkdir(tauriCache, { recursive: true });
  await copyFile(gtkPluginSource, gtkPluginTarget);
  await chmod(gtkPluginTarget, 0o755);

  args.push('--bundles', 'appimage');
  args.push('--verbose');
}

const child = spawn(process.execPath, args, {
  cwd: root,
  env: {
    ...process.env,
    ...(process.platform === 'linux' ? { NO_STRIP: '1' } : {}),
  },
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
