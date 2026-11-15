import { describe, expect, it } from 'vitest';
import { assignAsset, bulkUpdateAssets, createAsset, deleteAsset, returnAssetToStock, updateAsset } from '@/services/assets';
import { createLocation } from '@/services/locations';
import { createPerson } from '@/services/people';
import { loadSnapshot } from '@/services/queries';
import { assetInput, failingStore, locationInput, makeCtx, personInput } from '../helpers';

async function setup() {
  const { ctx, store } = await makeCtx();
  const p1 = (await createPerson(ctx, personInput({ firstName: 'Olena', lastName: 'K', email: 'o@x.com' }))) as { ok: true; value: { id: string } };
  const p2 = (await createPerson(ctx, personInput({ firstName: 'Andrii', lastName: 'S', email: 'a@x.com' }))) as { ok: true; value: { id: string } };
  const loc = (await createLocation(ctx, locationInput({ name: 'HQ' }))) as { ok: true; value: { id: string } };
  return { ctx, store, p1: p1.value.id, p2: p2.value.id, loc: loc.value.id };
}

describe('createAsset', () => {
  it('creates an in-stock asset and logs asset.created', async () => {
    const { ctx } = await setup();
    const r = await createAsset(ctx, assetInput());
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets).toHaveLength(1);
    expect(s.assignments).toHaveLength(0);
    expect(s.activity.some((e) => e.type === 'asset.created' && e.entityLabel === 'IT-000001 · Laptop')).toBe(true);
  });

  it('creating an in-use asset opens an active assignment', async () => {
    const { ctx, p1 } = await setup();
    const r = await createAsset(ctx, assetInput({ status: 'in_use', assigneeId: p1 }));
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]).toMatchObject({ personId: p1, returnedAt: null, endReason: null });
    expect(s.assets[0]!.assigneeId).toBe(p1);
  });

  it('rejects invalid input without writing anything', async () => {
    const { ctx } = await setup();
    const before = await loadSnapshot(ctx);
    const r = await createAsset(ctx, assetInput({ name: '' }));
    expect(r.ok).toBe(false);
    const after = await loadSnapshot(ctx);
    expect(after.assets).toHaveLength(0);
    expect(after.activity.length).toBe(before.activity.length);
  });

  it('enforces unique inventory numbers and serials', async () => {
    const { ctx } = await setup();
    await createAsset(ctx, assetInput());
    const dupInv = await createAsset(ctx, assetInput({ serialNumber: 'other' }));
    expect(!dupInv.ok && dupInv.errors.inventoryNumber).toBe('duplicate_inventory_number');
    const dupSerial = await createAsset(ctx, assetInput({ inventoryNumber: 'IT-000002', serialNumber: ' sn-1 ' }));
    expect(!dupSerial.ok && dupSerial.errors.serialNumber).toBe('duplicate_serial');
  });

  it('in_use without holder and retired with holder are rejected', async () => {
    const { ctx, p1 } = await setup();
    const a = await createAsset(ctx, assetInput({ status: 'in_use' }));
    expect(!a.ok && a.errors.assigneeId).toBe('in_use_requires_assignee');
    const b = await createAsset(ctx, assetInput({ inventoryNumber: 'IT-2', serialNumber: 'x', status: 'retired', assigneeId: p1 }));
    expect(!b.ok && b.errors.assigneeId).toBe('status_conflicts_with_assignee');
  });
});

describe('updateAsset', () => {
  it('logs one event per kind of change with before/after values', async () => {
    const { ctx, loc } = await setup();
    const c = await createAsset(ctx, assetInput());
    const id = c.ok ? c.value.id : '';
    const r = await updateAsset(ctx, id, assetInput({ name: 'Laptop X', status: 'under_repair', locationId: loc, cost: 100 }));
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    const updated = s.activity.find((e) => e.type === 'asset.updated')!;
    expect(updated.changes).toEqual(expect.arrayContaining([
      { field: 'name', from: 'Laptop', to: 'Laptop X' }, { field: 'cost', from: null, to: 100 },
    ]));
    expect(s.activity.find((e) => e.type === 'asset.status_changed')!.changes).toEqual([{ field: 'status', from: 'in_stock', to: 'under_repair' }]);
    expect(s.activity.find((e) => e.type === 'asset.location_changed')!.params).toEqual({ from: null, to: 'HQ' });
  });

  it('a no-op update writes nothing', async () => {
    const { ctx } = await setup();
    const c = await createAsset(ctx, assetInput());
    const id = c.ok ? c.value.id : '';
    const before = (await loadSnapshot(ctx)).activity.length;
    const r = await updateAsset(ctx, id, assetInput());
    expect(r.ok).toBe(true);
    expect((await loadSnapshot(ctx)).activity.length).toBe(before);
  });

  it('changing the holder via update transfers the assignment', async () => {
    const { ctx, p1, p2 } = await setup();
    const c = await createAsset(ctx, assetInput({ status: 'in_use', assigneeId: p1 }));
    const id = c.ok ? c.value.id : '';
    const r = await updateAsset(ctx, id, assetInput({ status: 'in_use', assigneeId: p2 }));
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    const active = s.assignments.filter((a) => a.returnedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]!.personId).toBe(p2);
    expect(s.assignments.find((a) => a.personId === p1)).toMatchObject({ endReason: 'transferred' });
    expect(s.activity.find((e) => e.type === 'asset.assignee_changed')!.params).toMatchObject({ from: 'Olena K', to: 'Andrii S', reason: 'transferred' });
  });

  it('setting status to retired closes the assignment (asset_retired) and clears the holder', async () => {
    const { ctx, p1 } = await setup();
    const c = await createAsset(ctx, assetInput({ status: 'in_use', assigneeId: p1 }));
    const id = c.ok ? c.value.id : '';
    const r = await updateAsset(ctx, id, assetInput({ status: 'retired', assigneeId: p1 }));
    expect(r.ok && r.value.assigneeId).toBe(null);
    const s = await loadSnapshot(ctx);
    expect(s.assignments[0]).toMatchObject({ endReason: 'asset_retired' });
    expect(s.assignments[0]!.returnedAt).not.toBe(null);
  });

  it('unknown id -> not_found', async () => {
    const { ctx } = await setup();
    const r = await updateAsset(ctx, 'missing', assetInput());
    expect(!r.ok && r.errors._form).toBe('not_found');
  });
});

describe('assign / return', () => {
  it('assigning an in-stock asset makes it in_use; the ledger keeps exactly one active row', async () => {
    const { ctx, p1, p2 } = await setup();
    const c = await createAsset(ctx, assetInput());
    const id = c.ok ? c.value.id : '';
    const r1 = await assignAsset(ctx, id, p1, 'first');
    expect(r1.ok && r1.value).toMatchObject({ status: 'in_use', assigneeId: p1 });
    const r2 = await assignAsset(ctx, id, p2);
    expect(r2.ok && r2.value.assigneeId).toBe(p2);
    const s = await loadSnapshot(ctx);
    expect(s.assignments).toHaveLength(2);
    expect(s.assignments.filter((a) => a.returnedAt === null)).toHaveLength(1);
    expect(s.assignments.find((a) => a.personId === p1)!.note).toBe('first');
  });

  it('re-assigning to the same holder is a no-op', async () => {
    const { ctx, p1 } = await setup();
    const c = await createAsset(ctx, assetInput());
    const id = c.ok ? c.value.id : '';
    await assignAsset(ctx, id, p1);
    const n = (await loadSnapshot(ctx)).activity.length;
    await assignAsset(ctx, id, p1);
    expect((await loadSnapshot(ctx)).activity.length).toBe(n);
  });

  it('cannot assign retired/lost assets or to unknown/inactive people', async () => {
    const { ctx, p1 } = await setup();
    const c = await createAsset(ctx, assetInput({ status: 'retired' }));
    const id = c.ok ? c.value.id : '';
    const r = await assignAsset(ctx, id, p1);
    expect(!r.ok && r.errors._form).toBe('asset_not_assignable');
    const c2 = await createAsset(ctx, assetInput({ inventoryNumber: 'IT-2', serialNumber: 's2' }));
    const r2 = await assignAsset(ctx, c2.ok ? c2.value.id : '', 'ghost');
    expect(!r2.ok && r2.errors.assigneeId).toBe('unknown_person');
  });

  it('return to stock closes the assignment with returned_to_stock', async () => {
    const { ctx, p1 } = await setup();
    const c = await createAsset(ctx, assetInput());
    const id = c.ok ? c.value.id : '';
    await assignAsset(ctx, id, p1);
    const r = await returnAssetToStock(ctx, id, 'back');
    expect(r.ok && r.value).toMatchObject({ status: 'in_stock', assigneeId: null });
    const s = await loadSnapshot(ctx);
    expect(s.assignments[0]).toMatchObject({ endReason: 'returned_to_stock' });
    expect(s.assignments[0]!.returnedAt).not.toBe(null);
  });
});

describe('deleteAsset', () => {
  it('removes the asset, its assignments and tickets but keeps activity with a label snapshot', async () => {
    const { ctx, p1 } = await setup();
    const c = await createAsset(ctx, assetInput({ status: 'in_use', assigneeId: p1 }));
    const id = c.ok ? c.value.id : '';
    const r = await deleteAsset(ctx, id);
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets).toHaveLength(0);
    expect(s.assignments).toHaveLength(0);
    expect(s.activity.find((e) => e.type === 'asset.deleted')).toMatchObject({ entityLabel: 'IT-000001 · Laptop' });
    expect(s.activity.some((e) => e.type === 'asset.created' && e.entityId === id)).toBe(true);
  });
});

describe('bulkUpdateAssets', () => {
  it('applies one change to many assets atomically', async () => {
    const { ctx, loc } = await setup();
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = await createAsset(ctx, assetInput({ inventoryNumber: `IT-${i}`, serialNumber: `S${i}` }));
      if (r.ok) ids.push(r.value.id);
    }
    const r = await bulkUpdateAssets(ctx, ids, { locationId: loc });
    expect(r.ok && r.value.changed).toBe(3);
    expect((await loadSnapshot(ctx)).assets.every((a) => a.locationId === loc)).toBe(true);
  });

  it('rolls back everything if any asset violates a rule', async () => {
    const { ctx } = await setup();
    const ids: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const r = await createAsset(ctx, assetInput({ inventoryNumber: `IT-${i}`, serialNumber: `S${i}` }));
      if (r.ok) ids.push(r.value.id);
    }
    const before = await loadSnapshot(ctx);
    // in_use needs a holder -> every asset fails -> nothing may change
    const r = await bulkUpdateAssets(ctx, ids, { status: 'in_use' });
    expect(r.ok).toBe(false);
    const after = await loadSnapshot(ctx);
    expect(after.assets.map((a) => a.status)).toEqual(before.assets.map((a) => a.status));
    expect(after.activity.length).toBe(before.activity.length);
  });
});

describe('atomicity', () => {
  it('a failure in the middle of createAsset (2nd write) leaves no partial data', async () => {
    const { ctx, p1 } = await setup();
    const before = await loadSnapshot(ctx);
    // write #1 (asset) succeeds, write #2 (assignment) throws -> whole transaction must roll back
    const failing = { ...ctx, store: failingStore(ctx.store, 2) };
    await expect(createAsset(failing, assetInput({ status: 'in_use', assigneeId: p1 }))).rejects.toThrow('injected_failure');
    const after = await loadSnapshot(ctx);
    expect(after.assets).toHaveLength(0);
    expect(after.assignments).toHaveLength(0);
    expect(after.activity.length).toBe(before.activity.length);
  });

  it('a failure while writing the audit event also rolls back the asset', async () => {
    const { ctx } = await setup();
    const before = await loadSnapshot(ctx);
    const failing = { ...ctx, store: failingStore(ctx.store, 2) }; // asset ok, activity put fails
    await expect(createAsset(failing, assetInput())).rejects.toThrow('injected_failure');
    expect((await loadSnapshot(ctx)).assets).toHaveLength(before.assets.length);
  });
});
