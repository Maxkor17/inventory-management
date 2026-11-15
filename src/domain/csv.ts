/** Minimal RFC 4180 CSV reader/writer (no dependency). */

export class CsvError extends Error {
  constructor(public readonly code: 'unterminated_quote') {
    super(code);
    this.name = 'CsvError';
  }
}

function detectDelimiter(src: string): string {
  const candidates = [',', ';', '\t'];
  const counts = new Map(candidates.map((c) => [c, 0]));
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    if (counts.get(c)! > bestCount) { best = c; bestCount = counts.get(c)!; }
  }
  return best;
}

export function parseCsv(text: string): { rows: string[][]; delimiter: string } {
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  const endRow = (): void => { row.push(cell); rows.push(row); row = []; cell = ''; };

  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { if (src[i + 1] === '\n') i++; endRow(); i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    cell += ch; i++;
  }
  if (inQuotes) throw new CsvError('unterminated_quote');
  if (cell !== '' || row.length) endRow();

  return { rows: rows.filter((r) => !(r.length === 1 && r[0] === '')), delimiter };
}

/* ---------- writing ---------- */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Cells that start with a formula character are prefixed with an apostrophe so that
 * spreadsheet software does not execute them (CSV injection). Numbers are never guarded.
 */
export function csvCell(value: string | number | null | undefined, delimiter = ','): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(s)) s = "'" + s;
  if (s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Reverses the apostrophe guard added by `csvCell` (used on import). */
export function unguardCsvCell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>, delimiter = ','): string {
  return rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}
