// Smart expand/shrink selection: the chain of syntax nodes around a position.

import type { Tree } from 'web-tree-sitter';

export interface IndexRange {
  start: number;
  end: number;
}

/** Ranges from innermost to outermost, without duplicates. */
export function selectionChain(tree: Tree, offset: number): IndexRange[] {
  const chain: IndexRange[] = [];
  for (let n = tree.rootNode.descendantForIndex(offset); n; n = n.parent) {
    const last = chain.at(-1);
    if (!last || last.start !== n.startIndex || last.end !== n.endIndex) {
      chain.push({ start: n.startIndex, end: n.endIndex });
    }
  }
  return chain;
}
