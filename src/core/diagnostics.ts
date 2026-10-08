// Syntax problems found by the tree-sitter parser. The grammar is lenient and
// cannot reproduce every quirk of the real CQL parser, so these are opt-in
// warnings, not errors.

import type { Point, Tree } from 'web-tree-sitter';
import { brief, walk } from './walk.ts';

export interface SyntaxProblem {
  start: Point;
  end: Point;
  message: string;
}

export function syntaxProblems(tree: Tree): SyntaxProblem[] {
  const problems: SyntaxProblem[] = [];
  if (!tree.rootNode.hasError) return problems;
  walk(tree, ({ node }) => {
    if (!node.hasError && !node.isMissing) return false;
    if (node.isMissing) {
      problems.push({ start: node.startPosition, end: node.endPosition, message: `Missing \`${node.type}\`` });
      return false;
    }
    if (node.isError) {
      // Underline only the first line of a multi-line error region.
      const first = node.text.split('\n')[0];
      const end = node.endPosition.row === node.startPosition.row
        ? node.endPosition
        : { row: node.startPosition.row, column: node.startPosition.column + first.length };
      problems.push({ start: node.startPosition, end, message: `Syntax error near \`${brief(first, 30)}\`` });
      return false;
    }
  });
  return problems;
}
