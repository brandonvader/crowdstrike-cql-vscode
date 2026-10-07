// Load the built CQL TextMate grammar with VS Code's own tokenizer
// (vscode-textmate + vscode-oniguruma), for scripts and tests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vsctm from 'vscode-textmate';
import onig from 'vscode-oniguruma';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCOPE = 'source.crowdstrike-cql';

export async function loadGrammar() {
  const wasm = fs.readFileSync(path.join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'));
  await onig.loadWASM(wasm.buffer);
  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new onig.OnigScanner(patterns),
      createOnigString: (s) => new onig.OnigString(s),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName !== SCOPE) return null;
      const file = path.join(root, 'syntaxes', 'crowdstrike-cql.tmLanguage.json');
      return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
  });
  return registry.loadGrammar(SCOPE);
}
