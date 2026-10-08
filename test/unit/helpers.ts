import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Tree } from 'web-tree-sitter';
import { createParser } from '../../src/core/parser.ts';

const require = createRequire(import.meta.url);
const parser = await createParser(
  fs.readFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  fs.readFileSync(new URL('../../grammar/tree-sitter-crowdstrike_cql.wasm', import.meta.url)),
);

export function parse(code: string): Tree {
  const tree = parser.parse(code);
  if (!tree) throw new Error('parse failed');
  return tree;
}
