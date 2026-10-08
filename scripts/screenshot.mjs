// Screenshot VS Code with this extension loaded, headless under Xvfb.
//
//   xvfb-run -a -s "-screen 0 1400x900x24" node scripts/screenshot.mjs \
//     --file examples/sample.logscale --out shot.png [--theme "Default Light Modern"]
//
// Launches VS Code (`code` on PATH, or $VSCODE_BIN) with a throwaway profile
// and --remote-debugging-port, then captures the window through the Chrome
// DevTools Protocol. Used for checking highlighting and for README images.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const file = path.resolve(opt('file', path.join(root, 'examples', 'sample.logscale')));
const out = path.resolve(opt('out', 'screenshot.png'));
const theme = opt('theme', 'Default Dark Modern');
const wait = Number(opt('wait', 8000));
const port = 9300 + Math.floor(Math.random() * 500);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cql-shot-'));
fs.mkdirSync(path.join(profile, 'user', 'User'), { recursive: true });
fs.writeFileSync(
  path.join(profile, 'user', 'User', 'settings.json'),
  JSON.stringify({
    'workbench.colorTheme': theme,
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'window.restoreWindows': 'none',
    'editor.minimap.enabled': false,
    'editor.fontSize': 15,
    'editor.semanticHighlighting.enabled': true,
    'security.workspace.trust.enabled': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.ignoreRecommendations': true,
    'chat.disableAIFeatures': true,
  }),
);

const bin = process.env.VSCODE_BIN ?? 'code';
const child = spawn(
  bin,
  [
    '--new-window',
    '--wait',
    '--disable-gpu',
    '--no-sandbox',
    '--skip-welcome',
    '--skip-release-notes',
    `--extensionDevelopmentPath=${root}`,
    `--user-data-dir=${path.join(profile, 'user')}`,
    `--extensions-dir=${path.join(profile, 'ext')}`,
    `--remote-debugging-port=${port}`,
    file,
  ],
  { stdio: 'ignore', detached: true },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 1;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page' && /workbench/.test(t.url));
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error('VS Code window did not appear');
  await sleep(wait); // let the editor open the file and tokenize

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const png = await new Promise((res, rej) => {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) (msg.result ? res(msg.result.data) : rej(new Error(JSON.stringify(msg.error))));
    };
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  ws.close();
  fs.writeFileSync(out, Buffer.from(png, 'base64'));
  console.log(`wrote ${out}`);
  exitCode = 0;
} catch (e) {
  console.error(e.message);
} finally {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(exitCode);
}
