import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtNumber, t } from '@/i18n';
import { prefs, setPref } from '@/state/prefs';
import { Button } from './Button';
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3 } from '../icons';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ComponentChildren;
  /** Provide to make the column sortable. */
  sort?: (a: T, b: T) => number;
  /** Always shown (cannot be hidden through the column picker). */
  locked?: boolean;
}

export interface SortState { col: string; dir: 'asc' | 'desc' }

export function sortRows<T>(rows: readonly T[], columns: readonly Column<T>[], sort: SortState | null): T[] {
  const out = [...rows];
  const col = sort ? columns.find((c) => c.id === sort.col) : undefined;
  if (sort && col?.sort) {
    const dir = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => col.sort!(a, b) * dir);
  }
  return out;
}

/** Locale-aware, empty-last text comparison. */
export function cmpText(a: string, b: string): number {
  if (!a && b) return 1;
  if (a && !b) return -1;
  return a.localeCompare(b, prefs.value.lang, { sensitivity: 'base', numeric: true });
}

interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sort?: SortState | null;
  onSort?: (col: string) => void;
  selection?: { selected: ReadonlySet<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[], checked: boolean) => void };
  actions?: (row: T) => ComponentChildren;
  rowClass?: (row: T) => string;
  caption: string;
}

export function DataTable<T>({ columns, rows, rowKey, sort, onSort, selection, actions, rowClass, caption }: DataTableProps<T>) {
  const ids = rows.map(rowKey);
  const allChecked = !!selection && ids.length > 0 && ids.every((id) => selection.selected.has(id));
  return (
    <div class="table-wrap">
      <table class="table">
        <caption class="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selection && (
              <th class="col-check" scope="col">
                <input type="checkbox" aria-label={t('table.select_all')} checked={allChecked} onChange={(e) => selection.onToggleAll(ids, (e.currentTarget as HTMLInputElement).checked)} />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.id} scope="col" aria-sort={sort?.col === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sort && onSort ? (
                  <button type="button" onClick={() => onSort(c.id)}>
                    {c.header}
                    {sort?.col === c.id ? (sort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} opacity={0.4} />}
                  </button>
                ) : c.header}
              </th>
            ))}
            {actions && <th class="col-actions" scope="col"><span class="sr-only">{t('common.actions')}</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            const selected = selection?.selected.has(id);
            return (
              <tr key={id} class={`${selected ? 'is-selected' : ''} ${rowClass?.(row) ?? ''}`}>
                {selection && (
                  <td class="col-check">
                    <input type="checkbox" aria-label={t('table.select_row')} checked={!!selected} onChange={() => selection.onToggle(id)} />
                  </td>
                )}
                {columns.map((c) => <td key={c.id} data-label={c.header}>{c.cell(row)}</td>)}
                {actions && <td class="col-actions">{actions(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- pagination ---------- */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div class="pagination">
      <span>{t('table.showing', { from: fmtNumber(from), to: fmtNumber(to), total: fmtNumber(total) })}</span>
      <div class="row">
        <label class="row">
          <span>{t('table.rows_per_page')}</span>
          <select class="select" value={String(pageSize)} onChange={(e) => { setPref('pageSize', Number((e.currentTarget as HTMLSelectElement).value)); onPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Button small disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('table.prev')}>‹</Button>
        <span class="num" aria-live="polite">{page} / {pages}</span>
        <Button small disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('table.next')}>›</Button>
      </div>
    </div>
  );
}

/** Slices rows for the current page and keeps `page` within range. */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): { page: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
}

/* ---------- column visibility ---------- */
export function useVisibleColumns<T>(tableId: string, all: readonly Column<T>[], defaults: readonly string[]): Column<T>[] {
  const saved = prefs.value.columns[tableId];
  const visible = new Set(saved ?? defaults);
  return all.filter((c) => c.locked || visible.has(c.id));
}

export function ColumnPicker<T>({ tableId, all, defaults }: { tableId: string; all: readonly Column<T>[]; defaults: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const current = new Set(prefs.value.columns[tableId] ?? defaults);
  const toggle = (id: string): void => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPref('columns', { ...prefs.value.columns, [tableId]: [...next] });
  };
  return (
    <div class="menu" ref={ref}>
      <Button small aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}><Columns3 size={15} /> {t('table.columns')}</Button>
      {open && (
        <div class="menu__panel" role="group" aria-label={t('table.columns')}>
          {all.filter((c) => !c.locked).map((c) => (
            <label key={c.id} class="menu__item check">
              <input type="checkbox" checked={current.has(c.id)} onChange={() => toggle(c.id)} />
              <span>{c.header}</span>
            </label>
          ))}
          <Button small variant="ghost" onClick={() => setPref('columns', Object.fromEntries(Object.entries(prefs.value.columns).filter(([k]) => k !== tableId)))}>{t('table.reset_columns')}</Button>
        </div>
      )}
    </div>
  );
}
