// Compile syntaxes/src/*.tmLanguage.yaml to syntaxes/*.tmLanguage.json.
//
// Expands `{{name}}` placeholders from the grammar's top-level `variables`
// map (variables may reference each other), then drops the map. Every regex
// is compiled with Oniguruma so a bad pattern fails the build, not the editor.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import onig from 'vscode-oniguruma';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'syntaxes', 'src');
const outDir = path.join(root, 'syntaxes');

const wasm = fs.readFileSync(path.join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'));
await onig.loadWASM(wasm.buffer);

function expand(str, vars, where) {
  let out = str;
  for (let i = 0; i < 20 && out.includes('{{'); i++) {
    out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      if (!(name in vars)) throw new Error(`${where}: unknown variable {{${name}}}`);
      return vars[name];
    });
  }
  if (out.includes('{{')) throw new Error(`${where}: variable expansion did not terminate`);
  return out;
}

const REGEX_KEYS = new Set(['match', 'begin', 'end', 'while']);

function walk(node, vars, where, errors) {
  if (Array.isArray(node)) return node.map((n, i) => walk(n, vars, `${where}[${i}]`, errors));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        out[k] = expand(v, vars, `${where}.${k}`);
        if (REGEX_KEYS.has(k)) {
          // end/while back-references (\1) are filled in from the begin
          // captures at runtime; validate with a stand-in.
          const re = k === 'end' || k === 'while' ? out[k].replace(/\\(\d+)/g, 'x') : out[k];
          try {
            new onig.OnigScanner([re]).dispose();
          } catch (e) {
            errors.push(`${where}.${k}: ${e.message}\n    ${out[k]}`);
          }
        }
      } else {
        out[k] = walk(v, vars, `${where}.${k}`, errors);
      }
    }
    return out;
  }
  return node;
}

let failed = false;
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.tmLanguage.yaml'))) {
  const doc = yaml.load(fs.readFileSync(path.join(srcDir, file), 'utf8'));
  const vars = doc.variables ?? {};
  delete doc.variables;
  const errors = [];
  const grammar = walk(doc, vars, file, errors);
  if (errors.length) {
    failed = true;
    console.error(`✗ ${file}\n  ${errors.join('\n  ')}`);
    continue;
  }
  const outFile = path.join(outDir, file.replace(/\.yaml$/, '.json'));
  fs.writeFileSync(outFile, JSON.stringify(grammar, null, 2) + '\n');
  console.log(`✓ ${path.relative(root, outFile)}`);
}
process.exit(failed ? 1 : 0);
