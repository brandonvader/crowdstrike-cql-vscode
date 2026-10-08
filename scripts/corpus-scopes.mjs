// Tokenize every CQL example in the docs corpus and flag the symptoms of a
// grammar that lost track of structure:
//   - unclosed: the rule stack is not back at the root after the last line
//     (an unbalanced bracket, or a begin/end rule that never ended)
//   - cutoff:   a string or regex literal ran into the end of a line
//
// The corpus lives outside this repo (see ~/Local_Projects/cql-corpus); set
// CQL_CORPUS to point elsewhere. Skips cleanly when it is absent.
//
//   npm run corpus:scopes [-- --kind query,step --show 20]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vsctm from 'vscode-textmate';
import { loadGrammar } from './textmate.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const kinds = new Set(opt('kind', 'query').split(','));
const show = Number(opt('show', 15));

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

const grammar = await loadGrammar();
const problems = { unclosed: [], cutoff: [] };

for (const e of examples) {
  let state = vsctm.INITIAL;
  let cutoff = null;
  for (const line of e.code.split('\n')) {
    const r = grammar.tokenizeLine(line, state);
    state = r.ruleStack;
    const last = r.tokens.at(-1);
    const open = last?.scopes.find((s) => /^string\.(quoted|regexp)/.test(s));
    // A literal still open on the last token of a line was cut off by EOL,
    // unless the token is its own closing delimiter.
    if (open && !cutoff && !last.scopes.some((s) => s.startsWith('punctuation.definition.string.end') || s.startsWith('keyword.other.flag'))) {
      cutoff = line;
    }
  }
  if (cutoff) problems.cutoff.push({ e, detail: cutoff });
  if (!state.equals(vsctm.INITIAL) && state.depth > 1) problems.unclosed.push({ e, detail: `depth ${state.depth}` });
}

const n = examples.length;
console.log(`${n} examples (${[...kinds].join(', ')})`);
for (const [kind, list] of Object.entries(problems)) {
  console.log(`\n${kind}: ${list.length} (${((100 * list.length) / n).toFixed(1)}%)`);
  for (const { e, detail } of list.slice(0, show)) {
    console.log(`  ${e.id} ${e.url}\n    ${detail.length > 110 ? detail.slice(0, 110) + '…' : detail}`);
  }
}
const clean = n - new Set([...problems.unclosed, ...problems.cutoff].map((p) => p.e.id)).size;
console.log(`\nclean: ${clean}/${n} (${((100 * clean) / n).toFixed(1)}%)`);
