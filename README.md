# CrowdStrike CQL for Visual Studio Code

Visual Studio Code language support for the **CrowdStrike Query Language**
(CQL, formerly LogScale Query Language / Humio), as used in Falcon NG-SIEM and
LogScale.

| File types | `.ngsiem`, `.logscale`, `.lql` |
| --- | --- |

> `.cql` is intentionally **not** claimed: it collides with Cassandra CQL.
> To use it anyway, add this to your `settings.json`:
>
> ```json
> "files.associations": { "*.cql": "crowdstrike-cql" }
> ```

## Features

- **Syntax highlighting that follows CQL semantics**, not just keywords:
  - the left side of `=`, `:=`, `=~` and `match` is a field; the right side
    of a filter comparison is an (unquoted) string, never a field. This is
    the most common CQL gotcha: `a = b` compares field `a` to the *string*
    `"b"`
  - in expressions (`:=`, function arguments) bare words are field
    references, and `/` after an operand is division (`a:=m/fisk/i` divides,
    `foo=m/fisk/i` is a pattern)
  - free-text search terms and URLs (`https://example.com/`) are patterns,
    not comments
  - `#tag` fields, `@timestamp`-style metadata fields, function names,
    named arguments (any name, not a fixed list), `?parameters` and
    `?{param=default}`, `$"saved queries"()`, correlate labels and
    `include:` attributes, durations (`5m`, `1h`)
  - regex literals are highlighted inside: groups, classes, quantifiers,
    anchors and flags, and named captures (`(?<user>…)`) are shown as the
    fields they create
- **CQL embedded in other files**
  - Markdown fenced code blocks tagged `logscale`, `cql`, `lql`, `ngsiem`,
    `crowdstrike-cql` or `humio`
  - YAML values under `queryString:` (LogScale packages, alerts, scheduled
    searches), as block scalars (`|`, `>`), quoted or plain values
- **Function completion, signature help and hover** for all 196 functions in
  the CrowdStrike Query Language reference:
  - function names wherever a function can go, with aggregate functions first
    inside `groupBy(…, function=…)` and similar
  - parameter names (required first, already-used ones left out) and allowed
    values (`sort(order=` offers `desc`, `asc`), defaults first
  - the active parameter while you type, with its type, default and values
  - hover on a function or argument name for its signature and a link to its
    documentation
  - deprecated functions and parameters are marked and sorted last
- **Semantic highlighting** from a real parser
  ([tree-sitter](https://tree-sitter.github.io/)): keeps fields, filter
  values and functions straight where a line-based grammar cannot, such as an
  expression continued on the next line (`ratio := bytes_out` ⏎ `/ bytes_in`
  is division, not a regex). It uses the same colors as the grammar.
- **Outline, breadcrumbs and Go to Symbol** (`Ctrl+Shift+O`): every pipeline
  stage (functions, assignments, saved queries), nested through `case`
  branches, `match` arms and `correlate()` subqueries
- **Folding** of multi-line function calls, arrays, subqueries, `case` and
  `match` blocks, comment blocks and `// #region` … `// #endregion`
- **Expand/shrink selection** by syntax (`Shift+Alt+→` / `Shift+Alt+←`)
- **Optional syntax warnings**: set `"crowdstrikeCql.diagnostics.syntax": true`
  to underline text the parser cannot read. Off by default: the parser is
  lenient and does not know every quirk of CrowdStrike's own, so the Falcon
  console stays the authority.
- **Editing**: comment toggling (`//`, `/* */`), bracket matching and
  colorization, auto-closing and surrounding pairs, and indentation inside
  `()`, `[]` and `{}`
- **Works in VS Code for the Web** (vscode.dev, github.dev) as well as the
  desktop
- **Snippets**:

  | Prefix | What |
  | --- | --- |
  | `proc` | Falcon ProcessRollup2 hunt by image name |
  | `tag` | Filter on the event type tag |
  | `gb` / `gbm` | `groupBy` with count and sort / with first/last seen and collect |
  | `case` / `match` / `if` | Conditional evaluation |
  | `in` / `cidr` | List filter / drop private and reserved IP ranges |
  | `rx` | Extract a named capture group |
  | `deftable` / `lookup` | Ad-hoc table join / lookup-file enrichment |
  | `correlate` | Correlate two subqueries on a linked field |
  | `ioc` / `ipenrich` | Threat-intel lookup / IP geolocation and ASN |
  | `tc` / `bucket` / `top` | Time chart / time buckets / most frequent values |
  | `select` / `rename` / `default` / `ft` | Field shaping and timestamp formatting |
  | `ptree` | Markdown link to the Falcon process explorer |
  | `param` | Dashboard parameter with a default value |
  | `region` | Foldable region |

## Function catalog

The catalog (`src/catalog/functions.json`) holds facts from the
[function reference](https://library.humio.com/crowdstrike-query-language/functions.html):
names, signatures, function types, parameter names, types, defaults and
allowed values. It does not copy the documentation's descriptions; hovers link
to the page instead. Its `scraped` field gives the date of the snapshot.
Functions CrowdStrike added later still highlight correctly but are not
suggested until the catalog is refreshed.

## Privacy and footprint

The extension runs only inside VS Code's extension host: it makes **no
network requests**, writes **no files** and starts **no processes**. The
parser is WebAssembly bundled in the package (the
[grammar](grammar/README.md) is built reproducibly from the companion Zed
extension's source). Queries never leave the editor.

## Customizing colors

Scopes follow TextMate conventions, so any theme works. To change a color,
use `editor.tokenColorCustomizations`, for example:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "string.unquoted.cql", "settings": { "foreground": "#CE9178" } },
    { "scope": "keyword.control.pipe.cql", "settings": { "fontStyle": "bold" } }
  ]
}
```

| Scope | Used for |
| --- | --- |
| `variable.other.property.cql` | field on the left side of a filter, assignment or `match` |
| `variable.other.cql` | field reference in an expression |
| `entity.name.tag.cql` | `#tag` fields |
| `variable.language.cql` | `@metadata` fields |
| `string.unquoted.cql`, `string.unquoted.wildcard.cql` | unquoted filter values, free text, `*` |
| `string.regexp.cql` | regex literals |
| `entity.name.function.cql` | function calls |
| `entity.name.function.saved-query.cql` | `$saved()` queries |
| `variable.parameter.cql` | named arguments (`field=`, `as=`) |
| `variable.other.constant.parameter.cql` | `?parameters` |
| `keyword.control.pipe.cql` | `\|` |
| `keyword.control.case.cql`, `keyword.control.match.cql` | `case`, `match` |
| `keyword.operator.expression.{and,or,not,like}.cql` | logical operators |

Use **Developer: Inspect Editor Tokens and Scopes** to see the scopes of any
token. Semantic tokens map onto the same scopes, so these rules apply to both;
to see the grammar alone, set
`"[crowdstrike-cql]": { "editor.semanticHighlighting.enabled": false }`.

## Known limitations

- `https: //example.com` (space before `//`) is a comment; quote it.
- An unterminated string or regex ends at the end of its line.
- Semantic highlighting, the outline and folding apply to CQL files, not to
  CQL embedded in Markdown or YAML (those use the grammar only).
- YAML: for `- queryString: |` written on the list item's first line, the
  item's other keys are highlighted as CQL. Put `queryString` on its own line.
- A pipeline stage that contains a syntax error keeps the grammar's colors
  and is left out of the outline.

## Development

Requirements: Node.js 24 (unit tests run TypeScript directly).

```sh
npm install
npm test              # build, typecheck, scope tests, snapshots, snippets, unit tests
npm run build         # grammars (syntaxes/src → JSON) and bundles (src → dist)
xvfb-run -a npm run test:integration   # real VS Code: desktop and web worker hosts
npm run package       # → crowdstrike-cql-<version>.vsix
```

Press **F5** in VS Code to launch an Extension Development Host with the
extension loaded (works over Remote-SSH); the second launch configuration runs
it in the web worker host, as on vscode.dev.

- `src/core/` holds the tree-sitter features as plain functions over a syntax
  tree (no `vscode` import), unit-tested in `test/unit/`; `src/extension.ts`
  wires them to the VS Code API. esbuild bundles it twice, for the desktop
  (`dist/extension.js`) and the web (`dist/web/extension.js`).
- To refresh the function catalog: `python3 scripts/scrape-docs.py` (fills
  the corpus cache), then `npm run catalog`, then `npm test`.
- `grammar/tree-sitter-crowdstrike_cql.wasm` is vendored; see
  [`grammar/README.md`](grammar/README.md) to rebuild or update it.
- `images/icon.png` is drawn by `python3 -I scripts/make-icon.py` (Pillow).

- Grammars are written in YAML under `syntaxes/src/`; `{{name}}` placeholders
  expand from the file's `variables` map. The build compiles every regex
  with Oniguruma, so a bad pattern fails the build.
- `test/grammar/` holds scope assertions
  ([vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test));
  `test/snap/` holds full-file snapshots
  (`npm run test:snap:update` after an intended change).
- `node scripts/tokenize.mjs file.logscale` prints each token with its scope.
- `npm run screenshot -- --file f.logscale --out shot.png` captures a
  headless VS Code window (needs `xvfb-run`).
- `npm run corpus:scopes` tokenizes the ~1,900 code examples from the
  CrowdStrike docs and flags structural problems (unclosed brackets, literals
  cut off at end of line). The corpus is not in this repository: it is
  CrowdStrike's documentation content. Point `CQL_CORPUS` at a directory with
  an `examples.jsonl` built by [`scripts/scrape-docs.py`](scripts/scrape-docs.py).
- `npm run corpus:semantic` reports the tree-sitter parse rate on the same
  corpus and every place where a semantic token disagrees with the grammar.

The TextMate grammar follows the tree-sitter grammar of the companion
[Zed extension](https://github.com/brandonvader/crowdstrike-cql-zed), which is
derived from CrowdStrike's published
[grammar subset](https://library.humio.com/lql-grammar/syntax-grammar-guide-subset.html).

## License

Copyright (C) 2026 Brandon Vader

Licensed under the GNU General Public License v3.0 (GPL-3.0-only); see
[`LICENSE`](LICENSE). Anyone who distributes a modified version must release
its source under the same license. Bundled third-party software is listed in
[`ThirdPartyNotices.txt`](ThirdPartyNotices.txt).
