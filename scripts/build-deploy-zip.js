/**
 * Builds the upload archive for bot-hosting.net.
 *
 * The archive holds the project files at its root, so extracting it in the
 * panel's Files tab puts `package.json` and `src/` straight into the
 * deployment root. `node_modules` is never shipped: the panel installs the
 * dependencies from package.json on boot.
 *
 * Secrets are never shipped either: `.env` is excluded and the environment is
 * configured in the panel instead.
 *
 * Usage:
 *   node scripts/build-deploy-zip.js [options]
 *
 *   --out <file>     output archive (default: dist/hellocat-bot.zip)
 *   --no-web         leave the web terminal (web/) out of the archive
 *   --no-state       leave the runtime state (src/storage/data/*.json) out, so
 *                    the deployment starts with an empty store
 *   --with-tests     also ship the test suite (tests/)
 *
 * The runtime state is shipped by default so that the users, economy and
 * leaderboard carry over. The stored flag hashes are tied to the FLAG_SECRET
 * of this machine: either configure the same secret on the host, or set
 * CHALLENGE_IMPORT_ON_START=true there, which re-hashes every flag in
 * `challenges/` with the secret configured in the panel.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const WITH_WEB = !has('no-web');
const WITH_TESTS = has('with-tests');
const WITH_STATE = !has('no-state');
const OUT = path.resolve(ROOT, value('out', 'dist/hellocat-bot.zip'));

/** Directories copied into the archive. */
const INCLUDE_DIRS = ['src', 'challenges', 'scripts', 'deploy'];

/** Individual files copied into the archive. */
const INCLUDE_FILES = ['package.json', 'package-lock.json', '.env.example', 'README.md', 'LICENSE'];

/** Never shipped: installed packages, VCS data and local tooling. */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.cache',
  '.local',
  'dist',
  'coverage',
  '.idea',
  '.vscode',
  'termux-ngrok',
]);

const isExcludedFile = (name) => {
  // Any .env variant except the template.
  if (name.startsWith('.env') && name !== '.env.example') return true;
  // Local binaries and generated noise.
  if (name === 'ngrok') return true;
  if (name.endsWith('.bak')) return true;
  if (name.includes('.corrupt-')) return true;
  if (name.endsWith('.lock')) return true;
  if (name.endsWith('.tmp')) return true;
  if (name.endsWith('.log')) return true;
  return false;
};

async function copyTree(staging, relativeDir, { keepState = true } = {}) {
  const from = path.join(ROOT, relativeDir);
  const to = path.join(staging, relativeDir);
  await fs.mkdir(to, { recursive: true });
  await fs.cp(from, to, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (EXCLUDE_DIRS.has(base)) return false;
      if (isExcludedFile(base)) return false;
      const rel = path.relative(ROOT, src);
      const inStateDir = rel.split(path.sep).slice(0, 3).join('/') === 'src/storage/data';
      if (!keepState && inStateDir) return base === '.gitkeep';
      return true;
    },
  });
}

async function copyFile(staging, relative, source = relative) {
  const from = path.join(ROOT, source);
  await fs.mkdir(path.dirname(path.join(staging, relative)), { recursive: true });
  await fs.copyFile(from, path.join(staging, relative));
}

async function exists(relative) {
  return Boolean(await fs.stat(path.join(ROOT, relative)).catch(() => null));
}

async function writeEmpty(staging, relative) {
  const target = path.join(staging, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, '', 'utf8');
}

async function measure(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await measure(full);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await fs.stat(full)).size;
    }
  }
  return { files, bytes };
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function hasZip() {
  try {
    await run('zip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function zipStaging(staging, out) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.rm(out, { force: true });
  // File names are fed through stdin so the archive stores clean relative
  // paths ("src/index.js") instead of "./src/index.js".
  await run(
    'sh',
    ['-c', 'find . -type f | sed "s|^\\./||" | sort | zip -q -X "$1" -@', 'sh', out],
    { cwd: staging },
  );
}

async function main() {
  if (!(await hasZip())) {
    throw new Error('The "zip" command is required to build the deployment archive.');
  }

  const staging = path.join(ROOT, 'dist', '.staging');
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });

  for (const dir of INCLUDE_DIRS) {
    await copyTree(staging, dir, { keepState: WITH_STATE });
  }
  const hasWeb = await exists('web');
  if (WITH_WEB && hasWeb) await copyTree(staging, 'web');
  if (WITH_TESTS) await copyTree(staging, 'tests');

  for (const file of INCLUDE_FILES) {
    await copyFile(staging, file);
  }

  // The panel needs these directories to exist and to be writable.
  await writeEmpty(staging, path.join('logs', '.gitkeep'));
  await writeEmpty(staging, path.join('backups', '.gitkeep'));
  await writeEmpty(staging, path.join('src', 'storage', 'data', '.gitkeep'));

  const guide = path.join(ROOT, 'deploy', 'bot-hosting.md');
  if (await fs.stat(guide).catch(() => null)) {
    await copyFile(staging, 'DEPLOY.md', path.join('deploy', 'bot-hosting.md'));
  }

  const stats = await measure(staging);
  await zipStaging(staging, OUT);
  const { size } = await fs.stat(OUT);

  console.log(`Deployment archive: ${path.relative(ROOT, OUT)}`);
  console.log(`  files:          ${stats.files}`);
  console.log(`  uncompressed:   ${(stats.bytes / 1024).toFixed(1)} KiB`);
  console.log(`  zip size:       ${(size / 1024).toFixed(1)} KiB`);
  console.log(`  web terminal:   ${WITH_WEB ? (hasWeb ? 'included' : 'missing from this checkout') : 'excluded (--with-web to include)'}`);
  console.log(`  runtime state:  ${WITH_STATE ? 'included' : 'empty (--no-state)'}`);

  await fs.rm(staging, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`[BUILD FAILED] ${error.message}`);
  process.exitCode = 1;
});
