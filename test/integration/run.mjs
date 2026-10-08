// Runs test/integration/suite.cjs inside a real VS Code with the extension
// loaded, in the desktop (Node) extension host and then in the web worker
// extension host that VS Code for the Web uses. Set CQL_IT_HOSTS=desktop to
// skip the web host (desktop builds before ~1.100 cannot load tests into it). Uses $VSCODE_BIN when set (a local install), otherwise downloads
// the version given by $VSCODE_VERSION (default: the minimum in `engines`) into
// .vscode-test/. Needs a display: run under xvfb-run on Linux.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cql-it-'));
const workspace = path.join(tmp, 'workspace');
fs.mkdirSync(workspace);

try {
  for (const kind of (process.env.CQL_IT_HOSTS ?? 'desktop,web').split(',')) {
    console.log(`\n${kind} extension host`);
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, 'test/integration/suite.cjs'),
      vscodeExecutablePath: process.env.VSCODE_BIN,
      version: process.env.VSCODE_VERSION ?? pkg.engines.vscode.replace(/^\^/, ''),
      launchArgs: [
        workspace,
        `--user-data-dir=${path.join(tmp, `profile-${kind}`)}`,
        ...(kind === 'web' ? ['--extensionDevelopmentKind=web'] : []),
        '--disable-extensions',
        '--disable-gpu',
        '--no-sandbox',
        '--skip-welcome',
        '--skip-release-notes',
      ],
    });
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
