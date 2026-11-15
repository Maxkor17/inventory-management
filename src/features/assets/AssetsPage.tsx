import { useEffect, useState } from 'preact/hooks';
import { assetsToCsv } from '@/domain/csv-assets';
import type { Asset } from '@/domain/types';
import { todayISO } from '@/domain/util';
import { warrantyState } from '@/domain/warranty';
import { fmtDate, fmtMoney, t, tc, tn } from '@/i18n';
import { href, route } from '@/router/router';
import { personName } from '@/state/selectors';
import { prefs } from '@/state/prefs';
import { assetsById, ctx, data, locationsById, mutate, peopleById } from '@/state/store';
import { deleteAsset } from '@/services/assets';
import { Button, ButtonLink } from '@/ui/components/Button';
import { StatusBadge, WarrantyBadge } from '@/ui/components/Badges';
import { Card, EmptyState, PageHeader } from '@/ui/components/Layout';
import { confirmDelete } from '@/ui/components/Modal';
import type { Column, SortState } from '@/ui/components/Table';
import { ColumnPicker, DataTable, Pagination, cmpText, paginate, sortRows, useVisibleColumns } from '@/ui/components/Table';
import { toast } from '@/ui/components/Toast';
import { downloadCsv, stamp } from '@/ui/download';
import { useListQuery, useSet } from '@/ui/hooks';
import { Download, Package, PackagePlus, Pencil, Trash2, Upload, X } from '@/ui/icons';
import { categoryOptions, locationOptions, personOptions, statusOptions } from '../options';
import { AssetForm } from './AssetForm';
import { BulkEditModal } from './BulkEditModal';

const TABLE_ID = 'assets';
const DEFAULT_COLUMNS = ['name', 'category', 'status', 'location', 'assignee', 'warranty'];
const WARRANTY_FILTERS = ['expired', 'soon', 'valid', 'none'] as const;

export function AssetsPage() {
  const lq = useListQuery();
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const selection = useSet();
  const { assets, people, locations } = data.value;
  const today = todayISO();
  const soonDays = prefs.value.warrantySoonDays;

  // Dashboard / header "Add" links open the create dialog via `?new=1`.
  useEffect(() => {
    if (route.value.query.get('new') === '1') { setEditing('new'); lq.set({ new: undefined }); }
  }, [route.value.query.get('new')]);

  const q = lq.get('q').trim().toLowerCase();
  const fCategory = lq.get('category');
  const fStatus = lq.get('status');
  const fLocation = lq.get('location');
  const fAssignee = lq.get('assignee');
  const fWarranty = lq.get('warranty');

  const holderName = (a: Asset): string => personName(a.assigneeId ? peopleById.value.get(a.assigneeId) : undefined);
  const locName = (a: Asset): string => (a.locationId ? locationsById.value.get(a.locationId)?.name ?? '' : '');

  const filtered = assets.filter((a) => {
    if (fCategory && a.category !== fCategory) return false;
    if (fStatus && a.status !== fStatus) return false;
    if (fLocation && (fLocation === 'none' ? a.locationId !== null : a.locationId !== fLocation)) return false;
    if (fAssignee && (fAssignee === 'none' ? a.assigneeId !== null : a.assigneeId !== fAssignee)) return false;
    if (fWarranty) {
      const w = warrantyState(a.warrantyEndDate, today, soonDays).kind;
      if (w !== fWarranty) return false;
    }
    if (q) {
      const hay = [a.inventoryNumber, a.name, a.manufacturer, a.model, a.serialNumber, a.supplier, holderName(a), locName(a), tc('category', a.category), tc('status', a.status)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const columns: Column<Asset>[] = [
    { id: 'inventoryNumber', header: t('field.inventoryNumber'), sort: (a, b) => cmpText(a.inventoryNumber, b.inventoryNumber), cell: (a) => <span class="mono">{a.inventoryNumber}</span> },
    {
      id: 'name', header: t('field.name'), locked: true, sort: (a, b) => cmpText(a.name, b.name),
      cell: (a) => (
        <span class="cell-stack">
          <a class="cell-primary" href={href(['assets', a.id])}>{a.name}</a>
          <span class="cell-sub">{[a.manufacturer, a.model].filter(Boolean).join(' ') || a.inventoryNumber}</span>
        </span>
      ),
    },
    { id: 'serialNumber', header: t('field.serialNumber'), sort: (a, b) => cmpText(a.serialNumber, b.serialNumber), cell: (a) => (a.serialNumber ? <span class="mono">{a.serialNumber}</span> : <span class="faint">—</span>) },
    { id: 'category', header: t('field.category'), sort: (a, b) => cmpText(tc('category', a.category), tc('category', b.category)), cell: (a) => tc('category', a.category) },
    { id: 'status', header: t('field.status'), sort: (a, b) => cmpText(tc('status', a.status), tc('status', b.status)), cell: (a) => <StatusBadge status={a.status} /> },
    { id: 'location', header: t('field.location'), sort: (a, b) => cmpText(locName(a), locName(b)), cell: (a) => locName(a) || <span class="faint">—</span> },
    {
      id: 'assignee', header: t('field.assignee'), sort: (a, b) => cmpText(holderName(a), holderName(b)),
      cell: (a) => (a.assigneeId ? <a href={href(['people', a.assigneeId])}>{holderName(a)}</a> : <span class="faint">{t('common.unassigned')}</span>),
    },
    { id: 'purchaseDate', header: t('field.purchaseDate'), sort: (a, b) => cmpText(a.purchaseDate, b.purchaseDate), cell: (a) => (a.purchaseDate ? fmtDate(a.purchaseDate) : <span class="faint">—</span>) },
    { id: 'commissionedDate', header: t('field.commissionedDate'), sort: (a, b) => cmpText(a.commissionedDate, b.commissionedDate), cell: (a) => (a.commissionedDate ? fmtDate(a.commissionedDate) : <span class="faint">—</span>) },
    {
      id: 'warranty', header: t('field.warrantyEndDate'), sort: (a, b) => cmpText(a.warrantyEndDate, b.warrantyEndDate),
      cell: (a) => (
        <span class="cell-stack">
          {a.warrantyEndDate && <span class="num">{fmtDate(a.warrantyEndDate)}</span>}
          <WarrantyBadge state={warrantyState(a.warrantyEndDate, today, soonDays)} />
        </span>
      ),
    },
    { id: 'supplier', header: t('field.supplier'), sort: (a, b) => cmpText(a.supplier, b.supplier), cell: (a) => a.supplier || <span class="faint">—</span> },
    { id: 'cost', header: t('field.cost'), sort: (a, b) => (a.cost ?? -1) - (b.cost ?? -1), cell: (a) => (a.cost === null ? <span class="faint">—</span> : <span class="num">{fmtMoney(a.cost)}</span>) },
  ];
  const visible = useVisibleColumns(TABLE_ID, columns, DEFAULT_COLUMNS);

  const sort: SortState = { col: lq.get('sort') || 'name', dir: lq.get('dir') === 'desc' ? 'desc' : 'asc' };
  const onSort = (col: string): void => lq.set({ sort: col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' });
  const sorted = sortRows(filtered, columns, sort);
  const pageSize = prefs.value.pageSize;
  const pg = paginate(sorted, Number(lq.get('page')) || 1, pageSize);

  const chips: { key: string; label: string }[] = [];
  if (q) chips.push({ key: 'q', label: `“${lq.get('q')}”` });
  if (fCategory) chips.push({ key: 'category', label: tc('category', fCategory) });
  if (fStatus) chips.push({ key: 'status', label: tc('status', fStatus) });
  if (fLocation) chips.push({ key: 'location', label: fLocation === 'none' ? t('common.no_location') : locationsById.value.get(fLocation)?.name ?? '?' });
  if (fAssignee) chips.push({ key: 'assignee', label: fAssignee === 'none' ? t('common.unassigned') : personName(peopleById.value.get(fAssignee)) });
  if (fWarranty) chips.push({ key: 'warranty', label: t(`filter.warranty_${fWarranty}` as never) });

  const selectedIds = [...selection.set].filter((id) => assetsById.value.has(id));

  const remove = async (a: Asset): Promise<void> => {
    if (!(await confirmDelete(`${a.inventoryNumber} · ${a.name}`, 'assets.delete_extra'))) return;
    const r = await mutate(() => deleteAsset(ctx(), a.id));
    if (r.ok) { toast('success', t('assets.deleted')); selection.toggleAll([a.id], false); }
    else toast('error', t('err.not_found'));
  };

  const removeSelected = async (): Promise<void> => {
    if (!(await confirmDelete(tn('assets.n_selected', selectedIds.length), 'assets.delete_extra'))) return;
    let n = 0;
    for (const id of selectedIds) { const r = await mutate(() => deleteAsset(ctx(), id)); if (r.ok) n++; }
    selection.clear();
    toast('success', tn('assets.deleted_n', n));
  };

  const exportCsv = (rows: readonly Asset[]): void => {
    downloadCsv(`assets-${stamp()}.csv`, assetsToCsv(rows, people, locations));
  };

  const filterSelect = (key: string, value: string, label: string, options: { value: string; label: string }[]) => (
    <select class="select" aria-label={label} value={value} onChange={(e) => lq.set({ [key]: (e.currentTarget as HTMLSelectElement).value || undefined })}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        title={t('nav.assets')} subtitle={tn('assets.count', assets.length)}
        actions={<>
          <ButtonLink href={href(['import'])}><Upload size={16} /> {t('import.title')}</ButtonLink>
          <Button onClick={() => exportCsv(sorted)} disabled={!sorted.length} data-testid="export-assets-csv"><Download size={16} /> {t('common.export_csv')}</Button>
          <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-asset"><PackagePlus size={16} /> {t('assets.add')}</Button>
        </>}
      />

      <Card flush>
        <div class="toolbar">
          <input class="input input--search" type="search" placeholder={t('assets.search')} aria-label={t('assets.search')} value={lq.get('q')} onInput={(e) => lq.set({ q: (e.currentTarget as HTMLInputElement).value || undefined })} data-testid="asset-search" />
          {filterSelect('category', fCategory, t('filter.all_categories'), categoryOptions())}
          {filterSelect('status', fStatus, t('filter.all_statuses'), statusOptions())}
          {filterSelect('location', fLocation, t('filter.all_locations'), [{ value: 'none', label: t('common.no_location') }, ...locationOptions(locations)])}
          {filterSelect('assignee', fAssignee, t('filter.all_assignees'), [{ value: 'none', label: t('common.unassigned') }, ...personOptions(people, { activeOnly: false })])}
          {filterSelect('warranty', fWarranty, t('filter.any_warranty'), WARRANTY_FILTERS.map((w) => ({ value: w, label: t(`filter.warranty_${w}` as never) })))}
          <span class="toolbar__spacer" />
          <ColumnPicker tableId={TABLE_ID} all={columns} defaults={DEFAULT_COLUMNS} />
        </div>

        {chips.length > 0 && (
          <div class="chips" aria-label={t('filter.active')}>
            {chips.map((c) => (
              <span key={c.key} class="chip">{c.label}<button type="button" aria-label={t('filter.remove')} onClick={() => lq.set({ [c.key]: undefined })}><X size={12} /></button></span>
            ))}
            <Button small variant="ghost" onClick={() => lq.set({ q: undefined, category: undefined, status: undefined, location: undefined, assignee: undefined, warranty: undefined })}>{t('filter.clear')}</Button>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div class="bulkbar" data-testid="bulkbar">
            <span>{tn('assets.n_selected', selectedIds.length)}</span>
            <Button small onClick={() => setBulk(true)} data-testid="bulk-edit">{t('assets.bulk_edit')}</Button>
            <Button small onClick={() => exportCsv(selectedIds.map((id) => assetsById.value.get(id)!))}><Download size={14} /> {t('common.export_csv')}</Button>
            <Button small variant="danger" onClick={() => void removeSelected()} data-testid="bulk-delete"><Trash2 size={14} /> {t('common.delete')}</Button>
            <Button small variant="ghost" onClick={selection.clear}>{t('common.clear_selection')}</Button>
          </div>
        )}

        {pg.rows.length ? (
          <>
            <DataTable
              caption={t('nav.assets')} columns={visible} rows={pg.rows} rowKey={(a) => a.id} sort={sort} onSort={onSort}
              selection={{ selected: selection.set, onToggle: selection.toggle, onToggleAll: selection.toggleAll }}
              actions={(a) => (
                <>
                  <Button small variant="ghost" iconOnly aria-label={t('common.edit')} onClick={() => setEditing(a)} data-testid="edit-asset"><Pencil size={15} /></Button>
                  <Button small variant="ghost" iconOnly aria-label={t('common.delete')} onClick={() => void remove(a)} data-testid="delete-asset"><Trash2 size={15} /></Button>
                </>
              )}
            />
            <Pagination page={pg.page} pageSize={pageSize} total={sorted.length} onPage={(p) => lq.set({ page: String(p) })} />
          </>
        ) : (
          <EmptyState
            icon={<Package size={22} />}
            title={assets.length ? t('assets.no_match') : t('assets.empty_title')}
            text={assets.length ? t('assets.no_match_text') : t('assets.empty_text')}
            action={assets.length ? undefined : <Button variant="primary" onClick={() => setEditing('new')}>{t('assets.add')}</Button>}
          />
        )}
      </Card>

      {editing && <AssetForm asset={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {bulk && <BulkEditModal ids={selectedIds} onClose={() => setBulk(false)} onDone={selection.clear} />}
    </>
  );
}
