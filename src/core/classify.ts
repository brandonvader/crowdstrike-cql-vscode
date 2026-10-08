// Semantic token classification. Only tokens whose meaning depends on syntax
// are emitted (fields, filter values, functions, arguments, labels,
// parameters); literals, comments and operators keep their TextMate colors,
// which already include regex internals and string escapes. Every token type
// maps to the same TextMate scope the grammar uses (see
// `semanticTokenScopes` in package.json), so colors stay consistent and user
// `tokenColorCustomizations` keep working.

import type { Node, Tree } from 'web-tree-sitter';
import { walk } from './walk.ts';

export const TOKEN_TYPES = [
  'property', // field on the left of a filter, assignment or match
  'variable', // field referenced in an expression
  'tagField', // #tag
  'metaField', // @timestamp
  'pattern', // unquoted filter value or free-text term
  'wildcard', // *
  'function',
  'savedQuery',
  'parameter', // named argument
  'queryParameter', // ?param
  'label', // correlate() subquery label
  'attribute', // include: and other subquery attributes
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export interface SemanticToken {
  line: number;
  char: number;
  length: number;
  type: TokenType;
}

const STEP_PARENTS = new Set(['pipeline', 'case_branch']);

const FIELD_PARENTS: Record<string, string> = {
  comparison: 'field',
  assignment: 'left',
  field_shorthand: 'field',
  match_statement: 'field',
};

function field(node: Node, base: 'property' | 'variable'): TokenType {
  if (node.type !== 'identifier') return base;
  const c = node.text[0];
  return c === '#' ? 'tagField' : c === '@' ? 'metaField' : base;
}

/** `a <=> b` links two fields (correlate); its right side is a field too. */
function isFieldLink(comparison: Node | null): boolean {
  return comparison?.childForFieldName('operator')?.type === '<=>';
}

export function classify(tree: Tree): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const emit = (node: Node, type: TokenType) => {
    const { row, column } = node.startPosition;
    const length = node.endIndex - node.startIndex;
    // Tokens cannot span lines; MISSING nodes are empty.
    if (node.endPosition.row !== row || length === 0) return;
    // `$name` and `?name`: leave the sigil to TextMate's punctuation scope.
    const skip = type === 'savedQuery' || (type === 'queryParameter' && node.text[0] === '?') ? 1 : 0;
    tokens.push({ line: row, char: column + skip, length: length - skip, type });
  };

  walk(tree, ({ node, field: name, parentType }) => {
    // Error recovery can misread the tokens around a syntax error, so steps
    // that contain one keep their TextMate colors.
    if (node.type === 'ERROR' || (node.hasError && parentType && STEP_PARENTS.has(parentType))) return false;
    switch (node.type) {
      case 'function_name':
        emit(node, 'function');
        return false;
      case 'saved_query_name':
        emit(node, 'savedQuery');
        return false;
      case 'argument_name':
        emit(node, 'parameter');
        return false;
      case 'label':
        emit(node, 'label');
        return false;
      case 'attribute_name':
        emit(node, 'attribute');
        return false;
      case 'unquoted_pattern':
      case 'wildcard_pattern':
        emit(node, 'pattern');
        return false;
      case 'wildcard':
        emit(node, 'wildcard');
        return false;
      case 'parameter_name':
        emit(node, 'queryParameter');
        return false;
      case 'string':
        if (parentType && FIELD_PARENTS[parentType] === name) emit(node, 'property');
        return false;
      case 'identifier': {
        if (parentType && FIELD_PARENTS[parentType] === name) {
          emit(node, field(node, 'property'));
        } else if (parentType === 'comparison' && name === 'value') {
          emit(node, isFieldLink(node.parent) ? field(node, 'property') : 'pattern');
        } else if (parentType === 'free_text' || parentType === 'match_arm' || parentType === 'parameter') {
          emit(node, 'pattern'); // free text, match guard, ?{p=default}
        } else {
          emit(node, field(node, 'variable'));
        }
        return false;
      }
    }
  });
  return tokens;
}
