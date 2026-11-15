import { useState } from 'preact/hooks';
import type { Person, PersonInput } from '@/domain/types';
import { t } from '@/i18n';
import { createPerson, updatePerson } from '@/services/people';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { SelectField, TextAreaField, TextField } from '@/ui/components/Fields';
import { Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { useForm } from '@/ui/hooks';
import { locationOptions } from '../options';

export function PersonForm({ person, onClose }: { person?: Person; onClose: () => void }) {
  const { people, locations } = data.value;
  const { values: v, set, errors, setErrors } = useForm({
    firstName: person?.firstName ?? '', lastName: person?.lastName ?? '', position: person?.position ?? '', department: person?.department ?? '',
    email: person?.email ?? '', phone: person?.phone ?? '', locationId: person?.locationId ?? '', startDate: person?.startDate ?? '', notes: person?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const departments = [...new Set(people.map((p) => p.department).filter(Boolean))].sort();

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const input: PersonInput = { ...v, locationId: v.locationId || null };
    setBusy(true);
    try {
      const r = await mutate(() => (person ? updatePerson(ctx(), person.id, input) : createPerson(ctx(), input)));
      if (!r.ok) { setErrors(r.errors); return; }
      toast('success', person ? t('people.updated') : t('people.created'));
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={person ? t('people.edit') : t('people.add')} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" type="submit" form="person-form" disabled={busy} data-testid="person-save">{t('common.save')}</Button>
      </>}
    >
      <form id="person-form" class="form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t('field.firstName')} required value={v.firstName} onChange={(x) => set('firstName', x)} error={errors.firstName} name="firstName" autoFocus />
        <TextField label={t('field.lastName')} required value={v.lastName} onChange={(x) => set('lastName', x)} error={errors.lastName} name="lastName" />
        <TextField label={t('field.position')} value={v.position} onChange={(x) => set('position', x)} error={errors.position} name="position" />
        <TextField label={t('field.department')} value={v.department} onChange={(x) => set('department', x)} error={errors.department} name="department" list="departments" />
        <datalist id="departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        <TextField label={t('field.email')} type="email" value={v.email} onChange={(x) => set('email', x)} error={errors.email} name="email" />
        <TextField label={t('field.phone')} type="tel" value={v.phone} onChange={(x) => set('phone', x)} error={errors.phone} name="phone" />
        <SelectField label={t('field.location')} value={v.locationId} onChange={(x) => set('locationId', x)} options={locationOptions(locations)} emptyLabel={t('common.no_location')} error={errors.locationId} name="locationId" />
        <TextField label={t('field.startDate')} type="date" value={v.startDate} onChange={(x) => set('startDate', x)} error={errors.startDate} name="startDate" />
        <TextAreaField label={t('field.notes')} span2 value={v.notes} onChange={(x) => set('notes', x)} error={errors.notes} name="notes" />
      </form>
    </Modal>
  );
}
