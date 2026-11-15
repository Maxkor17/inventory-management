import { useState } from 'preact/hooks';
import type { Location } from '@/domain/types';
import { t, tn } from '@/i18n';
import { href } from '@/router/router';
import { createLocation, deleteLocation, updateLocation } from '@/services/locations';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { errorText, TextAreaField, TextField } from '@/ui/components/Fields';
import { Card, EmptyState, PageHeader } from '@/ui/components/Layout';
import { confirmDelete, Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { useForm } from '@/ui/hooks';
import { MapPin, Pencil, Plus, Trash2 } from '@/ui/icons';

function LocationForm({ location, onClose }: { location?: Location; onClose: () => void }) {
  const { values: v, set, errors, setErrors } = useForm({ name: location?.name ?? '', description: location?.description ?? '' });
  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const r = await mutate(() => (location ? updateLocation(ctx(), location.id, v) : createLocation(ctx(), v)));
    if (!r.ok) { setErrors(r.errors); return; }
    toast('success', location ? t('locations.updated') : t('locations.created'));
    onClose();
  };
  return (
    <Modal
      title={location ? t('locations.edit') : t('locations.add')} size="narrow" onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="location-form" data-testid="location-save">{t('common.save')}</Button></>}
    >
      <form id="location-form" class="stack" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t('field.name')} required value={v.name} onChange={(x) => set('name', x)} error={errors.name} name="name" autoFocus />
        <TextAreaField label={t('field.description')} value={v.description} onChange={(x) => set('description', x)} error={errors.description} rows={3} name="description" />
      </form>
    </Modal>
  );
}

export function LocationsPage() {
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const { locations, assets, people } = data.value;
  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const remove = async (l: Location): Promise<void> => {
    if (!(await confirmDelete(l.name))) return;
    const r = await mutate(() => deleteLocation(ctx(), l.id));
    if (r.ok) toast('success', t('locations.deleted'));
    else toast('error', errorText(r.errors._form === 'in_use' ? 'location_in_use' : r.errors._form));
  };

  return (
    <>
      <PageHeader title={t('nav.locations')} subtitle={tn('locations.count', locations.length)} actions={<Button variant="primary" onClick={() => setEditing('new')} data-testid="add-location"><Plus size={16} /> {t('locations.add')}</Button>} />
      <Card flush>
        {sorted.length ? (
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">{t('nav.locations')}</caption>
              <thead><tr><th>{t('field.name')}</th><th>{t('field.description')}</th><th>{t('nav.assets')}</th><th>{t('nav.people')}</th><th /></tr></thead>
              <tbody>
                {sorted.map((l) => {
                  const a = assets.filter((x) => x.locationId === l.id).length;
                  const p = people.filter((x) => x.locationId === l.id).length;
                  return (
                    <tr key={l.id}>
                      <td data-label={t('field.name')}><span class="cell-primary">{l.name}</span></td>
                      <td data-label={t('field.description')}>{l.description || <span class="faint">—</span>}</td>
                      <td data-label={t('nav.assets')}>{a ? <a class="num" href={href(['assets'], { location: l.id })}>{a}</a> : <span class="faint num">0</span>}</td>
                      <td data-label={t('nav.people')} class="num">{p}</td>
                      <td class="col-actions">
                        <Button small variant="ghost" iconOnly aria-label={t('common.edit')} onClick={() => setEditing(l)} data-testid="edit-location"><Pencil size={15} /></Button>
                        <Button small variant="ghost" iconOnly aria-label={t('common.delete')} onClick={() => void remove(l)} data-testid="delete-location"><Trash2 size={15} /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={<MapPin size={22} />} title={t('locations.empty_title')} text={t('locations.empty_text')} action={<Button variant="primary" onClick={() => setEditing('new')}>{t('locations.add')}</Button>} />}
      </Card>
      {editing && <LocationForm location={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
