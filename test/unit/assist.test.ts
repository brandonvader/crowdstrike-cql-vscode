import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete, hover, signatureHelp } from '../../src/core/assist.ts';
import { lookup } from '../../src/core/catalog.ts';
import { parse } from './helpers.ts';

function at(src: string) {
  return { text: src.replace('‸', ''), offset: src.indexOf('‸') };
}
const labels = (src: string) => {
  const { text, offset } = at(src);
  return complete(text, offset).items.sort((a, b) => a.sortText.localeCompare(b.sortText)).map((i) => i.label);
};

test('catalog', () => {
  const g = lookup('groupby');
  assert.equal(g?.name, 'groupBy');
  assert.deepEqual(g?.params.map((p) => p.name), ['field', 'function', 'limit']);
  assert.equal(lookup('array:contains')?.name, 'array:contains');
  assert.equal(lookup('nonexistent'), undefined);
});

test('functions at the start of a step', () => {
  const items = labels('a=1 | ‸');
  assert.ok(items.includes('groupBy'));
  assert.ok(items.includes('array:contains'));
  assert.ok(items.indexOf('lowercase') > items.indexOf('lower'), 'deprecated sorts last');
  const { text, offset } = at('a=1 | gro‸');
  const c = complete(text, offset);
  assert.equal(text.slice(c.start, offset), 'gro');
  assert.equal(c.items.find((i) => i.label === 'groupBy')?.insert, 'groupBy($0)');
});

test('no parentheses when one follows', () => {
  const { text, offset } = at('gro‸()');
  assert.equal(complete(text, offset).items.find((i) => i.label === 'groupBy')?.insert, 'groupBy');
});

test('nothing after a filter comparison or inside literals', () => {
  assert.deepEqual(labels('user = ‸'), []);
  assert.deepEqual(labels('x = "‸'), []);
  assert.deepEqual(labels('// ‸'), []);
});

test('parameter names, required first, without the ones already used', () => {
  const items = labels('sort(order=asc, ‸');
  assert.deepEqual(items.slice(0, 3), ['field=', 'limit=', 'type=']);
  assert.ok(!items.includes('order='));
  assert.equal(items.at(-1 - items.filter((l) => !l.endsWith('=')).length), 'reverse=', 'deprecated parameter last');
  assert.equal(labels('groupBy(‸')[0], 'field=');
});

test('parameter values, default first', () => {
  assert.deepEqual(labels('sort(order=‸'), ['desc', 'asc']);
  assert.deepEqual(labels('sort(field=x, reverse=‸'), ['false', 'true']);
});

test('function-valued parameters offer functions, aggregates first', () => {
  const items = labels('groupBy(x, function=‸');
  assert.ok(items.indexOf('count') < items.indexOf('lower'));
  assert.ok(labels('groupBy(x, function=[count(), ‸').includes('max'));
});

test('signature help tracks the active parameter', () => {
  const sig = (src: string) => {
    const { text, offset } = at(src);
    const s = signatureHelp(text, offset)!;
    return { label: s.label, active: s.params[s.active] ? s.label.slice(...s.params[s.active].range) : null };
  };
  assert.deepEqual(sig('groupBy(‸'), { label: 'groupBy(field, [function], [limit])', active: 'field' });
  assert.deepEqual(sig('groupBy(x, limit=‸'), { label: 'groupBy(field, [function], [limit])', active: 'limit' });
  assert.deepEqual(sig('groupBy(x, function=[count(), ‸'), { label: 'groupBy(field, [function], [limit])', active: 'function' });
  assert.equal(sig('groupBy(x, ‸').active, null);
  assert.equal(signatureHelp('nope(', 5), undefined);
});

test('hover on function names and named arguments', () => {
  const code = 'a=1 | groupBy(x, limit=max) | array:contains(array="a[]", value=1)';
  const tree = parse(code);
  const h1 = hover(tree, code.indexOf('groupBy') + 2)!;
  assert.equal(code.slice(h1.start, h1.end), 'groupBy');
  assert.match(h1.markdown, /groupBy\(field, \[function\], \[limit\]\)/);
  assert.match(h1.markdown, /\(https:\/\/library\.humio\.com\/crowdstrike-query-language\/functions-groupby\.html\)/);
  const h2 = hover(tree, code.indexOf('limit=') + 1)!;
  assert.match(h2.markdown, /functions-groupby\.html#query-functions-groupby-limit\)/);
  assert.match(h2.markdown, /values: `max`/);
  const h3 = hover(tree, code.indexOf('array:contains') + 7)!;
  assert.equal(code.slice(h3.start, h3.end), 'array:contains');
  assert.equal(hover(tree, code.indexOf('x,')), undefined);
});
