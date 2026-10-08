// Document outline: the stages of each pipeline, nested through subqueries,
// case branches, match arms and correlate() labels. Mirrors the Zed
// extension's outline.scm, plus case branches and match arms.

import type { Node, Point, Tree } from 'web-tree-sitter';
import { brief, walk } from './walk.ts';

export type SymbolKind = 'function' | 'savedQuery' | 'assignment' | 'case' | 'branch' | 'match' | 'arm' | 'subquery';

export interface Span {
  start: Point;
  end: Point;
}

export interface OutlineItem {
  name: string;
  detail: string;
  kind: SymbolKind;
  range: Span;
  selectionRange: Span;
  children: OutlineItem[];
}

const span = (n: Node): Span => ({ start: n.startPosition, end: n.endPosition });
const STEP_PARENTS = new Set(['pipeline', 'case_branch']);

function item(node: Node, parentType: string | null): OutlineItem | null {
  const make = (name: string, detail: string, kind: SymbolKind, sel: Node | null) =>
    name ? { name, detail, kind, range: span(node), selectionRange: span(sel ?? node), children: [] } : null;
  const step = parentType !== null && STEP_PARENTS.has(parentType);

  switch (node.type) {
    case 'function_call': {
      if (!step) return null;
      const name = node.childForFieldName('name');
      const args = node.childForFieldName('arguments');
      return make(name?.text ?? '', args ? brief(args.text) : '', 'function', name);
    }
    case 'saved_query': {
      if (!step) return null;
      const name = node.childForFieldName('name');
      return make(name?.text ?? '', '', 'savedQuery', name);
    }
    case 'assignment': {
      if (!step) return null;
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      return make(left?.text ?? '', ':= ' + brief(right?.text ?? ''), 'assignment', left);
    }
    case 'field_shorthand': {
      if (!step) return null;
      const f = node.childForFieldName('field');
      const fn = node.childForFieldName('function');
      return make(f?.text ?? '', '=~ ' + brief(fn?.text ?? ''), 'assignment', f);
    }
    case 'case_statement':
      return make('case', '', 'case', node.firstChild);
    case 'case_branch':
      return make(brief(node.text, 40) || '(empty)', '', 'branch', node);
    case 'match_statement': {
      const f = node.childForFieldName('field');
      return make(f?.text ?? '', 'match', 'match', f);
    }
    case 'match_arm': {
      const guard = node.childForFieldName('guard');
      return make(brief(guard?.text ?? '', 40), '=>', 'arm', guard);
    }
    case 'subquery': {
      const label = node.childForFieldName('label');
      return label ? make(label.text, '', 'subquery', label) : null;
    }
  }
  return null;
}

export function outline(tree: Tree): OutlineItem[] {
  const roots: OutlineItem[] = [];
  // Stack of open items with the end index of the node that created them.
  const stack: { end: number; children: OutlineItem[] }[] = [{ end: Infinity, children: roots }];

  walk(tree, ({ node, parentType }) => {
    if (node.type === 'ERROR') return false;
    while (node.startIndex >= stack.at(-1)!.end) stack.pop();
    const it = item(node, parentType);
    if (it) {
      stack.at(-1)!.children.push(it);
      stack.push({ end: node.endIndex, children: it.children });
    }
  });
  return roots;
}
