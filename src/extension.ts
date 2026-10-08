// CrowdStrike CQL for VS Code: tree-sitter powered features on top of the
// declarative TextMate grammar. Runs entirely in-process: no network access,
// no file writes, no child processes.

import * as vscode from 'vscode';
import type { Parser, Tree } from 'web-tree-sitter';
import { classify, TOKEN_TYPES } from './core/classify.ts';
import { syntaxProblems } from './core/diagnostics.ts';
import { folding } from './core/folding.ts';
import { outline, type OutlineItem, type Span, type SymbolKind } from './core/outline.ts';
import { createParser } from './core/parser.ts';
import { selectionChain } from './core/selection.ts';

const LANGUAGE = 'crowdstrike-cql';
const SELECTOR: vscode.DocumentSelector = { language: LANGUAGE };
const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], []);

/** One parse per document version; trees live in WASM memory and must be freed. */
class TreeCache implements vscode.Disposable {
  private trees = new Map<string, { version: number; tree: Tree }>();
  private parser: Parser;
  constructor(parser: Parser) {
    this.parser = parser;
  }

  get(doc: vscode.TextDocument): Tree | undefined {
    const key = doc.uri.toString();
    const hit = this.trees.get(key);
    if (hit?.version === doc.version) return hit.tree;
    const tree = this.parser.parse(doc.getText());
    if (!tree) return undefined;
    hit?.tree.delete();
    this.trees.set(key, { version: doc.version, tree });
    return tree;
  }

  forget(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    this.trees.get(key)?.tree.delete();
    this.trees.delete(key);
  }

  dispose(): void {
    for (const { tree } of this.trees.values()) tree.delete();
    this.trees.clear();
  }
}

const SYMBOL_KINDS: Record<SymbolKind, vscode.SymbolKind> = {
  function: vscode.SymbolKind.Function,
  savedQuery: vscode.SymbolKind.Module,
  assignment: vscode.SymbolKind.Field,
  case: vscode.SymbolKind.Struct,
  branch: vscode.SymbolKind.EnumMember,
  match: vscode.SymbolKind.Struct,
  arm: vscode.SymbolKind.EnumMember,
  subquery: vscode.SymbolKind.Namespace,
};

const toRange = (s: Span) => new vscode.Range(s.start.row, s.start.column, s.end.row, s.end.column);

function toSymbol(it: OutlineItem): vscode.DocumentSymbol {
  const sym = new vscode.DocumentSymbol(it.name, it.detail, SYMBOL_KINDS[it.kind], toRange(it.range), toRange(it.selectionRange));
  sym.children = it.children.map(toSymbol);
  return sym;
}

function lines(doc: vscode.TextDocument): string[] {
  return Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const read = (path: string) => vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, path));
  const parser = await createParser(await read('dist/web-tree-sitter.wasm'), await read('grammar/tree-sitter-crowdstrike_cql.wasm'));
  const trees = new TreeCache(parser);
  context.subscriptions.push(trees, { dispose: () => parser.delete() });

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      SELECTOR,
      {
        provideDocumentSemanticTokens(doc) {
          const tree = trees.get(doc);
          const builder = new vscode.SemanticTokensBuilder(legend);
          if (tree) for (const t of classify(tree)) builder.push(t.line, t.char, t.length, TOKEN_TYPES.indexOf(t.type));
          return builder.build();
        },
      },
      legend,
    ),

    vscode.languages.registerDocumentSymbolProvider(
      SELECTOR,
      {
        provideDocumentSymbols(doc) {
          const tree = trees.get(doc);
          return tree ? outline(tree).map(toSymbol) : [];
        },
      },
      { label: 'CQL' },
    ),

    vscode.languages.registerFoldingRangeProvider(SELECTOR, {
      provideFoldingRanges(doc) {
        const tree = trees.get(doc);
        if (!tree) return [];
        return folding(tree, lines(doc)).map(
          (f) =>
            new vscode.FoldingRange(
              f.start,
              f.end,
              f.kind === 'comment' ? vscode.FoldingRangeKind.Comment : f.kind === 'region' ? vscode.FoldingRangeKind.Region : undefined,
            ),
        );
      },
    }),

    vscode.languages.registerSelectionRangeProvider(SELECTOR, {
      provideSelectionRanges(doc, positions) {
        const tree = trees.get(doc);
        return positions.map((pos) => {
          const chain = tree ? selectionChain(tree, doc.offsetAt(pos)) : [];
          let range: vscode.SelectionRange | undefined;
          for (const r of chain.reverse()) {
            range = new vscode.SelectionRange(new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)), range);
          }
          return range ?? new vscode.SelectionRange(new vscode.Range(pos, pos));
        });
      },
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => trees.forget(doc)),
  );

  registerDiagnostics(context, trees);
}

/** Opt-in syntax warnings (`crowdstrikeCql.diagnostics.syntax`). */
function registerDiagnostics(context: vscode.ExtensionContext, trees: TreeCache): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE);
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const enabled = () => vscode.workspace.getConfiguration('crowdstrikeCql').get<boolean>('diagnostics.syntax', false);

  const check = (doc: vscode.TextDocument) => {
    if (doc.languageId !== LANGUAGE || !enabled()) return;
    const tree = trees.get(doc);
    if (!tree) return;
    collection.set(
      doc.uri,
      syntaxProblems(tree).map((p) => {
        const d = new vscode.Diagnostic(toRange(p), p.message, vscode.DiagnosticSeverity.Warning);
        d.source = 'CQL';
        return d;
      }),
    );
  };
  const schedule = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        check(doc);
      }, 300),
    );
  };
  const checkAll = () => {
    collection.clear();
    vscode.workspace.textDocuments.forEach(check);
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidChangeTextDocument((e) => e.document.languageId === LANGUAGE && enabled() && schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('crowdstrikeCql.diagnostics') && checkAll()),
    { dispose: () => pending.forEach(clearTimeout) },
  );
  checkAll();
}

export function deactivate(): void {}
