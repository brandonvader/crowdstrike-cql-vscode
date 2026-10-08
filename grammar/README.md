# Vendored tree-sitter grammar

`tree-sitter-crowdstrike_cql.wasm` is the CQL tree-sitter grammar from the
companion Zed extension, compiled to WebAssembly for
[web-tree-sitter](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web).

- Source: <https://github.com/brandonvader/crowdstrike-cql-zed/tree/main/grammar>
  (GPL-3.0-only, same author)
- Commit: `f20875de4595ea1d141a84c8c6e1a524c83db65f`
- Built with: tree-sitter-cli 0.27.0 (`tree-sitter build --wasm`); the
  build is reproducible, SHA-256
  `533446b4147d1e5ca01da7bb52f3c1ba6d7db0576eeb1cf610dc1418e7c4135a`
- Runtime: web-tree-sitter 0.27.0 (keep the CLI and runtime on the same
  minor version)

To rebuild, or to move to a newer grammar commit:

```sh
scripts/build-wasm.sh            # the commit above
scripts/build-wasm.sh <commit>   # then update the commit above
npm test
npm run corpus:semantic          # if the docs corpus is available
```
