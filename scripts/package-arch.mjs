import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.npm_package_version || '0.1.0';
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const debData = path.join(bundleDir, 'deb', `Rorilo_${version}_amd64`, 'data.tar.gz');
const archDir = path.join(bundleDir, 'arch');
const pkgRoot = path.join(archDir, 'pkgroot');
const packageName = `rorilo-${version}-1-x86_64.pkg.tar.zst`;
const packagePath = path.join(archDir, packageName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });

  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(details || `${command} ${args.join(' ')} failed with status ${result.status}`);
  }

  return result;
}

async function directorySize(target) {
  const info = await stat(target);

  if (!info.isDirectory()) {
    return info.size;
  }

  const entries = await readdir(target, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => directorySize(path.join(target, entry.name))));
  return sizes.reduce((sum, size) => sum + size, 0);
}

await stat(debData).catch(() => {
  throw new Error(`Linux .deb payload is missing at ${path.relative(root, debData)}. Run desktop:package-native first.`);
});

await rm(archDir, { recursive: true, force: true });
await mkdir(pkgRoot, { recursive: true });

run('tar', ['-xzf', debData, '-C', pkgRoot], { stdio: 'inherit' });

const installedSize = await directorySize(pkgRoot);

const pkgInfo = [
  'pkgname = rorilo',
  'pkgbase = rorilo',
  'xdata = pkgtype=pkg',
  `pkgver = ${version}-1`,
  'pkgdesc = Local-first job search and application workspace',
  'url = https://github.com/ubaimutl/Rorilo',
  `builddate = ${Math.floor(Date.now() / 1000)}`,
  'packager = GitHub Actions',
  `size = ${installedSize}`,
  'arch = x86_64',
  'license = custom',
  'depend = gtk3',
  'depend = webkit2gtk-4.1',
  'depend = glib2',
  'depend = hicolor-icon-theme',
  'depend = xdg-utils',
  '',
].join('\n');

await writeFile(path.join(pkgRoot, '.PKGINFO'), pkgInfo);

try {
  const mtree = run('bsdtar', [
    '--format=mtree',
    '--options=!all,use-set,type,uid,gid,mode,time,size,md5,sha256,link',
    '-cf',
    '-',
    '.',
  ], { cwd: pkgRoot });
  await writeFile(path.join(pkgRoot, '.MTREE'), mtree.stdout);
} catch {
  // pacman can install packages without .MTREE; keep this optional for local builds.
}

const archiveEntries = ['.PKGINFO', 'usr'];
await stat(path.join(pkgRoot, '.MTREE')).then(() => archiveEntries.splice(1, 0, '.MTREE')).catch(() => {});

run('tar', ['--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--zstd', '-cf', packagePath, '-C', pkgRoot, ...archiveEntries], {
  stdio: 'inherit',
});

console.log(`Arch package written to ${path.relative(root, packagePath)}`);
