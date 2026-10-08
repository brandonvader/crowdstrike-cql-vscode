#!/usr/bin/env bash
# Rebuild grammar/tree-sitter-crowdstrike_cql.wasm from the tree-sitter grammar
# in the Zed extension repository, at the commit pinned in grammar/README.md.
#
#   scripts/build-wasm.sh [commit]
#
# The tree-sitter CLI downloads its own WASI SDK on first use (no Docker or
# emscripten needed). Update the commit in grammar/README.md when bumping.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="https://github.com/brandonvader/crowdstrike-cql-zed"
cli="tree-sitter-cli@0.27.0"
commit="${1:-$(sed -n 's/^- Commit: `\([0-9a-f]\{40\}\)`$/\1/p' "$root/grammar/README.md")}"
[[ -n "$commit" ]] || { echo "no commit pinned in grammar/README.md" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q src
git -C "$work/src" fetch -q --depth 1 "$repo" "$commit"
git -C "$work/src" checkout -q FETCH_HEAD

npx --yes "$cli" build --wasm -o "$root/grammar/tree-sitter-crowdstrike_cql.wasm" "$work/src/grammar"
sha256sum "$root/grammar/tree-sitter-crowdstrike_cql.wasm"
