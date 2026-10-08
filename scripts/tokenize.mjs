// Print the TextMate tokens and scopes of a CQL file (or stdin), one line of
// tokens per source line. Development aid for tuning the grammar.
//
//   node scripts/tokenize.mjs examples/sample.logscale
//   echo 'a := x / 2' | node scripts/tokenize.mjs
//   node scripts/tokenize.mjs --full file.logscale   # full scope names

import fs from 'node:fs';
import { loadGrammar } from './textmate.mjs';

const args = process.argv.slice(2);
const full = args.includes('--full');
const file = args.find((a) => !a.startsWith('--'));
const text = fs.readFileSync(file ?? 0, 'utf8');

const grammar = await loadGrammar();
const short = (s) => s.replace(/\.cql$/, '').replace(/\.regexp/, '.re');

let state = null;
for (const line of text.split('\n')) {
  const r = grammar.tokenizeLine(line, state);
  state = r.ruleStack;
  console.log(`> ${line}`);
  const toks = r.tokens
    .map((t) => {
      const txt = line.slice(t.startIndex, t.endIndex);
      if (!txt.trim()) return null;
      const scopes = t.scopes.slice(1).filter((s) => full || !s.startsWith('meta.'));
      const leaf = scopes.length ? (full ? scopes.join(' ') : short(scopes.at(-1))) : '-';
      return `${JSON.stringify(txt)}:${leaf}`;
    })
    .filter(Boolean);
  if (toks.length) console.log('   ' + toks.join('  '));
}
