// The CQL function catalog: names, signatures and parameters extracted from
// the CrowdStrike function reference by scripts/extract-functions.py. Facts
// only; documentation is linked, not copied.

import data from '../catalog/functions.json' with { type: 'json' };

export interface Param {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  /** The name can be left out: `groupBy(field)` is `groupBy(field=field)`. */
  unnamed?: boolean;
  deprecated?: boolean;
  values?: string[];
}

export interface Fn {
  name: string;
  signature: string;
  url: string;
  kind?: string[];
  deprecated?: string;
  params: Param[];
}

export const DOCS = 'https://library.humio.com/crowdstrike-query-language/';
export const SCRAPED: string | null = data.scraped;
export const functions: readonly Fn[] = data.functions;

// Function names are case-insensitive in CQL.
const byName = new Map(functions.map((f) => [f.name.toLowerCase(), f]));

export function lookup(name: string): Fn | undefined {
  return byName.get(name.toLowerCase());
}

export function param(fn: Fn, name: string): Param | undefined {
  const n = name.toLowerCase();
  return fn.params.find((p) => p.name.toLowerCase() === n);
}

export function docUrl(fn: Fn, p?: Param): string {
  const slug = fn.url.replace(/^functions-|\.html$/g, '');
  return DOCS + fn.url + (p ? `#query-functions-${slug}-${p.name.toLowerCase()}` : '');
}
