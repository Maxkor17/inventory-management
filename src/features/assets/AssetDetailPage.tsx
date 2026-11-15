import { useState } from 'preact/hooks';
import type { Asset } from '@/domain/types';
import { todayISO } from '@/domain/util';
import { warrantyState } from '@/domain/warranty';
import { fmtDate, fmtDateTime, fmtMoney, t, tc } from '@/i18n';
import type { TKey } from '@/i18n';
import { href, navigate } from '@/router/router';
import { personName, ticketsOf } from '@/state/selectors';
import { prefs } from '@/state/prefs';
import { ctx, data, locationsById, mutate, peopleById } from '@/state/store';
import { deleteAsset, returnAssetToStock } from '@/services/assets';
import { Button } from '@/ui/components/Button';
import { PriorityBadge, StatusBadge, TicketStatusBadge, WarrantyBadge } from '@/ui/components/Badges';
import { Breadcrumb, Card, DefinitionList, EmptyState, PageHeader, Tabs } from '@/ui/components/Layout';
import { confirmDelete, confirmDialog } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { useListQuery } from '@/ui/hooks';
import { ArrowRightLeft, Package, Pencil, Printer, Trash2, Undo2, Wrench } from '@/ui/icons';
import { ActivityList } from '../activity/ActivityItem';
import { TicketModal } from '../maintenance/TicketModal';
import type { Ticket } from '@/domain/types';
import { AssetForm } from './AssetForm';
import { AssignModal } from './AssignModal';

const TABS = ['overview', 'assignments', 'maintenance', 'history'] as const;
type Tab = (typeof TABS)[number];

export function AssetDetailPage({ id }: { id: string }) {
  const lq = useListQuery();
  const asset = data.value.assets.find((a) => a.id === id);
  const [edit, setEdit] = useState(false);
  const [assign, setAssign] = useState(false);
  const [ticket, setTicket] = useState<Ticket | 'new' | null>(null);

  if (!asset) {
    return (
      <div class="card"><EmptyState icon={<Package size={22} />} title={t('assets.not_found')} text={t('assets.not_found_text')} action={<a class="btn btn--primary" href={href(['assets'])}>{t('nav.assets')}</a>} /></div>
    );
  }

  const tabParam = lq.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : 'overview';
  const { assignments, tickets, activity } = data.value;
  const ledger = assignments.filter((a) => a.assetId === id).sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1));
  const assetTickets = ticketsOf(tickets, id);
  const history = activity.filter((e) => e.assetId === id || e.entityId === id);
  const holder = asset.assigneeId ? peopleById.value.get(asset.assigneeId) : undefined;
  const loc = asset.locationId ? locationsById.value.get(asset.locationId) : undefined;
  const warranty = warrantyState(asset.warrantyEndDate, todayISO(), prefs.value.warrantySoonDays);
  const canAssign = asset.status !== 'retired' && asset.status !== 'lost';

  const remove = async (a: Asset): Promise<void> => {
    if (!(await confirmDelete(`${a.inventoryNumber} · ${a.name}`, 'assets.delete_extra'))) return;
    const r = await mutate(() => deleteAsset(ctx(), a.id));
    if (r.ok) { toast('success', t('assets.deleted')); navigate(['assets']); }
  };

  const giveBack = async (): Promise<void> => {
    const ok = await confirmDialog({ title: t('assets.return_title'), message: t('assets.return_message', { name: personName(holder) }), confirmLabel: t('assets.return') });
    if (!ok) return;
    const r = await mutate(() => returnAssetToStock(ctx(), id));
    if (r.ok) toast('success', t('assets.returned'));
  };

  const print = (): void => {
    if (tab !== 'overview') lq.set({ tab: undefined });
    setTimeout(() => window.print(), 80);
  };

  return (
    <>
      <Breadcrumb items={[{ label: t('nav.assets'), to: ['assets'] }, { label: asset.inventoryNumber }]} />
      <PageHeader
        title={asset.name}
        subtitle={<span class="row"><span class="mono">{asset.inventoryNumber}</span><StatusBadge status={asset.status} /></span>}
        actions={<>
          <Button onClick={() => setEdit(true)} data-testid="edit-asset"><Pencil size={16} /> {t('common.edit')}</Button>
          {canAssign && <Button onClick={() => setAssign(true)} data-testid="assign-asset"><ArrowRightLeft size={16} /> {asset.assigneeId ? t('assets.transfer') : t('assets.assign')}</Button>}
          {asset.assigneeId && <Button onClick={() => void giveBack()} data-testid="return-asset"><Undo2 size={16} /> {t('assets.return')}</Button>}
          <Button onClick={() => setTicket('new')}><Wrench size={16} /> {t('maintenance.new')}</Button>
          <Button onClick={print}><Printer size={16} /> {t('common.print')}</Button>
          <Button variant="danger" onClick={() => void remove(asset)} data-testid="delete-asset"><Trash2 size={16} /> {t('common.delete')}</Button>
        </>}
      />

      <div class="print-only"><h2>{t('assets.card_title')}: {asset.inventoryNumber} · {asset.name}</h2></div>

      <Tabs
        current={tab} onChange={(id2) => lq.set({ tab: id2 === 'overview' ? undefined : id2 })}
        tabs={[
          { id: 'overview', label: t('assets.tab_overview') },
          { id: 'assignments', label: t('assets.tab_assignments'), count: ledger.length },
          { id: 'maintenance', label: t('assets.tab_maintenance'), count: assetTickets.length },
          { id: 'history', label: t('assets.tab_history'), count: history.length },
        ]}
      />

      {tab === 'overview' && (
        <div class="grid grid--2">
          <Card title={t('assets.identification')}>
            <DefinitionList items={[
              { label: t('field.inventoryNumber'), value: <span class="mono">{asset.inventoryNumber}</span> },
              { label: t('field.name'), value: asset.name },
              { label: t('field.manufacturer'), value: asset.manufacturer },
              { label: t('field.model'), value: asset.model },
              { label: t('field.serialNumber'), value: asset.serialNumber ? <span class="mono">{asset.serialNumber}</span> : '' },
              { label: t('field.category'), value: tc('category', asset.category) },
            ]} />
          </Card>
          <Card title={t('assets.status_assignment')}>
            <DefinitionList items={[
              { label: t('field.status'), value: <StatusBadge status={asset.status} /> },
              { label: t('field.assignee'), value: holder ? <a href={href(['people', holder.id])}>{personName(holder)}</a> : <span class="faint">{t('common.unassigned')}</span> },
              { label: t('field.location'), value: loc?.name ?? '' },
            ]} />
          </Card>
          <Card title={t('assets.lifecycle')}>
            <DefinitionList items={[
              { label: t('field.purchaseDate'), value: asset.purchaseDate ? fmtDate(asset.purchaseDate) : '' },
              { label: t('field.commissionedDate'), value: asset.commissionedDate ? fmtDate(asset.commissionedDate) : '' },
              { label: t('field.warrantyEndDate'), value: asset.warrantyEndDate ? <span class="row">{fmtDate(asset.warrantyEndDate)} <WarrantyBadge state={warranty} /></span> : <WarrantyBadge state={warranty} /> },
              { label: t('field.supplier'), value: asset.supplier },
              { label: t('field.cost'), value: asset.cost === null ? '' : fmtMoney(asset.cost) },
            ]} />
          </Card>
          <Card title={t('assets.notes')}>
            <DefinitionList items={[
              { label: t('field.description'), value: asset.description },
              { label: t('field.notes'), value: asset.notes },
              { label: t('assets.created_at'), value: fmtDateTime(asset.createdAt) },
              { label: t('assets.updated_at'), value: fmtDateTime(asset.updatedAt) },
            ]} />
          </Card>
        </div>
      )}

      {tab === 'assignments' && (
        <Card flush>
          {ledger.length ? (
            <div class="table-wrap">
              <table class="table">
                <caption class="sr-only">{t('assets.tab_assignments')}</caption>
                <thead><tr><th>{t('field.assignee')}</th><th>{t('assets.assigned_at')}</th><th>{t('assets.returned_at')}</th><th>{t('assets.reason')}</th><th>{t('field.notes')}</th></tr></thead>
                <tbody>
                  {ledger.map((a) => {
                    const p = peopleById.value.get(a.personId);
                    return (
                      <tr key={a.id}>
                        <td data-label={t('field.assignee')}>{p ? <a href={href(['people', p.id])}>{personName(p)}</a> : '—'}</td>
                        <td data-label={t('assets.assigned_at')}>{fmtDateTime(a.assignedAt)}</td>
                        <td data-label={t('assets.returned_at')}>{a.returnedAt ? fmtDateTime(a.returnedAt) : <span class="badge badge--success">{t('assets.current')}</span>}</td>
                        <td data-label={t('assets.reason')}>{a.endReason ? t(`reason.${a.endReason}` as TKey) : '—'}</td>
                        <td data-label={t('field.notes')}>{a.note || <span class="faint">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={<ArrowRightLeft size={22} />} title={t('assets.no_assignments')} />}
        </Card>
      )}

      {tab === 'maintenance' && (
        <Card flush>
          <div class="toolbar"><span class="toolbar__spacer" /><Button variant="primary" small onClick={() => setTicket('new')}><Wrench size={14} /> {t('maintenance.new')}</Button></div>
          {assetTickets.length ? (
            <div class="table-wrap">
              <table class="table">
                <caption class="sr-only">{t('assets.tab_maintenance')}</caption>
                <thead><tr><th>{t('field.title')}</th><th>{t('field.priority')}</th><th>{t('field.status')}</th><th>{t('field.specialist')}</th><th>{t('maintenance.created')}</th><th>{t('field.cost')}</th><th /></tr></thead>
                <tbody>
                  {assetTickets.map((x) => (
                    <tr key={x.id}>
                      <td data-label={t('field.title')}><span class="cell-primary">{x.title}</span></td>
                      <td data-label={t('field.priority')}><PriorityBadge priority={x.priority} /></td>
                      <td data-label={t('field.status')}><TicketStatusBadge status={x.status} /></td>
                      <td data-label={t('field.specialist')}>{x.specialistId ? personName(peopleById.value.get(x.specialistId)) : <span class="faint">—</span>}</td>
                      <td data-label={t('maintenance.created')}>{fmtDateTime(x.createdAt)}</td>
                      <td data-label={t('field.cost')}>{x.cost === null ? <span class="faint">—</span> : fmtMoney(x.cost)}</td>
                      <td class="col-actions"><Button small onClick={() => setTicket(x)}>{t('common.open')}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={<Wrench size={22} />} title={t('assets.no_tickets')} />}
        </Card>
      )}

      {tab === 'history' && (
        <Card>{history.length ? <ActivityList events={history} /> : <p class="muted">{t('activity.empty')}</p>}</Card>
      )}

      {edit && <AssetForm asset={asset} onClose={() => setEdit(false)} />}
      {assign && <AssignModal asset={asset} onClose={() => setAssign(false)} />}
      {ticket && <TicketModal ticket={ticket === 'new' ? undefined : ticket} assetId={id} onClose={() => setTicket(null)} />}
    </>
  );
}
