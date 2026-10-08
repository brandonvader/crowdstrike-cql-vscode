// Markdown for hovers, completion details and signature help. Built from the
// catalog only: signature, parameters and a link to the documentation.

import { type Fn, type Param, docUrl } from './catalog.ts';

export function paramSummary(p: Param): string {
  const parts = [p.type || 'value', p.required ? 'required' : 'optional'];
  if (p.default) parts.push(`default \`${p.default}\``);
  if (p.unnamed) parts.push('name can be omitted');
  if (p.deprecated) parts.push('**deprecated**');
  let s = parts.join(' · ');
  if (p.values?.length) s += `  \nvalues: ${p.values.map((v) => `\`${v}\``).join(', ')}`;
  return s;
}

/** `groupBy(field, [function], [limit])` with each parameter's offsets. */
export function signatureLabel(fn: Fn): { label: string; params: [number, number][] } {
  let label = fn.name + '(';
  const params: [number, number][] = [];
  fn.params.forEach((p, i) => {
    if (i) label += ', ';
    const text = p.required ? p.name : `[${p.name}]`;
    const start = label.length + (p.required ? 0 : 1);
    params.push([start, start + p.name.length]);
    label += text;
  });
  return { label: label + ')', params };
}

export function functionMarkdown(fn: Fn): string {
  const lines = ['```crowdstrike-cql', signatureLabel(fn).label, '```'];
  const meta = [fn.kind?.join(', '), fn.deprecated && `**Deprecated:** ${fn.deprecated}`].filter(Boolean);
  if (meta.length) lines.push(meta.join(' · '));
  if (fn.params.length) {
    lines.push('', ...fn.params.map((p) => `- \`${p.name}\` ${paramSummary(p).replace('  \n', ' — ')}`));
  }
  lines.push('', `[Documentation](${docUrl(fn)})`);
  return lines.join('\n');
}

export function paramMarkdown(fn: Fn, p: Param): string {
  return [`\`${fn.name}(${p.name}=…)\``, '', paramSummary(p), '', `[Documentation](${docUrl(fn, p)})`].join('\n');
}
