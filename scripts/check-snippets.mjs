// Validate snippets/crowdstrike-cql.code-snippets:
//   1. every literal `$` is escaped (`\\$` in JSON), so regex anchors are not
//      read as tab stops or variables;
//   2. tab stops are well formed and `${n:...}` braces balance;
//   3. the body, expanded with its default values, tokenizes back to the
//      grammar's root state (no unclosed string/regex/bracket).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vsctm from 'vscode-textmate';
import { loadGrammar } from './textmate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'snippets', 'crowdstrike-cql.code-snippets');
const snippets = JSON.parse(fs.readFileSync(file, 'utf8'));
const grammar = await loadGrammar();

// Expand a snippet body to plain text using defaults; throws on bad syntax.
function expand(body) {
  let out = '';
  let i = 0;
  const parse = (stopAtBrace) => {
    let s = '';
    while (i < body.length) {
      const c = body[i];
      if (c === '\\') {
        s += body[i + 1] ?? '';
        i += 2;
      } else if (c === '}' && stopAtBrace) {
        i++;
        return s;
      } else if (c === '$') {
        const m = /^\$(\d+)/.exec(body.slice(i));
        if (m) {
          i += m[0].length;
          continue;
        }
        const open = /^\$\{(\d+)(:|\||\})/.exec(body.slice(i));
        if (!open) throw new Error(`unescaped '$' at …${body.slice(Math.max(0, i - 15), i + 10)}…`);
        i += open[0].length;
        if (open[2] === '}') continue;
        if (open[2] === '|') {
          const end = body.indexOf('|}', i);
          if (end < 0) throw new Error('unterminated choice');
          s += body.slice(i, end).split(',')[0];
          i = end + 2;
        } else {
          s += parse(true);
        }
      } else {
        s += c;
        i++;
      }
    }
    if (stopAtBrace) throw new Error('unbalanced ${…}');
    return s;
  };
  out = parse(false);
  return out;
}

let bad = 0;
for (const [name, snip] of Object.entries(snippets)) {
  const body = Array.isArray(snip.body) ? snip.body.join('\n') : snip.body;
  try {
    const text = expand(body);
    let state = vsctm.INITIAL;
    for (const line of text.split('\n')) state = grammar.tokenizeLine(line, state).ruleStack;
    if (state.depth > 1) throw new Error(`expanded body leaves the grammar ${state.depth - 1} rule(s) deep:\n    ${text.replace(/\n/g, '\n    ')}`);
  } catch (e) {
    console.error(`✗ ${name} (${snip.prefix}): ${e.message}`);
    bad++;
  }
}
console.log(bad ? `${bad} problem(s)` : `✓ ${Object.keys(snippets).length} snippets OK`);
process.exit(bad ? 1 : 0);
