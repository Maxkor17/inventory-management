import { useState } from 'preact/hooks';
import type { Asset, AssetInput } from '@/domain/types';
import { formatInventoryNumber, nextInventoryNumberStart } from '@/domain/legacy-mapping';
import { t } from '@/i18n';
import { createAsset, updateAsset } from '@/services/assets';
import { ctx, data, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { parseCost, SelectField, TextAreaField, TextField } from '@/ui/components/Fields';
import { Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { useForm } from '@/ui/hooks';
import { categoryOptions, locationOptions, personOptions, statusOptions } from '../options';

interface Values {
  inventoryNumber: string; name: string; manufacturer: string; model: string; serialNumber: string;
  category: string; status: string; assigneeId: string; locationId: string;
  purchaseDate: string; commissionedDate: string; warrantyEndDate: string;
  supplier: string; cost: string; description: string; notes: string;
}

const NO_HOLDER = ['in_stock', 'retired', 'lost'];

function initial(asset: Asset | undefined, nextNumber: string): Values {
  return {
    inventoryNumber: asset?.inventoryNumber ?? nextNumber, name: asset?.name ?? '', manufacturer: asset?.manufacturer ?? '', model: asset?.model ?? '',
    serialNumber: asset?.serialNumber ?? '', category: asset?.category ?? 'laptop', status: asset?.status ?? 'in_stock',
    assigneeId: asset?.assigneeId ?? '', locationId: asset?.locationId ?? '',
    purchaseDate: asset?.purchaseDate ?? '', commissionedDate: asset?.commissionedDate ?? '', warrantyEndDate: asset?.warrantyEndDate ?? '',
    supplier: asset?.supplier ?? '', cost: asset?.cost === null || asset?.cost === undefined ? '' : String(asset.cost),
    description: asset?.description ?? '', notes: asset?.notes ?? '',
  };
}

export function AssetForm({ asset, onClose, onSaved }: { asset?: Asset; onClose: () => void; onSaved?: (a: Asset) => void }) {
  const { assets, people, locations } = data.value;
  const { values: v, set, errors, setErrors } = useForm<Values>(initial(asset, formatInventoryNumber(nextInventoryNumberStart(assets))));
  const [busy, setBusy] = useState(false);
  const noHolder = NO_HOLDER.includes(v.status);

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const cost = parseCost(v.cost);
    if (cost === undefined) { setErrors({ cost: 'invalid_number' }); return; }
    const input: AssetInput = {
      inventoryNumber: v.inventoryNumber, name: v.name, manufacturer: v.manufacturer, model: v.model, serialNumber: v.serialNumber,
      category: v.category as AssetInput['category'], status: v.status as AssetInput['status'],
      locationId: v.locationId || null, assigneeId: noHolder ? null : v.assigneeId || null,
      purchaseDate: v.purchaseDate, commissionedDate: v.commissionedDate, warrantyEndDate: v.warrantyEndDate,
      supplier: v.supplier, cost, description: v.description, notes: v.notes,
    };
    setBusy(true);
    try {
      const r = await mutate(() => (asset ? updateAsset(ctx(), asset.id, input) : createAsset(ctx(), input)));
      if (!r.ok) { setErrors(r.errors); if (r.errors._form) toast('error', t(`err.${r.errors._form}` as never)); return; }
      toast('success', asset ? t('assets.updated') : t('assets.created'));
      onSaved?.(r.value);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={asset ? t('assets.edit') : t('assets.add')} size="wide" onClose={onClose}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" type="submit" form="asset-form" disabled={busy} data-testid="asset-save">{t('common.save')}</Button>
      </>}
    >
      <form id="asset-form" class="form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t('field.inventoryNumber')} required value={v.inventoryNumber} onChange={(x) => set('inventoryNumber', x)} error={errors.inventoryNumber} name="inventoryNumber" />
        <TextField label={t('field.name')} required value={v.name} onChange={(x) => set('name', x)} error={errors.name} name="name" autoFocus />
        <TextField label={t('field.manufacturer')} value={v.manufacturer} onChange={(x) => set('manufacturer', x)} error={errors.manufacturer} name="manufacturer" />
        <TextField label={t('field.model')} value={v.model} onChange={(x) => set('model', x)} error={errors.model} name="model" />
        <TextField label={t('field.serialNumber')} value={v.serialNumber} onChange={(x) => set('serialNumber', x)} error={errors.serialNumber} name="serialNumber" />
        <SelectField label={t('field.category')} required value={v.category} onChange={(x) => set('category', x)} options={categoryOptions()} error={errors.category} name="category" />
        <SelectField label={t('field.status')} required value={v.status} onChange={(x) => set('status', x)} options={statusOptions()} error={errors.status} name="status" />
        <SelectField
          label={t('field.assignee')} value={noHolder ? '' : v.assigneeId} onChange={(x) => set('assigneeId', x)} error={errors.assigneeId} name="assigneeId"
          options={personOptions(people, { keepId: asset?.assigneeId })} emptyLabel={t('common.unassigned')}
          hint={noHolder ? t('assets.no_holder_for_status') : undefined} required={v.status === 'in_use'}
        />
        <SelectField label={t('field.location')} value={v.locationId} onChange={(x) => set('locationId', x)} options={locationOptions(locations)} emptyLabel={t('common.no_location')} error={errors.locationId} name="locationId" />
        <TextField label={t('field.supplier')} value={v.supplier} onChange={(x) => set('supplier', x)} error={errors.supplier} name="supplier" />
        <TextField label={t('field.purchaseDate')} type="date" value={v.purchaseDate} onChange={(x) => set('purchaseDate', x)} error={errors.purchaseDate} name="purchaseDate" />
        <TextField label={t('field.commissionedDate')} type="date" value={v.commissionedDate} onChange={(x) => set('commissionedDate', x)} error={errors.commissionedDate} name="commissionedDate" />
        <TextField label={t('field.warrantyEndDate')} type="date" value={v.warrantyEndDate} onChange={(x) => set('warrantyEndDate', x)} error={errors.warrantyEndDate} name="warrantyEndDate" />
        <TextField label={t('field.cost')} type="number" value={v.cost} onChange={(x) => set('cost', x)} error={errors.cost} name="cost" />
        <TextAreaField label={t('field.description')} span2 value={v.description} onChange={(x) => set('description', x)} error={errors.description} name="description" />
        <TextAreaField label={t('field.notes')} span2 value={v.notes} onChange={(x) => set('notes', x)} error={errors.notes} name="notes" />
      </form>
    </Modal>
  );
}
