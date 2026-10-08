import type { Node, Tree } from 'web-tree-sitter';

export interface Visit {
  node: Node;
  /** Field name of `node` in its parent (`left`, `value`, ...), if any. */
  field: string | null;
  /** Type of the parent node, or `null` at the root. */
  parentType: string | null;
}

/**
 * Pre-order walk of the tree. `visit` returns `false` to skip the node's
 * children.
 */
export function walk(tree: Tree, visit: (v: Visit) => boolean | void): void {
  const cursor = tree.walk();
  const parents: string[] = [];
  try {
    for (;;) {
      const node = cursor.currentNode;
      const descend = visit({ node, field: cursor.currentFieldName, parentType: parents.at(-1) ?? null }) !== false;
      if (descend && cursor.gotoFirstChild()) {
        parents.push(node.type);
        continue;
      }
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) return;
        parents.pop();
      }
    }
  } finally {
    cursor.delete();
  }
}

/** Collapses whitespace and shortens `text` to `max` characters. */
export function brief(text: string, max = 48): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
