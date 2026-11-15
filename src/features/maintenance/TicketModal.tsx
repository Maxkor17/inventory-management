import { useState } from 'preact/hooks';
import type { AssetStatus } from '@/domain/enums';
import { nextTicketStatuses } from '@/domain/maintenance';
import type { Ticket, TicketInput } from '@/domain/types';
import { fmtDateTime, t, tc } from '@/i18n';
import { createTicket, deleteTicket, transitionTicket, updateTicket } from '@/services/tickets';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { PriorityBadge, TicketStatusBadge } from '@/ui/components/Badges';
import { CheckField, errorText, parseCost, SelectField, TextAreaField, TextField } from '@/ui/components/Fields';
import { Banner } from '@/ui/components/Layout';
import { confirmDelete, Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { useForm } from '@/ui/hooks';
import { assetOptions, personOptions, priorityOptions, statusOptions } from '../options';
import type { TicketStatus } from '@/domain/enums';

interface Props {
  ticket?: Ticket;
  /** Preselects (and locks) the asset when opened from an asset page. */
  assetId?: string;
  onClose: () => void;
}

export function TicketModal({ ticket, assetId, onClose }: Props) {
  const { assets, people } = data.value;
  const live = ticket ? data.value.tickets.find((x) => x.id === ticket.id) ?? ticket : undefined;
  const { values: v, set, errors, setErrors } = useForm({
    assetId: live?.assetId ?? assetId ?? '', title: live?.title ?? '', problem: live?.problem ?? '', priority: live?.priority ?? 'medium',
    specialistId: live?.specialistId ?? '', workDone: live?.workDone ?? '', cost: live?.cost === null || live?.cost === undefined ? '' : String(live.cost),
  });
  const [markRepair, setMarkRepair] = useState(false);
  const [restore, setRestore] = useState('');
  const [busy, setBusy] = useState(false);

  const asset = assets.find((a) => a.id === v.assetId);
  const readOnly = live?.status === 'closed';

  const build = (): TicketInput | null => {
    const cost = parseCost(v.cost);
    if (cost === undefined) { setErrors({ cost: 'invalid_number' }); return null; }
    return {
      assetId: v.assetId, title: v.title, problem: v.problem, priority: v.priority as TicketInput['priority'],
      specialistId: v.specialistId || null, workDone: v.workDone, cost,
    };
  };

  const save = async (e: Event): Promise<void> => {
    e.preventDefault();
    const input = build();
    if (!input) return;
    setBusy(true);
    try {
      const r = await mutate(() => (live ? updateTicket(ctx(), live.id, input) : createTicket(ctx(), input, { setAssetUnderRepair: markRepair })));
      if (!r.ok) { setErrors(r.errors); if (r.errors._form) toast('error', errorText(r.errors._form)); return; }
      toast('success', live ? t('maintenance.updated') : t('maintenance.created_toast'));
      onClose();
    } finally { setBusy(false); }
  };

  const move = async (to: TicketStatus): Promise<void> => {
    if (!live) return;
    const cost = parseCost(v.cost);
    if (cost === undefined) { setErrors({ cost: 'invalid_number' }); return; }
    setBusy(true);
    try {
      // Persist edits first so the transition sees the latest work description/cost.
      const input = build();
      if (input) { const u = await mutate(() => updateTicket(ctx(), live.id, input)); if (!u.ok) { setErrors(u.errors); return; } }
      const r = await mutate(() => transitionTicket(ctx(), live.id, to, {
        workDone: v.workDone, cost,
        setAssetUnderRepair: to === 'in_progress' && markRepair,
        restoreAssetStatus: (to === 'resolved' || to === 'closed') && restore ? (restore as AssetStatus) : null,
      }));
      if (!r.ok) { setErrors(r.errors); if (r.errors._form) toast('error', errorText(r.errors._form)); return; }
      toast('success', t('maintenance.status_changed', { status: tc('ticket_status', to) }));
      if (to === 'closed') onClose();
    } finally { setBusy(false); }
  };

  const remove = async (): Promise<void> => {
    if (!live || !(await confirmDelete(live.title))) return;
    const r = await mutate(() => deleteTicket(ctx(), live.id));
    if (r.ok) { toast('success', t('maintenance.deleted')); onClose(); }
  };

  const nextStatuses = live ? nextTicketStatuses(live.status) : [];
  const assetUnderRepair = asset?.status === 'under_repair';

  return (
    <Modal
      title={live ? t('maintenance.ticket') : t('maintenance.new')} size="wide" onClose={onClose}
      footer={<>
        {live && <Button variant="danger" onClick={() => void remove()} data-testid="ticket-delete" style={{ marginRight: 'auto' }}>{t('common.delete')}</Button>}
        <Button onClick={onClose}>{t('common.close')}</Button>
        {!readOnly && <Button variant="primary" type="submit" form="ticket-form" disabled={busy} data-testid="ticket-save">{t('common.save')}</Button>}
      </>}
    >
      {live && (
        <div class="row" style={{ marginBottom: 16 }}>
          <TicketStatusBadge status={live.status} /> <PriorityBadge priority={live.priority} />
          <span class="muted">{t('maintenance.created')}: {fmtDateTime(live.createdAt)}</span>
          {live.resolvedAt && <span class="muted">{t('maintenance.resolved')}: {fmtDateTime(live.resolvedAt)}</span>}
        </div>
      )}
      {readOnly && <Banner>{t('maintenance.closed_note')}</Banner>}
      <form id="ticket-form" class="form-grid" onSubmit={(e) => void save(e)} noValidate>
        <SelectField label={t('field.asset')} required value={v.assetId} onChange={(x) => set('assetId', x)} options={assetOptions(assets)} emptyLabel={t('maintenance.choose_asset')} error={errors.assetId} name="assetId" span2 />
        <TextField label={t('field.title')} required span2 value={v.title} onChange={(x) => set('title', x)} error={errors.title} name="title" autoFocus={!live} />
        <TextAreaField label={t('field.problem')} required span2 value={v.problem} onChange={(x) => set('problem', x)} error={errors.problem} name="problem" />
        <SelectField label={t('field.priority')} value={v.priority} onChange={(x) => set('priority', x as typeof v.priority)} options={priorityOptions()} error={errors.priority} name="priority" />
        <SelectField label={t('field.specialist')} value={v.specialistId} onChange={(x) => set('specialistId', x)} options={personOptions(people, { keepId: live?.specialistId })} emptyLabel={t('common.unassigned')} error={errors.specialistId} name="specialistId" />
        {live && (
          <>
            <TextAreaField label={t('field.workDone')} span2 value={v.workDone} onChange={(x) => set('workDone', x)} error={errors.workDone} name="workDone" hint={t('maintenance.work_hint')} />
            <TextField label={t('field.cost')} type="number" value={v.cost} onChange={(x) => set('cost', x)} error={errors.cost} name="cost" />
          </>
        )}
        {!live && asset && asset.status !== 'retired' && asset.status !== 'lost' && asset.status !== 'under_repair' && (
          <div class="span-2"><CheckField label={t('maintenance.mark_under_repair')} checked={markRepair} onChange={setMarkRepair} /></div>
        )}
      </form>

      {live && nextStatuses.length > 0 && (
        <div class="stack" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <h3>{t('maintenance.change_status')}</h3>
          {nextStatuses.includes('in_progress') && asset && asset.status !== 'under_repair' && asset.status !== 'retired' && asset.status !== 'lost' && (
            <CheckField label={t('maintenance.mark_under_repair')} checked={markRepair} onChange={setMarkRepair} />
          )}
          {(nextStatuses.includes('resolved') || nextStatuses.includes('closed')) && assetUnderRepair && (
            <SelectField label={t('maintenance.restore_status')} value={restore} onChange={setRestore} options={statusOptions().filter((o) => o.value !== 'retired' && o.value !== 'lost' && o.value !== 'under_repair')} emptyLabel={t('assets.no_change')} hint={t('maintenance.restore_hint')} name="restore" />
          )}
          <div class="row">
            {nextStatuses.map((s) => (
              <Button key={s} disabled={busy} onClick={() => void move(s)} data-testid={`ticket-to-${s}`}>
                → {tc('ticket_status', s)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
