// Completion, signature help and hover, as plain data. src/extension.ts turns
// these into VS Code objects.

import type { Tree } from 'web-tree-sitter';
import { type Fn, type Param, docUrl, functions, lookup, param } from './catalog.ts';
import { cursorContext } from './context.ts';
import { functionMarkdown, paramMarkdown, paramSummary, signatureLabel } from './docs.ts';

export interface Suggestion {
  label: string;
  kind: 'function' | 'parameter' | 'value';
  /** Snippet syntax (`$0` marks the final cursor position). */
  insert: string;
  detail: string;
  documentation: string;
  sortText: string;
  deprecated: boolean;
  /** Open signature help (functions) or suggestions (parameters with values) afterwards. */
  then?: 'signatureHelp' | 'suggest';
}

export interface Completion {
  /** Offset where the replaced word starts; it ends at the cursor. */
  start: number;
  items: Suggestion[];
}

const FUNCTION_VALUED = /function|expression/i;

function functionItems(text: string, offset: number, aggregatesFirst: boolean): Suggestion[] {
  const hasParen = text[offset] === '(';
  return functions.map((fn) => {
    const aggregate = fn.kind?.includes('Aggregate') ?? false;
    return {
      label: fn.name,
      kind: 'function',
      insert: hasParen ? fn.name : `${fn.name}($0)`,
      detail: signatureLabel(fn).label,
      documentation: functionMarkdown(fn),
      sortText: `${fn.deprecated ? 9 : aggregatesFirst && !aggregate ? 5 : 4}${fn.name.toLowerCase()}`,
      deprecated: !!fn.deprecated,
      then: hasParen ? undefined : 'signatureHelp',
    };
  });
}

function paramItems(fn: Fn, used: string[]): Suggestion[] {
  const taken = new Set(used.map((u) => u.toLowerCase()));
  return fn.params
    .filter((p) => !taken.has(p.name.toLowerCase()))
    .map((p, i) => ({
      label: `${p.name}=`,
      kind: 'parameter',
      insert: `${p.name}=`,
      detail: `${fn.name}() ${p.required ? 'required' : 'optional'} parameter`,
      documentation: paramMarkdown(fn, p),
      sortText: `${p.deprecated ? 3 : p.required ? 0 : 1}${String(i).padStart(3, '0')}`,
      deprecated: !!p.deprecated,
      then: p.values?.length || p.type === 'boolean' ? 'suggest' : undefined,
    }));
}

function valueItems(fn: Fn, p: Param): Suggestion[] {
  const values = p.values?.length ? p.values : p.type === 'boolean' ? ['true', 'false'] : [];
  return values.map((v, i) => ({
    label: v,
    kind: 'value',
    insert: v,
    detail: `${fn.name}(${p.name}=…)${v === p.default ? ' default' : ''}`,
    documentation: paramSummary(p),
    sortText: `${v === p.default ? 0 : 1}${String(i).padStart(3, '0')}`,
    deprecated: false,
  }));
}

export function complete(text: string, offset: number): Completion {
  const ctx = cursorContext(text, offset);
  const start = ctx.wordStart;
  if (ctx.inLiteral) return { start, items: [] };

  const call = ctx.call;
  const fn = call && lookup(call.name);
  if (call?.argName) {
    // In the value of `name=`, or nested inside it (`function=[count(), |`).
    const p = fn && param(fn, call.argName);
    if (!p) return { start, items: functionItems(text, offset, false) };
    const items = call.atArgLevel ? valueItems(fn, p) : [];
    if (FUNCTION_VALUED.test(p.type)) items.push(...functionItems(text, offset, /aggregate/i.test(p.type)));
    return { start, items };
  }
  if (call?.atArgLevel) {
    // Start of an argument: a parameter name, or an expression.
    const params = fn ? paramItems(fn, call.used) : [];
    return { start, items: [...params, ...functionItems(text, offset, false)] };
  }
  if (ctx.afterComparison) return { start, items: [] };
  return { start, items: functionItems(text, offset, false) };
}

export interface Signature {
  label: string;
  documentation: string;
  params: { range: [number, number]; documentation: string }[];
  /** Index into `params`; out of range when no parameter applies. */
  active: number;
}

export function signatureHelp(text: string, offset: number): Signature | undefined {
  const ctx = cursorContext(text, offset);
  const fn = !ctx.inLiteral && ctx.call ? lookup(ctx.call.name) : undefined;
  if (!fn || !ctx.call) return undefined;
  const { label, params } = signatureLabel(fn);
  const { argName, argIndex } = ctx.call;
  let active = fn.params.length;
  if (argName) active = fn.params.findIndex((p) => p.name.toLowerCase() === argName.toLowerCase());
  else if (argIndex === 0) active = Math.max(0, fn.params.findIndex((p) => p.unnamed));
  if (active < 0) active = fn.params.length;
  return {
    label,
    documentation: [fn.deprecated && `**Deprecated:** ${fn.deprecated}`, `[Documentation](${docUrl(fn)})`].filter(Boolean).join(' · '),
    params: fn.params.map((p, i) => ({ range: params[i], documentation: paramSummary(p) })),
    active,
  };
}

export interface HoverInfo {
  start: number;
  end: number;
  markdown: string;
}

/** Hover for a function name or a named argument. */
export function hover(tree: Tree, offset: number): HoverInfo | undefined {
  for (let n = tree.rootNode.descendantForIndex(offset); n; n = n.parent) {
    if (n.type === 'function_name') {
      const fn = lookup(n.text);
      return fn && { start: n.startIndex, end: n.endIndex, markdown: functionMarkdown(fn) };
    }
    if (n.type === 'argument_name') {
      const call = n.parent?.parent?.parent; // argument_name < named_argument < argument_list < function_call
      const fn = call?.type === 'function_call' ? lookup(call.childForFieldName('name')?.text ?? '') : undefined;
      const p = fn && param(fn, n.text);
      return fn && p ? { start: n.startIndex, end: n.endIndex, markdown: paramMarkdown(fn, p) } : undefined;
    }
    if (n.type === 'argument_list' || n.type === 'pipeline') return undefined;
  }
  return undefined;
}
