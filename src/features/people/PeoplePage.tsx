import { useEffect, useState } from 'preact/hooks';
import { fullName } from '@/domain/people';
import type { Person } from '@/domain/types';
import { t, tn } from '@/i18n';
import { href, route } from '@/router/router';
import { prefs } from '@/state/prefs';
import { ctx, data, locationsById, mutate } from '@/state/store';
import { reactivatePerson } from '@/services/people';
import { Button } from '@/ui/components/Button';
import { PersonStatusBadge } from '@/ui/components/Badges';
import { Card, EmptyState, PageHeader } from '@/ui/components/Layout';
import type { Column, SortState } from '@/ui/components/Table';
import { ColumnPicker, DataTable, Pagination, cmpText, paginate, sortRows, useVisibleColumns } from '@/ui/components/Table';
import { toast } from '@/ui/components/Toast';
import { downloadCsv, stamp } from '@/ui/download';
import { useListQuery } from '@/ui/hooks';
import { Download, Pencil, UserCheck, UserMinus, UserPlus, Users } from '@/ui/icons';
import { peopleToCsv } from '@/domain/csv-export';
import { OffboardModal } from './OffboardModal';
import { PersonForm } from './PersonForm';

const TABLE_ID = 'people';
const DEFAULT_COLUMNS = ['name', 'email', 'department', 'location', 'status', 'assets'];

export function PeoplePage() {
  const lq = useListQuery();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [offboard, setOffboard] = useState<Person | null>(null);
  const { people, assets, locations } = data.value;

  useEffect(() => {
    if (route.value.query.get('new') === '1') { setEditing('new'); lq.set({ new: undefined }); }
  }, [route.value.query.get('new')]);

  const q = lq.get('q').trim().toLowerCase();
  const fStatus = lq.get('status');
  const fDept = lq.get('department');
  const heldCount = (p: Person): number => assets.filter((a) => a.assigneeId === p.id).length;
  const departments = [...new Set(people.map((p) => p.department).filter(Boolean))].sort();

  const filtered = people.filter((p) => {
    if (fStatus && p.status !== fStatus) return false;
    if (fDept && p.department !== fDept) return false;
    if (q && ![fullName(p), p.position, p.department, p.email, p.phone].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  const locName = (p: Person): string => (p.locationId ? locationsById.value.get(p.locationId)?.name ?? '' : '');
  const columns: Column<Person>[] = [
    {
      id: 'name', header: t('field.name'), locked: true, sort: (a, b) => cmpText(fullName(a), fullName(b)),
      cell: (p) => (
        <span class="cell-stack">
          <a class="cell-primary" href={href(['people', p.id])}>{fullName(p)}</a>
          {p.position && <span class="cell-sub">{p.position}</span>}
        </span>
      ),
    },
    { id: 'email', header: t('field.email'), sort: (a, b) => cmpText(a.email, b.email), cell: (p) => (p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span class="faint">—</span>) },
    { id: 'phone', header: t('field.phone'), sort: (a, b) => cmpText(a.phone, b.phone), cell: (p) => p.phone || <span class="faint">—</span> },
    { id: 'department', header: t('field.department'), sort: (a, b) => cmpText(a.department, b.department), cell: (p) => p.department || <span class="faint">—</span> },
    { id: 'location', header: t('field.location'), sort: (a, b) => cmpText(locName(a), locName(b)), cell: (p) => locName(p) || <span class="faint">—</span> },
    { id: 'startDate', header: t('field.startDate'), sort: (a, b) => cmpText(a.startDate, b.startDate), cell: (p) => p.startDate || <span class="faint">—</span> },
    { id: 'status', header: t('field.status'), sort: (a, b) => cmpText(a.status, b.status), cell: (p) => <PersonStatusBadge status={p.status} /> },
    {
      id: 'assets', header: t('people.assets_count'), sort: (a, b) => heldCount(a) - heldCount(b),
      cell: (p) => { const n = heldCount(p); return n ? <a href={href(['assets'], { assignee: p.id })} class="num">{n}</a> : <span class="faint num">0</span>; },
    },
  ];
  const visible = useVisibleColumns(TABLE_ID, columns, DEFAULT_COLUMNS);
  const sort: SortState = { col: lq.get('sort') || 'name', dir: lq.get('dir') === 'desc' ? 'desc' : 'asc' };
  const onSort = (col: string): void => lq.set({ sort: col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' });
  const sorted = sortRows(filtered, columns, sort);
  const pg = paginate(sorted, Number(lq.get('page')) || 1, prefs.value.pageSize);

  const reactivate = async (p: Person): Promise<void> => {
    const r = await mutate(() => reactivatePerson(ctx(), p.id));
    if (r.ok) toast('success', t('people.reactivated', { name: fullName(p) }));
  };

  return (
    <>
      <PageHeader
        title={t('nav.people')} subtitle={tn('people.count', people.length)}
        actions={<>
          <Button onClick={() => downloadCsv(`people-${stamp()}.csv`, peopleToCsv(sorted, locations, assets))} disabled={!sorted.length}><Download size={16} /> {t('common.export_csv')}</Button>
          <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-person"><UserPlus size={16} /> {t('people.add')}</Button>
        </>}
      />
      <Card flush>
        <div class="toolbar">
          <input class="input input--search" type="search" placeholder={t('people.search')} aria-label={t('people.search')} value={lq.get('q')} onInput={(e) => lq.set({ q: (e.currentTarget as HTMLInputElement).value || undefined })} data-testid="people-search" />
          <select class="select" aria-label={t('field.status')} value={fStatus} onChange={(e) => lq.set({ status: (e.currentTarget as HTMLSelectElement).value || undefined })}>
            <option value="">{t('filter.all_statuses')}</option>
            <option value="active">{t('person_status.active')}</option>
            <option value="inactive">{t('person_status.inactive')}</option>
          </select>
          <select class="select" aria-label={t('field.department')} value={fDept} onChange={(e) => lq.set({ department: (e.currentTarget as HTMLSelectElement).value || undefined })}>
            <option value="">{t('filter.all_departments')}</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span class="toolbar__spacer" />
          <ColumnPicker tableId={TABLE_ID} all={columns} defaults={DEFAULT_COLUMNS} />
        </div>
        {pg.rows.length ? (
          <>
            <DataTable
              caption={t('nav.people')} columns={visible} rows={pg.rows} rowKey={(p) => p.id} sort={sort} onSort={onSort}
              rowClass={(p) => (p.status === 'inactive' ? 'is-inactive' : '')}
              actions={(p) => (
                <>
                  <Button small variant="ghost" iconOnly aria-label={t('common.edit')} onClick={() => setEditing(p)} data-testid="edit-person"><Pencil size={15} /></Button>
                  {p.status === 'active'
                    ? <Button small variant="ghost" iconOnly aria-label={t('people.offboard')} title={t('people.offboard')} onClick={() => setOffboard(p)} data-testid="offboard-person"><UserMinus size={15} /></Button>
                    : <Button small variant="ghost" iconOnly aria-label={t('people.reactivate')} title={t('people.reactivate')} onClick={() => void reactivate(p)} data-testid="reactivate-person"><UserCheck size={15} /></Button>}
                </>
              )}
            />
            <Pagination page={pg.page} pageSize={prefs.value.pageSize} total={sorted.length} onPage={(p) => lq.set({ page: String(p) })} />
          </>
        ) : (
          <EmptyState
            icon={<Users size={22} />} title={people.length ? t('people.no_match') : t('people.empty_title')}
            text={people.length ? t('assets.no_match_text') : t('people.empty_text')}
            action={people.length ? undefined : <Button variant="primary" onClick={() => setEditing('new')}>{t('people.add')}</Button>}
          />
        )}
      </Card>
      {editing && <PersonForm person={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {offboard && <OffboardModal person={offboard} onClose={() => setOffboard(null)} />}
    </>
  );
}
