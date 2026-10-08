// Compare the tree-sitter semantic tokens with the TextMate grammar over the
// docs corpus. For each semantic token, the TextMate scope at the same spot
// should be the scope that package.json maps the token type to; a mismatch is
// either the semantic layer correcting the line-based grammar or a
// classification bug. Also reports the tree-sitter parse rate.
//
//   npm run corpus:semantic [-- --kind query --show 5]

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vsctm from 'vscode-textmate';
import { classify } from '../src/core/classify.ts';
import { createParser } from '../src/core/parser.ts';
import { loadGrammar } from './textmate.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const kinds = new Set(opt('kind', 'query').split(','));
const show = Number(opt('show', 3));

const corpus = process.env.CQL_CORPUS ?? path.join(os.homedir(), 'Local_Projects', 'cql-corpus');
const file = path.join(corpus, 'examples.jsonl');
if (!fs.existsSync(file)) {
  console.log(`corpus not found at ${file}; skipping`);
  process.exit(0);
}
const examples = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((e) => kinds.has(e.kind));

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scopeOf = pkg.contributes.semanticTokenScopes[0].scopes;

const require = createRequire(import.meta.url);
const parser = await createParser(
  fs.readFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  fs.readFileSync('grammar/tree-sitter-crowdstrike_cql.wasm'),
);
const grammar = await loadGrammar();

let clean = 0;
let total = 0;
let agree = 0;
const diffs = new Map(); // "type <- textmate scope" -> [{id, line, text}]

for (const ex of examples) {
  const tree = parser.parse(ex.code);
  if (!tree.rootNode.hasError) clean++;
  const lines = ex.code.split('\n');

  // TextMate leaf scope for every character.
  let state = vsctm.INITIAL;
  const tm = lines.map((line) => {
    const r = grammar.tokenizeLine(line, state);
    state = r.ruleStack;
    const at = new Array(line.length);
    for (const t of r.tokens) for (let c = t.startIndex; c < t.endIndex; c++) at[c] = t.scopes.at(-1);
    return at;
  });

  for (const t of classify(tree)) {
    total++;
    const want = scopeOf[t.type][0];
    const got = tm[t.line][t.char] ?? '(none)';
    if (got === want) {
      agree++;
      continue;
    }
    const key = `${t.type.padEnd(14)} <- ${got}`;
    if (!diffs.has(key)) diffs.set(key, []);
    diffs.get(key).push({ id: ex.id, line: lines[t.line], text: lines[t.line].slice(t.char, t.char + t.length) });
  }
  tree.delete();
}

const pct = (a, b) => ((100 * a) / b).toFixed(1) + '%';
console.log(`${examples.length} examples (${[...kinds].join(',')}): ${clean} parse without errors (${pct(clean, examples.length)})`);
console.log(`${total} semantic tokens: ${agree} agree with TextMate (${pct(agree, total)})\n`);
for (const [key, list] of [...diffs].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(list.length).padStart(5)}  ${key}`);
  for (const d of list.slice(0, show)) console.log(`         ${d.id}  \`${d.text}\` in: ${d.line.trim().slice(0, 100)}`);
}
