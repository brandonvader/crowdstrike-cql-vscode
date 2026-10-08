# Changelog

## 0.1.0 (unreleased)

- Language `crowdstrike-cql` for `.ngsiem`, `.logscale` and `.lql` files.
- TextMate grammar following CQL semantics: fields vs. unquoted filter values,
  expressions vs. filters, division vs. regex, URLs vs. comments, `case` and
  `match` statements, saved queries, parameters, correlate labels, regex
  internals.
- CQL highlighting in Markdown code fences and YAML `queryString` values.
- Language configuration: comments, brackets, auto-closing pairs, indentation,
  region folding.
- 25 snippets.
- Tree-sitter layer (WebAssembly, no native code): semantic highlighting,
  outline and breadcrumbs, syntax-aware folding, expand/shrink selection, and
  opt-in syntax warnings (`crowdstrikeCql.diagnostics.syntax`).
- Function catalog (196 functions): completion of function names, parameter
  names and allowed values; signature help; hover with links to the
  documentation.
- Runs in VS Code for the Web as well as the desktop.
