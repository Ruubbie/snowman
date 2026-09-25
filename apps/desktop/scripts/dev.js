// `npm run dev`: start Vite, wait until it answers, then start Electron
// pointed at it. Ctrl+C (or closing the window) stops both. No extra deps.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5178;
const DEV_URL = `http://127.0.0.1:${PORT}/`;

const viteBin = require.resolve('vite/bin/vite.js');
const electronBin = require('electron'); // the electron package exports the binary path

const children = [];
function stopAll(code = 0) {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const vite = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'inherit' });
children.push(vite);
vite.on('exit', (code) => stopAll(code ?? 0));

async function waitForVite(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(DEV_URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite did not start on ${DEV_URL}`);
}

try {
  await waitForVite();
} catch (err) {
  console.error(err.message);
  stopAll(1);
}

const electron = spawn(electronBin, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SNOWMAN_DEV_URL: DEV_URL },
});
children.push(electron);
electron.on('exit', (code) => stopAll(code ?? 0));
