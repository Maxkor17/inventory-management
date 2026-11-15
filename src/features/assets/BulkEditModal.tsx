import { useState } from 'preact/hooks';
import type { AssetStatus } from '@/domain/enums';
import { t, tn } from '@/i18n';
import { bulkUpdateAssets } from '@/services/assets';
import type { BulkPatch } from '@/services/assets';
import { assetsById, ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { errorText, SelectField } from '@/ui/components/Fields';
import { Banner } from '@/ui/components/Layout';
import { Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { locationOptions, personOptions, statusOptions } from '../options';

/** Applies the same status / location / holder change to every selected asset (all-or-nothing). */
export function BulkEditModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('');
  const [locationId, setLocationId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [problems, setProblems] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const { people, locations } = data.value;

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const patch: BulkPatch = {};
    if (status) patch.status = status as AssetStatus;
    if (locationId) patch.locationId = locationId;
    if (assigneeId) patch.assigneeId = assigneeId;
    if (!Object.keys(patch).length) { setProblems({ _form: 'nothing_to_change' }); return; }
    setBusy(true);
    try {
      const r = await mutate(() => bulkUpdateAssets(ctx(), ids, patch));
      if (!r.ok) { setProblems(r.errors); return; }
      toast('success', tn('assets.bulk_done', r.value.changed));
      onDone();
      onClose();
    } finally { setBusy(false); }
  };

  const failing = problems ? Object.entries(problems).filter(([k]) => k !== '_form') : [];
  return (
    <Modal
      title={tn('assets.bulk_title', ids.length)} size="narrow" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" type="submit" form="bulk-form" disabled={busy} data-testid="bulk-apply">{t('common.apply')}</Button>
      </>}
    >
      <form id="bulk-form" class="stack" onSubmit={(e) => void submit(e)} noValidate>
        <p class="muted">{t('assets.bulk_hint')}</p>
        <SelectField label={t('field.status')} value={status} onChange={setStatus} options={statusOptions()} emptyLabel={t('assets.no_change')} name="status" />
        <SelectField label={t('field.location')} value={locationId} onChange={setLocationId} options={locationOptions(locations)} emptyLabel={t('assets.no_change')} name="locationId" />
        <SelectField label={t('field.assignee')} value={assigneeId} onChange={setAssigneeId} options={personOptions(people)} emptyLabel={t('assets.no_change')} name="assigneeId" />
        {problems?._form && <Banner tone="danger">{errorText(problems._form)}</Banner>}
        {failing.length > 0 && (
          <Banner tone="danger">
            <strong>{t('assets.bulk_rejected')}</strong>
            <ul>{failing.slice(0, 5).map(([id, code]) => <li key={id}>{assetsById.value.get(id)?.inventoryNumber ?? id}: {errorText(code)}</li>)}</ul>
          </Banner>
        )}
      </form>
    </Modal>
  );
}
