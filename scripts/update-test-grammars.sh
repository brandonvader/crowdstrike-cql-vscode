#!/usr/bin/env bash
# Refresh the vendored VS Code built-in grammars used by the injection tests
# (test/grammar/*.md, *.yaml) from a local VS Code install.
set -euo pipefail
src="${VSCODE_HOME:-$HOME/.local/share/vscode}/resources/app/extensions"
dst="$(dirname "$0")/../test/fixtures/grammars"
cp "$src/markdown-basics/syntaxes/markdown.tmLanguage.json" "$dst/"
cp "$src"/yaml/syntaxes/yaml*.tmLanguage.json "$dst/"
version="$("${VSCODE_HOME:-$HOME/.local/share/vscode}/bin/code" --version | head -1)"
sed -i "s/^Copied from VS Code .*/Copied from VS Code $version./" "$dst/README.md"
echo "updated from VS Code $version"
