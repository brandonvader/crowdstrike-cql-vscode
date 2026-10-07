# Vendored test grammars

VS Code's built-in Markdown and YAML TextMate grammars, used only to test that
this extension's injection grammars highlight CQL inside Markdown code fences
and YAML `queryString` values. They are not packaged into the extension.

Copied from VS Code 1.141.0.
Refresh with `scripts/update-test-grammars.sh`.

- `markdown.tmLanguage.json`: from microsoft/vscode-markdown-tm-grammar, MIT
  License, Copyright (c) Microsoft Corporation.
- `yaml*.tmLanguage.json`: from RedCMD/YAML-Syntax-Highlighter, MIT License,
  Copyright (c) RedCMD.
