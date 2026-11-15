import { useState } from 'preact/hooks';
import type { Asset } from '@/domain/types';
import { t } from '@/i18n';
import { assignAsset } from '@/services/assets';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { SelectField, TextAreaField } from '@/ui/components/Fields';
import { Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { personOptions } from '../options';

/** Give an asset to a person, or move it from its current holder to another person. */
export function AssignModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [personId, setPersonId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const options = personOptions(data.value.people, { excludeId: asset.assigneeId ?? undefined });

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (!personId) { setError('required'); return; }
    setBusy(true);
    try {
      const r = await mutate(() => assignAsset(ctx(), asset.id, personId, note.trim()));
      if (!r.ok) { setError(r.errors.assigneeId ?? r.errors._form ?? 'invalid'); return; }
      toast('success', t('assets.assigned'));
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={asset.assigneeId ? t('assets.transfer') : t('assets.assign')} size="narrow" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" type="submit" form="assign-form" disabled={busy} data-testid="assign-confirm">{t('common.confirm')}</Button>
      </>}
    >
      <form id="assign-form" class="stack" onSubmit={(e) => void submit(e)} noValidate>
        <SelectField label={t('assets.new_holder')} required value={personId} onChange={(v) => { setPersonId(v); setError(undefined); }} options={options} emptyLabel={t('assets.choose_person')} error={error} name="personId" />
        <TextAreaField label={t('assets.assign_note')} value={note} onChange={setNote} rows={2} name="note" />
      </form>
    </Modal>
  );
}
