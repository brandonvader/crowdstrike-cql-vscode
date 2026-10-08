import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorContext } from '../../src/core/context.ts';

/** Context at the `|` marker (written as `‸`). */
function at(src: string) {
  const offset = src.indexOf('‸');
  return cursorContext(src.replace('‸', ''), offset);
}

test('call, argument index and current argument name', () => {
  const c = at('a=1 | groupBy([x, y], function=cou‸')!;
  assert.equal(c.call?.name, 'groupBy');
  assert.equal(c.call?.argIndex, 1);
  assert.equal(c.call?.argName, 'function');
  assert.deepEqual(c.call?.used, ['function']);
  assert.equal(c.call?.atArgLevel, true);
  assert.equal(c.inLiteral, false);
});

test('nested brackets and calls', () => {
  let c = at('groupBy([x, ‸');
  assert.equal(c.call?.name, 'groupBy');
  assert.equal(c.call?.atArgLevel, false);
  c = at('groupBy(x, function=[count(as=n), max(‸');
  assert.equal(c.call?.name, 'max');
  c = at('groupBy(x, function=[count(as=n), ‸');
  assert.equal(c.call?.name, 'groupBy');
  assert.equal(c.call?.argName, 'function');
  c = at('count() | sort(‸');
  assert.equal(c.call?.name, 'sort');
  assert.equal(c.call?.argIndex, 0);
  assert.equal(c.call?.argName, undefined);
  assert.equal(at('count() | x‸').call, undefined);
});

test('namespaced functions and saved queries', () => {
  assert.equal(at('x := array:contains(array="a[]", ‸').call?.name, 'array:contains');
  assert.equal(at('$"My Query"(x=1, ‸').call?.name, '$"My Query"');
});

test('comparison operators inside calls are not argument names', () => {
  const c = at('test(a == 1, b <= 2, ‸');
  assert.equal(c.call?.argIndex, 2);
  assert.deepEqual(c.call?.used, []);
});

test('literals', () => {
  assert.equal(at('x = "abc‸').inLiteral, true);
  assert.equal(at('x = "a,b" | sort(‸').inLiteral, false);
  assert.equal(at('// sort(‸').inLiteral, true);
  assert.equal(at('/* a\n b ‸').inLiteral, true);
  assert.equal(at('/* a */ sort(‸').call?.name, 'sort');
  assert.equal(at('x = /ab(c‸').inLiteral, true);
  assert.equal(at('x = /a(b/i | sort(‸').call?.name, 'sort');
  assert.equal(at('url = https://example.com/ | sort(‸').call?.name, 'sort');
  assert.equal(at('x := a / b | sort(‸').call?.name, 'sort');
});

test('after a filter comparison', () => {
  assert.equal(at('user = adm‸').afterComparison, true);
  assert.equal(at('user != ‸').afterComparison, true);
  assert.equal(at('x := cou‸').afterComparison, false);
  assert.equal(at('x =~ repl‸').afterComparison, false);
  assert.equal(at('a=1 | cou‸').afterComparison, false);
  assert.equal(at('sort(order=‸').afterComparison, false);
});

test('word start includes namespace and sigils', () => {
  const src = 'x := array:con‸';
  assert.equal(at(src).wordStart, src.indexOf('array'));
});
