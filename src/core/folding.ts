// Folding ranges for multi-line constructs, comment blocks and
// `// #region` ... `// #endregion` markers. A folding provider replaces
// VS Code's indentation-based folding, so all three come from here.

import type { Tree } from 'web-tree-sitter';
import { walk } from './walk.ts';

export interface Fold {
  start: number;
  end: number;
  kind?: 'comment' | 'region';
}

const FOLDABLE = new Set([
  'case_statement',
  'match_statement',
  'match_arm',
  'subquery',
  'array',
  'function_call',
  'parenthesized_filter',
  'parenthesized_expression',
]);
const CLOSERS = new Set([')', ']', '}']);
const REGION = /^\s*\/\/\s*#(end)?region\b/;

export function folding(tree: Tree, lines: readonly string[]): Fold[] {
  const folds: Fold[] = [];
  const add = (start: number, end: number, kind?: Fold['kind']) => {
    if (end > start) folds.push(kind ? { start, end, kind } : { start, end });
  };
  let commentRun: { start: number; end: number } | null = null;
  const flushComments = () => {
    if (commentRun) add(commentRun.start, commentRun.end, 'comment');
    commentRun = null;
  };

  walk(tree, ({ node }) => {
    const start = node.startPosition.row;
    const end = node.endPosition.row;
    if (node.type === 'line_comment') {
      if (REGION.test(lines[start] ?? '')) return false;
      if (commentRun && start === commentRun.end + 1) commentRun.end = start;
      else {
        flushComments();
        commentRun = { start, end: start };
      }
      return false;
    }
    if (node.type === 'block_comment') {
      add(start, end, 'comment');
      return false;
    }
    if (FOLDABLE.has(node.type) && end > start) {
      // Keep a closing bracket that starts its line visible.
      const last = node.lastChild;
      const closerLine = last && CLOSERS.has(last.type) ? last.startPosition.row : -1;
      const closerFirst = closerLine === end && /^\s*[)\]}]/.test(lines[end] ?? '');
      add(start, closerFirst ? end - 1 : end);
    }
  });
  flushComments();

  const open: number[] = [];
  lines.forEach((line, i) => {
    const m = REGION.exec(line);
    if (!m) return;
    if (!m[1]) open.push(i);
    else if (open.length) add(open.pop()!, i, 'region');
  });

  return folds.sort((a, b) => a.start - b.start || b.end - a.end);
}
