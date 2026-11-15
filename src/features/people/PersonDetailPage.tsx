import { useState } from 'preact/hooks';
import { fullName } from '@/domain/people';
import { fmtDate, fmtDateTime, t, tc, tn } from '@/i18n';
import type { TKey } from '@/i18n';
import { href } from '@/router/router';
import { heldAssets } from '@/state/selectors';
import { assetsById, ctx, data, locationsById, mutate } from '@/state/store';
import { reactivatePerson } from '@/services/people';
import { returnAssetToStock } from '@/services/assets';
import { Button } from '@/ui/components/Button';
import { PersonStatusBadge, StatusBadge } from '@/ui/components/Badges';
import { Breadcrumb, Card, DefinitionList, EmptyState, PageHeader } from '@/ui/components/Layout';
import { confirmDialog } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { Pencil, UserCheck, UserMinus, Users } from '@/ui/icons';
import type { Asset } from '@/domain/types';
import { ActivityList } from '../activity/ActivityItem';
import { AssignModal } from '../assets/AssignModal';
import { OffboardModal } from './OffboardModal';
import { PersonForm } from './PersonForm';

export function PersonDetailPage({ id }: { id: string }) {
  const person = data.value.people.find((p) => p.id === id);
  const [edit, setEdit] = useState(false);
  const [offboard, setOffboard] = useState(false);
  const [transfer, setTransfer] = useState<Asset | null>(null);

  if (!person) {
    return <div class="card"><EmptyState icon={<Users size={22} />} title={t('people.not_found')} text={t('people.not_found_text')} action={<a class="btn btn--primary" href={href(['people'])}>{t('nav.people')}</a>} /></div>;
  }

  const { assets, assignments, activity } = data.value;
  const held = heldAssets(assets, id);
  const history = assignments.filter((a) => a.personId === id).sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1));
  const events = activity.filter((e) => e.personId === id || e.entityId === id);
  const loc = person.locationId ? locationsById.value.get(person.locationId) : undefined;

  const reactivate = async (): Promise<void> => {
    const r = await mutate(() => reactivatePerson(ctx(), id));
    if (r.ok) toast('success', t('people.reactivated', { name: fullName(person) }));
  };
  const giveBack = async (a: Asset): Promise<void> => {
    const ok = await confirmDialog({ title: t('assets.return_title'), message: t('assets.return_message', { name: fullName(person) }), confirmLabel: t('assets.return') });
    if (!ok) return;
    const r = await mutate(() => returnAssetToStock(ctx(), a.id));
    if (r.ok) toast('success', t('assets.returned'));
  };

  return (
    <>
      <Breadcrumb items={[{ label: t('nav.people'), to: ['people'] }, { label: fullName(person) }]} />
      <PageHeader
        title={fullName(person)}
        subtitle={<span class="row">{person.position || t('people.no_position')}<PersonStatusBadge status={person.status} /></span>}
        actions={<>
          <Button onClick={() => setEdit(true)} data-testid="edit-person"><Pencil size={16} /> {t('common.edit')}</Button>
          {person.status === 'active'
            ? <Button variant="danger" onClick={() => setOffboard(true)} data-testid="offboard-person"><UserMinus size={16} /> {t('people.offboard')}</Button>
            : <Button onClick={() => void reactivate()} data-testid="reactivate-person"><UserCheck size={16} /> {t('people.reactivate')}</Button>}
        </>}
      />

      {person.status === 'inactive' && (
        <div class="banner banner--warning">{t('people.inactive_note', { date: person.deactivatedAt ? fmtDate(person.deactivatedAt.slice(0, 10)) : '' })}</div>
      )}

      <div class="grid grid--2">
        <Card title={t('people.details')}>
          <DefinitionList items={[
            { label: t('field.email'), value: person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : '' },
            { label: t('field.phone'), value: person.phone },
            { label: t('field.department'), value: person.department },
            { label: t('field.location'), value: loc?.name ?? '' },
            { label: t('field.startDate'), value: person.startDate ? fmtDate(person.startDate) : '' },
            { label: t('field.notes'), value: person.notes },
          ]} />
        </Card>
        <Card title={`${t('people.assets_held')} (${held.length})`}>
          {held.length ? (
            <div class="stack">
              {held.map((a) => (
                <div key={a.id} class="row row--between">
                  <div class="cell-stack">
                    <a class="cell-primary" href={href(['assets', a.id])}>{a.name}</a>
                    <span class="cell-sub">{a.inventoryNumber} · {tc('category', a.category)} · <StatusBadge status={a.status} /></span>
                  </div>
                  <div class="row">
                    <Button small onClick={() => setTransfer(a)}>{t('assets.transfer')}</Button>
                    <Button small onClick={() => void giveBack(a)}>{t('assets.return')}</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p class="muted">{t('people.no_assets')}</p>}
        </Card>
      </div>

      <Card flush title={tn('people.history_title', history.length)}>
        {history.length ? (
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">{t('people.history_title_plain')}</caption>
              <thead><tr><th>{t('field.asset')}</th><th>{t('assets.assigned_at')}</th><th>{t('assets.returned_at')}</th><th>{t('assets.reason')}</th></tr></thead>
              <tbody>
                {history.map((a) => {
                  const asset = assetsById.value.get(a.assetId);
                  return (
                    <tr key={a.id}>
                      <td data-label={t('field.asset')}>{asset ? <a href={href(['assets', asset.id])}>{asset.inventoryNumber} · {asset.name}</a> : '—'}</td>
                      <td data-label={t('assets.assigned_at')}>{fmtDateTime(a.assignedAt)}</td>
                      <td data-label={t('assets.returned_at')}>{a.returnedAt ? fmtDateTime(a.returnedAt) : <span class="badge badge--success">{t('assets.current')}</span>}</td>
                      <td data-label={t('assets.reason')}>{a.endReason ? t(`reason.${a.endReason}` as TKey) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p class="muted" style={{ padding: '16px 20px' }}>{t('people.no_history')}</p>}
      </Card>

      <Card title={t('assets.tab_history')}>{events.length ? <ActivityList events={events} /> : <p class="muted">{t('activity.empty')}</p>}</Card>

      {edit && <PersonForm person={person} onClose={() => setEdit(false)} />}
      {offboard && <OffboardModal person={person} onClose={() => setOffboard(false)} />}
      {transfer && <AssignModal asset={transfer} onClose={() => setTransfer(null)} />}
    </>
  );
}
