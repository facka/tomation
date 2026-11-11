/**
 * Display helpers for compiled `runtimeTemplate` descriptors in a Data() template.
 *
 * A Data value authored as a template literal, e.g.
 *   provider: `${provider.lastName}, ${provider.firstName}`
 * compiles to `{ type: 'runtimeTemplate', parts: [...] }` where string parts are
 * literal text (or carry `{{data.<name>.<path>}}` tokens for data references) and
 * object parts are date-helper descriptors. The Test Plan shows the descriptor as
 * its readable source formula instead of exploding it into .type / .parts rows.
 */

import { isDateHelperDescriptor, formatDateHelper } from '@/logic/dateHelperDisplay';

export interface RuntimeTemplateDescriptor {
  type: 'runtimeTemplate';
  parts: unknown[];
}

/** Type guard: is the given value a compiled runtimeTemplate descriptor? */
export function isRuntimeTemplateDescriptor(value: unknown): value is RuntimeTemplateDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'runtimeTemplate' &&
    Array.isArray((value as { parts?: unknown }).parts)
  );
}

const DATA_TOKEN = /\{\{data\.([^}]+)\}\}/g;

/**
 * Rebuild the source template literal from a runtimeTemplate descriptor:
 *   `${provider.lastName}, ${provider.firstName}`
 * Data tokens become `${name.path}`, date helpers become `${nextWeek('...')}`,
 * and literal text is kept verbatim (backticks and `${` escaped).
 */
export function formatRuntimeTemplate(descriptor: RuntimeTemplateDescriptor): string {
  let body = '';
  for (const part of descriptor.parts) {
    if (typeof part === 'string') {
      let out = '';
      let last = 0;
      let m: RegExpExecArray | null;
      DATA_TOKEN.lastIndex = 0;
      while ((m = DATA_TOKEN.exec(part)) !== null) {
        out += escapeLiteral(part.slice(last, m.index)) + '${' + m[1] + '}';
        last = m.index + m[0].length;
      }
      out += escapeLiteral(part.slice(last));
      body += out;
    } else if (isDateHelperDescriptor(part)) {
      body += '${' + formatDateHelper(part) + '}';
    }
  }
  return '`' + body + '`';
}

function escapeLiteral(text: string): string {
  return text.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}
