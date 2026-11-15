import { useEffect, useState } from 'preact/hooks';
import { ticketsToCsv } from '@/domain/csv-export';
import { isActiveTicket } from '@/domain/maintenance';
import type { Ticket } from '@/domain/types';
import { fmtDateTime, fmtMoney, t, tn } from '@/i18n';
import { href, route } from '@/router/router';
import { personName } from '@/state/selectors';
import { prefs } from '@/state/prefs';
import { assetsById, data, peopleById } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { PriorityBadge, TicketStatusBadge } from '@/ui/components/Badges';
import { Card, EmptyState, PageHeader } from '@/ui/components/Layout';
import type { Column, SortState } from '@/ui/components/Table';
import { DataTable, Pagination, cmpText, paginate, sortRows } from '@/ui/components/Table';
import { downloadCsv, stamp } from '@/ui/download';
import { useListQuery } from '@/ui/hooks';
import { Download, Wrench } from '@/ui/icons';
import { personOptions, priorityOptions, ticketStatusOptions } from '../options';
import { TicketModal } from './TicketModal';

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function MaintenancePage() {
  const lq = useListQuery();
  const [open, setOpen] = useState<Ticket | 'new' | null>(null);
  const { tickets, assets, people } = data.value;

  useEffect(() => {
    if (route.value.query.get('new') === '1') { setOpen('new'); lq.set({ new: undefined }); }
  }, [route.value.query.get('new')]);

  const q = lq.get('q').trim().toLowerCase();
  const fStatus = lq.get('status') || 'active'; // default view: work that is still open
  const fPriority = lq.get('priority');
  const fSpecialist = lq.get('specialist');
  const assetName = (x: Ticket): string => { const a = assetsById.value.get(x.assetId); return a ? `${a.inventoryNumber} · ${a.name}` : ''; };

  const filtered = tickets.filter((x) => {
    if (fStatus === 'active' ? !isActiveTicket(x.status) : fStatus !== 'all' && x.status !== fStatus) return false;
    if (fPriority && x.priority !== fPriority) return false;
    if (fSpecialist && (fSpecialist === 'none' ? x.specialistId !== null : x.specialistId !== fSpecialist)) return false;
    if (q && ![x.title, x.problem, x.workDone, assetName(x), personName(x.specialistId ? peopleById.value.get(x.specialistId) : undefined)].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  const columns: Column<Ticket>[] = [
    {
      id: 'title', header: t('field.title'), sort: (a, b) => cmpText(a.title, b.title),
      cell: (x) => (
        <span class="cell-stack">
          <button type="button" class="cell-primary" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }} onClick={() => setOpen(x)} data-testid="open-ticket">{x.title}</button>
          <a class="cell-sub" href={href(['assets', x.assetId])}>{assetName(x) || '—'}</a>
        </span>
      ),
    },
    { id: 'priority', header: t('field.priority'), sort: (a, b) => (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0), cell: (x) => <PriorityBadge priority={x.priority} /> },
    { id: 'status', header: t('field.status'), sort: (a, b) => cmpText(a.status, b.status), cell: (x) => <TicketStatusBadge status={x.status} /> },
    { id: 'specialist', header: t('field.specialist'), sort: (a, b) => cmpText(personName(a.specialistId ? peopleById.value.get(a.specialistId) : undefined), personName(b.specialistId ? peopleById.value.get(b.specialistId) : undefined)), cell: (x) => (x.specialistId ? personName(peopleById.value.get(x.specialistId)) : <span class="faint">—</span>) },
    { id: 'created', header: t('maintenance.created'), sort: (a, b) => cmpText(a.createdAt, b.createdAt), cell: (x) => <span class="nowrap">{fmtDateTime(x.createdAt)}</span> },
    { id: 'cost', header: t('field.cost'), sort: (a, b) => (a.cost ?? -1) - (b.cost ?? -1), cell: (x) => (x.cost === null ? <span class="faint">—</span> : <span class="num">{fmtMoney(x.cost)}</span>) },
  ];
  const sort: SortState = { col: lq.get('sort') || 'created', dir: lq.get('dir') === 'asc' ? 'asc' : 'desc' };
  const onSort = (col: string): void => lq.set({ sort: col, dir: sort.col === col && sort.dir === 'desc' ? 'asc' : 'desc' });
  const sorted = sortRows(filtered, columns, sort);
  const pg = paginate(sorted, Number(lq.get('page')) || 1, prefs.value.pageSize);
  const activeCount = tickets.filter((x) => isActiveTicket(x.status)).length;

  return (
    <>
      <PageHeader
        title={t('nav.maintenance')} subtitle={tn('maintenance.open_count', activeCount)}
        actions={<>
          <Button onClick={() => downloadCsv(`tickets-${stamp()}.csv`, ticketsToCsv(sorted, assets, people))} disabled={!sorted.length}><Download size={16} /> {t('common.export_csv')}</Button>
          <Button variant="primary" onClick={() => setOpen('new')} disabled={!assets.length} data-testid="new-ticket"><Wrench size={16} /> {t('maintenance.new')}</Button>
        </>}
      />
      <Card flush>
        <div class="toolbar">
          <input class="input input--search" type="search" placeholder={t('maintenance.search')} aria-label={t('maintenance.search')} value={lq.get('q')} onInput={(e) => lq.set({ q: (e.currentTarget as HTMLInputElement).value || undefined })} />
          <select class="select" aria-label={t('field.status')} value={fStatus} onChange={(e) => lq.set({ status: (e.currentTarget as HTMLSelectElement).value === 'active' ? undefined : (e.currentTarget as HTMLSelectElement).value })}>
            <option value="active">{t('maintenance.filter_active')}</option>
            <option value="all">{t('maintenance.filter_all')}</option>
            {ticketStatusOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select class="select" aria-label={t('field.priority')} value={fPriority} onChange={(e) => lq.set({ priority: (e.currentTarget as HTMLSelectElement).value || undefined })}>
            <option value="">{t('maintenance.all_priorities')}</option>
            {priorityOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select class="select" aria-label={t('field.specialist')} value={fSpecialist} onChange={(e) => lq.set({ specialist: (e.currentTarget as HTMLSelectElement).value || undefined })}>
            <option value="">{t('maintenance.all_specialists')}</option>
            <option value="none">{t('common.unassigned')}</option>
            {personOptions(people, { activeOnly: false }).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {pg.rows.length ? (
          <>
            <DataTable caption={t('nav.maintenance')} columns={columns} rows={pg.rows} rowKey={(x) => x.id} sort={sort} onSort={onSort} />
            <Pagination page={pg.page} pageSize={prefs.value.pageSize} total={sorted.length} onPage={(p) => lq.set({ page: String(p) })} />
          </>
        ) : (
          <EmptyState
            icon={<Wrench size={22} />} title={tickets.length ? t('maintenance.no_match') : t('maintenance.empty_title')}
            text={tickets.length ? t('maintenance.no_match_text') : t('maintenance.empty_text')}
            action={!tickets.length && assets.length ? <Button variant="primary" onClick={() => setOpen('new')}>{t('maintenance.new')}</Button> : undefined}
          />
        )}
      </Card>
      {open && <TicketModal ticket={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
    </>
  );
}
