import type { FieldChange } from './types';

type Primitive = string | number | boolean | null | undefined;

const norm = (v: Primitive): string | number | null =>
  v === undefined || v === null ? null : typeof v === 'boolean' ? String(v) : v;

/** Field-level differences between two records, limited to `fields` (in that order). */
export function diffFields<T extends object>(before: T, after: T, fields: readonly (keyof T & string)[]): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = norm(before[field] as Primitive);
    const to = norm(after[field] as Primitive);
    if (from !== to && !(from === '' && to === null) && !(from === null && to === '')) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}
