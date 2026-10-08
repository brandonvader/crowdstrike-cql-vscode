// Bundles src/extension.ts for desktop (Node) and web (browser worker)
// extension hosts, and copies the tree-sitter runtime next to them.
//
//   node scripts/build-extension.mjs [--watch] [--minify]

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const require = createRequire(import.meta.url);

const common = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  external: ['vscode'],
  sourcemap: !minify,
  minify,
  logLevel: 'info',
};

fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm'), 'dist/web-tree-sitter.wasm');

const contexts = await Promise.all([
  // Desktop: web-tree-sitter's CommonJS build (its ESM build needs import.meta).
  esbuild.context({
    ...common,
    platform: 'node',
    outfile: 'dist/extension.js',
    alias: { 'web-tree-sitter': require.resolve('web-tree-sitter') },
  }),
  // Web: the ESM build reads import.meta.url only to locate its .wasm, which
  // we pass in as bytes instead (see src/core/parser.ts).
  esbuild.context({
    ...common,
    platform: 'browser',
    outfile: 'dist/web/extension.js',
    define: { 'import.meta.url': 'undefined' },
  }),
]);
if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
}
