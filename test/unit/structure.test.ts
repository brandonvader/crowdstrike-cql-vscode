import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syntaxProblems } from '../../src/core/diagnostics.ts';
import { folding } from '../../src/core/folding.ts';
import { outline, type OutlineItem } from '../../src/core/outline.ts';
import { selectionChain } from '../../src/core/selection.ts';
import { parse } from './helpers.ts';

type Shape = [string, string, Shape[]?];
const shape = (items: OutlineItem[]): Shape[] =>
  items.map((i) => (i.children.length ? [i.name, i.detail, shape(i.children)] : [i.name, i.detail]));

test('outline lists pipeline stages, nested through subqueries and branches', () => {
  const code = [
    '#event_simpleName=ProcessRollup2',
    '| name := lower(ImageFileName)',
    '| case {',
    '    a=1 | x := 2;',
    '    * }',
    '| status match { ok => groupBy(aid) }',
    '| correlate(A: { y=1 | count() }, sequence=true)',
    '| $"Saved"()',
  ].join('\n');
  assert.deepEqual(shape(outline(parse(code))), [
    ['name', ':= lower(ImageFileName)'],
    ['case', '', [['a=1 | x := 2', '', [['x', ':= 2']]], ['*', '']]],
    ['status', 'match', [['ok', '=>', [['groupBy', 'aid']]]]],
    ['correlate', 'A: { y=1 | count() }, sequence=true', [['A', '', [['count', '']]]]],
    ['$"Saved"', ''],
  ]);
});

test('outline selection range is the name', () => {
  const [item] = outline(parse('| x := 1'));
  assert.deepEqual(item.selectionRange, { start: { row: 0, column: 2 }, end: { row: 0, column: 3 } });
});

test('folding: brackets keep a closer on its own line visible', () => {
  const code = ['groupBy(', '  [a,', '   b],', '  function=count()', ')', '| case {', '  x=1;', '  * }'].join('\n');
  assert.deepEqual(folding(parse(code), code.split('\n')), [
    { start: 0, end: 3 },
    { start: 1, end: 2 },
    { start: 5, end: 7 },
  ]);
});

test('folding: comment blocks and regions', () => {
  const code = ['// #region hunt', '// one', '// two', 'x=1', '/* a', 'b */', '// #endregion'].join('\n');
  assert.deepEqual(folding(parse(code), code.split('\n')), [
    { start: 0, end: 6, kind: 'region' },
    { start: 1, end: 2, kind: 'comment' },
    { start: 4, end: 5, kind: 'comment' },
  ]);
});

test('selection grows from token to pipeline', () => {
  const code = 'a=1 | groupBy([x, y])';
  const texts = selectionChain(parse(code), code.lastIndexOf('y')).map((r) => code.slice(r.start, r.end));
  assert.deepEqual(texts, ['y', '[x, y]', 'groupBy([x, y])', code]);
});

test('syntax problems', () => {
  assert.deepEqual(syntaxProblems(parse('a=1 | groupBy(x)')), []);
  const [p] = syntaxProblems(parse('a=1 | groupBy([x)'));
  assert.ok(p, 'expected a problem');
  assert.equal(p.start.row, 0);
});
