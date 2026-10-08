import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify } from '../../src/core/classify.ts';
import { parse } from './helpers.ts';

/** `[text, type]` pairs for every semantic token, in document order. */
function tokens(code: string): [string, string][] {
  const lines = code.split('\n');
  return classify(parse(code)).map((t) => [lines[t.line].slice(t.char, t.char + t.length), t.type]);
}

test('filter: left side is a field, right side is a pattern', () => {
  assert.deepEqual(tokens('user = admin'), [
    ['user', 'property'],
    ['admin', 'pattern'],
  ]);
  assert.deepEqual(tokens('#event_simpleName=ProcessRollup2 @timestamp>1 x=*'), [
    ['#event_simpleName', 'tagField'],
    ['ProcessRollup2', 'pattern'],
    ['@timestamp', 'metaField'],
    ['x', 'property'],
    ['*', 'wildcard'],
  ]);
});

test('expressions: bare words are fields, across lines too', () => {
  assert.deepEqual(tokens('x := a +\n  b * c'), [
    ['x', 'property'],
    ['a', 'variable'],
    ['b', 'variable'],
    ['c', 'variable'],
  ]);
  assert.deepEqual(tokens('total := bytes_in\n  / duration'), [
    ['total', 'property'],
    ['bytes_in', 'variable'],
    ['duration', 'variable'],
  ]);
});

test('functions, named arguments and saved queries', () => {
  assert.deepEqual(tokens('groupBy([aid], function=count(as=n)) | $"My Query"(x=1)'), [
    ['groupBy', 'function'],
    ['aid', 'variable'],
    ['function', 'parameter'],
    ['count', 'function'],
    ['as', 'parameter'],
    ['n', 'variable'],
    ['"My Query"', 'savedQuery'],
    ['x', 'parameter'],
  ]);
  assert.deepEqual(tokens('x := array:exists(array="a[]", condition=test(y==2))')[1], ['array:exists', 'function']);
});

test('query parameters keep the sigil out of the token', () => {
  assert.deepEqual(tokens('aid = ?aid | t := ?{token=*}'), [
    ['aid', 'property'],
    ['aid', 'queryParameter'],
    ['t', 'property'],
    ['token', 'queryParameter'],
    ['*', 'wildcard'],
  ]);
});

test('correlate: labels, attributes and field links', () => {
  const code = 'correlate(A: { x=1 } include: [u], B: { aid <=> A.aid }, within=5m)';
  assert.deepEqual(tokens(code), [
    ['correlate', 'function'],
    ['A', 'label'],
    ['x', 'property'],
    ['include', 'attribute'],
    ['u', 'variable'],
    ['B', 'label'],
    ['aid', 'property'],
    ['A.aid', 'property'],
    ['within', 'parameter'],
  ]);
});

test('match guards are patterns', () => {
  assert.deepEqual(tokens('status match { ok => x := 1; * => x := 2 }'), [
    ['status', 'property'],
    ['ok', 'pattern'],
    ['x', 'property'],
    ['*', 'wildcard'],
    ['x', 'property'],
  ]);
});

test('steps with a syntax error are left to the TextMate grammar', () => {
  assert.deepEqual(tokens('a=1 | ioc:lookup(field=[x], b="d" c="e") | y := z'), [
    ['a', 'property'],
    ['y', 'property'],
    ['z', 'variable'],
  ]);
});
