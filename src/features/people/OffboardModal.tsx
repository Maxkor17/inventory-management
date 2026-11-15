import { useState } from 'preact/hooks';
import { assetsHeldBy } from '@/domain/offboarding';
import type { OffboardingDecision } from '@/domain/offboarding';
import type { Person } from '@/domain/types';
import { fullName } from '@/domain/people';
import { t, tc, tn } from '@/i18n';
import { offboardPerson } from '@/services/people';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { StatusBadge } from '@/ui/components/Badges';
import { errorText } from '@/ui/components/Fields';
import { Banner } from '@/ui/components/Layout';
import { Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { personOptions } from '../options';

/**
 * Employee leaves: decide what happens to every asset they hold (transfer or return to stock),
 * then deactivate. History is kept — nothing is deleted.
 */
export function OffboardModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const held = assetsHeldBy(data.value.assets, person.id);
  const targets = personOptions(data.value.people, { excludeId: person.id });
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const setAll = (value: string): void => setChoices(Object.fromEntries(held.map((a) => [a.id, value])));

  const submit = async (): Promise<void> => {
    const decisions: Record<string, OffboardingDecision> = {};
    for (const a of held) {
      const c = choices[a.id];
      if (c === 'stock') decisions[a.id] = { kind: 'stock' };
      else if (c) decisions[a.id] = { kind: 'transfer', toPersonId: c };
    }
    setBusy(true);
    try {
      const r = await mutate(() => offboardPerson(ctx(), person.id, decisions));
      if (!r.ok) { setErrors(r.errors); return; }
      toast('success', t('people.offboarded', { name: fullName(person) }));
      onClose();
    } finally { setBusy(false); }
  };

  const options = (
    <>
      <option value="">{t('people.choose_action')}</option>
      <option value="stock">{t('people.return_to_stock')}</option>
      <optgroup label={t('people.transfer_to')}>{targets.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
    </>
  );

  return (
    <Modal
      title={t('people.offboard_title', { name: fullName(person) })} size="wide" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger-solid" disabled={busy} onClick={() => void submit()} data-testid="offboard-confirm">{t('people.offboard_confirm')}</Button>
      </>}
    >
      <div class="stack">
        <p class="muted">{held.length ? tn('people.offboard_intro', held.length) : t('people.offboard_none')}</p>
        {errors._form && <Banner tone="danger">{errorText(errors._form)}</Banner>}
        {held.length > 1 && (
          <label class="row">
            <span class="field__label">{t('people.apply_to_all')}</span>
            <select class="select" style={{ width: 'auto' }} value="" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) setAll(v); }} data-testid="offboard-all">
              {options}
            </select>
          </label>
        )}
        <div>
          {held.map((a) => (
            <div key={a.id} class="offboard-row">
              <div class="cell-stack">
                <span class="cell-primary">{a.name}</span>
                <span class="cell-sub">{a.inventoryNumber} · {tc('category', a.category)} · <StatusBadge status={a.status} /></span>
              </div>
              <div class="field">
                <select class="select" aria-label={a.name} value={choices[a.id] ?? ''} aria-invalid={errors[a.id] ? 'true' : undefined} onChange={(e) => setChoices({ ...choices, [a.id]: (e.currentTarget as HTMLSelectElement).value })} data-testid="offboard-choice">
                  {options}
                </select>
                {errors[a.id] && <span class="field__error">{errorText(errors[a.id])}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
