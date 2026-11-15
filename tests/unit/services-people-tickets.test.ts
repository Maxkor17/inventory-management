import { describe, expect, it } from 'vitest';
import { assignAsset, createAsset } from '@/services/assets';
import { createLocation, deleteLocation, updateLocation } from '@/services/locations';
import { createPerson, deactivatePerson, offboardPerson, reactivatePerson, updatePerson } from '@/services/people';
import { loadSnapshot } from '@/services/queries';
import { createTicket, deleteTicket, transitionTicket, updateTicket } from '@/services/tickets';
import { assetInput, failingStore, locationInput, makeCtx, personInput, ticketInput } from '../helpers';

async function world() {
  const { ctx } = await makeCtx();
  const ids = async (p: Promise<{ ok: boolean }>): Promise<string> => {
    const r = (await p) as unknown as { ok: true; value: { id: string } };
    return r.value.id;
  };
  const olena = await ids(createPerson(ctx, personInput({ firstName: 'Olena', lastName: 'K', email: 'o@x.com' })));
  const andrii = await ids(createPerson(ctx, personInput({ firstName: 'Andrii', lastName: 'S', email: 'a@x.com' })));
  const laptop = await ids(createAsset(ctx, assetInput({ inventoryNumber: 'IT-1', serialNumber: 'L1', name: 'Laptop' })));
  const monitor = await ids(createAsset(ctx, assetInput({ inventoryNumber: 'IT-2', serialNumber: 'M1', name: 'Monitor', category: 'monitor' })));
  const phone = await ids(createAsset(ctx, assetInput({ inventoryNumber: 'IT-3', serialNumber: 'P1', name: 'Phone', category: 'mobile_device' })));
  await assignAsset(ctx, laptop, olena);
  await assignAsset(ctx, monitor, olena);
  await assignAsset(ctx, phone, andrii);
  return { ctx, olena, andrii, laptop, monitor, phone };
}

describe('people', () => {
  it('creates, edits (with logged changes) and validates', async () => {
    const { ctx } = await makeCtx();
    const bad = await createPerson(ctx, personInput({ firstName: '' }));
    expect(bad.ok).toBe(false);
    const c = await createPerson(ctx, personInput({ email: 'x@y.com' }));
    const id = c.ok ? c.value.id : '';
    const u = await updatePerson(ctx, id, personInput({ email: 'x@y.com', position: 'Admin', lastName: 'Kovalenko-Z' }));
    expect(u.ok).toBe(true);
    const ev = (await loadSnapshot(ctx)).activity.find((e) => e.type === 'person.updated')!;
    expect(ev.changes).toEqual(expect.arrayContaining([{ field: 'position', from: '', to: 'Admin' }, { field: 'lastName', from: 'Kovalenko', to: 'Kovalenko-Z' }]));
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    const { ctx } = await makeCtx();
    await createPerson(ctx, personInput({ email: 'a@x.com' }));
    const r = await createPerson(ctx, personInput({ firstName: 'B', email: 'A@X.com' }));
    expect(!r.ok && r.errors.email).toBe('duplicate_email');
  });

  it('cannot deactivate a person who still holds assets', async () => {
    const { ctx, olena } = await world();
    const r = await deactivatePerson(ctx, olena);
    expect(!r.ok && r.errors._form).toBe('has_assets');
    expect((await loadSnapshot(ctx)).people.find((p) => p.id === olena)!.status).toBe('active');
  });

  it('deactivates a person without assets and can reactivate; history is kept', async () => {
    const { ctx } = await makeCtx();
    const c = await createPerson(ctx, personInput());
    const id = c.ok ? c.value.id : '';
    const d = await deactivatePerson(ctx, id);
    expect(d.ok && d.value).toMatchObject({ status: 'inactive' });
    expect((d.ok && d.value.deactivatedAt) ?? null).not.toBe(null);
    const r = await reactivatePerson(ctx, id);
    expect(r.ok && r.value).toMatchObject({ status: 'active', deactivatedAt: null });
    const types = (await loadSnapshot(ctx)).activity.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['person.created', 'person.deactivated', 'person.reactivated']));
  });

  it('inactive people cannot receive assets', async () => {
    const { ctx } = await makeCtx();
    const p = await createPerson(ctx, personInput());
    const pid = p.ok ? p.value.id : '';
    await deactivatePerson(ctx, pid);
    const a = await createAsset(ctx, assetInput());
    const r = await assignAsset(ctx, a.ok ? a.value.id : '', pid);
    expect(!r.ok && r.errors.assigneeId).toBe('person_inactive');
  });
});

describe('offboardPerson', () => {
  it('transfers some assets, returns others to stock, deactivates, keeps full history', async () => {
    const { ctx, olena, andrii, laptop, monitor } = await world();
    const r = await offboardPerson(ctx, olena, { [laptop]: { kind: 'transfer', toPersonId: andrii }, [monitor]: { kind: 'stock' } });
    expect(r.ok && r.value).toEqual({ transferred: 1, toStock: 1 });
    const s = await loadSnapshot(ctx);
    expect(s.people.find((p) => p.id === olena)).toMatchObject({ status: 'inactive' });
    expect(s.assets.find((a) => a.id === laptop)).toMatchObject({ assigneeId: andrii, status: 'in_use' });
    expect(s.assets.find((a) => a.id === monitor)).toMatchObject({ assigneeId: null, status: 'in_stock' });
    // history preserved: Olena's rows still exist, closed with reason "offboarding"
    const hers = s.assignments.filter((a) => a.personId === olena);
    expect(hers).toHaveLength(2);
    expect(hers.every((a) => a.returnedAt !== null && a.endReason === 'offboarding')).toBe(true);
    expect(s.assignments.filter((a) => a.returnedAt === null && a.assetId === laptop)).toHaveLength(1);
    const types = s.activity.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['person.offboarded', 'person.deactivated']));
  });

  it('refuses when a held asset has no decision and changes nothing', async () => {
    const { ctx, olena, laptop } = await world();
    const before = await loadSnapshot(ctx);
    const r = await offboardPerson(ctx, olena, { [laptop]: { kind: 'stock' } });
    expect(r.ok).toBe(false);
    const after = await loadSnapshot(ctx);
    expect(after.people.find((p) => p.id === olena)!.status).toBe('active');
    expect(after.assignments).toEqual(before.assignments);
  });

  it('refuses transfers to inactive people or to the same person', async () => {
    const { ctx, olena, andrii, laptop, monitor } = await world();
    await offboardPerson(ctx, andrii, { [(await loadSnapshot(ctx)).assets.find((a) => a.assigneeId === andrii)!.id]: { kind: 'stock' } });
    const r = await offboardPerson(ctx, olena, { [laptop]: { kind: 'transfer', toPersonId: andrii }, [monitor]: { kind: 'transfer', toPersonId: olena } });
    expect(!r.ok && r.errors).toEqual({ [laptop]: 'invalid_target', [monitor]: 'invalid_target' });
  });

  it('a mid-way failure rolls the whole offboarding back', async () => {
    const { ctx, olena, laptop, monitor } = await world();
    const before = await loadSnapshot(ctx);
    const failing = { ...ctx, store: failingStore(ctx.store, 5) };
    await expect(offboardPerson(failing, olena, { [laptop]: { kind: 'stock' }, [monitor]: { kind: 'stock' } })).rejects.toThrow('injected_failure');
    const after = await loadSnapshot(ctx);
    expect(after.people.find((p) => p.id === olena)!.status).toBe('active');
    expect(after.assets).toEqual(before.assets);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.activity.length).toBe(before.activity.length);
  });

  it('keeps an in-repair asset "under repair" (without a holder) when the decision is "stock"', async () => {
    const { ctx, olena, laptop, monitor } = await world();
    const snap = await loadSnapshot(ctx);
    const a = snap.assets.find((x) => x.id === laptop)!;
    const { updateAsset } = await import('@/services/assets');
    await updateAsset(ctx, laptop, { ...a, status: 'under_repair' });
    const r = await offboardPerson(ctx, olena, { [laptop]: { kind: 'stock' }, [monitor]: { kind: 'stock' } });
    expect(r.ok).toBe(true);
    expect((await loadSnapshot(ctx)).assets.find((x) => x.id === laptop)).toMatchObject({ status: 'under_repair', assigneeId: null });
  });
});

describe('locations', () => {
  it('creates, renames (logged) and blocks deletion while in use', async () => {
    const { ctx } = await makeCtx();
    const c = await createLocation(ctx, locationInput({ name: 'HQ' }));
    const id = c.ok ? c.value.id : '';
    const dup = await createLocation(ctx, locationInput({ name: 'hq' }));
    expect(!dup.ok && dup.errors.name).toBe('duplicate_name');
    await updateLocation(ctx, id, locationInput({ name: 'Headquarters' }));
    expect((await loadSnapshot(ctx)).activity.find((e) => e.type === 'location.updated')!.changes).toEqual([{ field: 'name', from: 'HQ', to: 'Headquarters' }]);
    await createAsset(ctx, assetInput({ locationId: id }));
    const blocked = await deleteLocation(ctx, id);
    expect(!blocked.ok && blocked.errors._form).toBe('in_use');
    const free = await createLocation(ctx, locationInput({ name: 'Unused' }));
    expect((await deleteLocation(ctx, free.ok ? free.value.id : '')).ok).toBe(true);
  });
});

describe('tickets', () => {
  it('walks the lifecycle, records timestamps and enforces transitions', async () => {
    const { ctx, laptop } = await world();
    const t = await createTicket(ctx, ticketInput(laptop));
    const id = t.ok ? t.value.id : '';
    expect(t.ok && t.value.status).toBe('open');

    expect((await transitionTicket(ctx, id, 'resolved', { workDone: 'x' })).ok).toBe(false); // open -> resolved not allowed
    const ip = await transitionTicket(ctx, id, 'in_progress');
    expect(ip.ok && ip.value.status).toBe('in_progress');
    const noWork = await transitionTicket(ctx, id, 'resolved');
    expect(!noWork.ok && noWork.errors.workDone).toBe('required');
    const res = await transitionTicket(ctx, id, 'resolved', { workDone: 'Replaced RAM', cost: 55 });
    expect(res.ok && res.value).toMatchObject({ status: 'resolved', workDone: 'Replaced RAM', cost: 55 });
    expect((res.ok && res.value.resolvedAt) ?? null).not.toBe(null);
    const closed = await transitionTicket(ctx, id, 'closed');
    expect(closed.ok && closed.value.closedAt).not.toBe(null);
    expect((await transitionTicket(ctx, id, 'in_progress')).ok).toBe(false); // closed is terminal
    const types = (await loadSnapshot(ctx)).activity.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['ticket.created', 'ticket.status_changed', 'ticket.resolved']));
  });

  it('reopening a resolved ticket clears resolvedAt', async () => {
    const { ctx, laptop } = await world();
    const t = await createTicket(ctx, ticketInput(laptop));
    const id = t.ok ? t.value.id : '';
    await transitionTicket(ctx, id, 'in_progress');
    await transitionTicket(ctx, id, 'resolved', { workDone: 'ok' });
    const re = await transitionTicket(ctx, id, 'in_progress');
    expect(re.ok && re.value).toMatchObject({ status: 'in_progress', resolvedAt: null });
  });

  it('only changes the asset status when explicitly asked (under repair, then restored)', async () => {
    const { ctx, laptop } = await world();
    const t = await createTicket(ctx, ticketInput(laptop));
    const id = t.ok ? t.value.id : '';
    expect((await loadSnapshot(ctx)).assets.find((a) => a.id === laptop)!.status).toBe('in_use'); // untouched by creation
    await transitionTicket(ctx, id, 'in_progress', { setAssetUnderRepair: true });
    expect((await loadSnapshot(ctx)).assets.find((a) => a.id === laptop)).toMatchObject({ status: 'under_repair' });
    await transitionTicket(ctx, id, 'resolved', { workDone: 'fixed', restoreAssetStatus: 'in_use' });
    const a = (await loadSnapshot(ctx)).assets.find((x) => x.id === laptop)!;
    expect(a.status).toBe('in_use');
    expect(a.assigneeId).not.toBe(null); // holder never lost during repair
  });

  it('a rule violation while restoring the asset rolls back the ticket change too', async () => {
    const { ctx, phone } = await world();
    const t = await createTicket(ctx, ticketInput(phone));
    const id = t.ok ? t.value.id : '';
    await transitionTicket(ctx, id, 'in_progress');
    // in_stock is fine, but "retired -> restore" must be refused for retired assets; use a lost asset
    const snap = await loadSnapshot(ctx);
    const a = snap.assets.find((x) => x.id === phone)!;
    const { updateAsset } = await import('@/services/assets');
    await updateAsset(ctx, phone, { ...a, status: 'lost' });
    const r = await transitionTicket(ctx, id, 'resolved', { workDone: 'x', restoreAssetStatus: 'in_stock' });
    expect(r.ok).toBe(false);
    expect((await loadSnapshot(ctx)).tickets.find((x) => x.id === id)!.status).toBe('in_progress');
  });

  it('edits descriptive fields, keeps the asset fixed, and locks closed tickets', async () => {
    const { ctx, laptop, monitor, olena } = await world();
    const t = await createTicket(ctx, ticketInput(laptop));
    const id = t.ok ? t.value.id : '';
    const u = await updateTicket(ctx, id, ticketInput(monitor, { title: 'New title', priority: 'high', specialistId: olena }));
    expect(u.ok && u.value).toMatchObject({ title: 'New title', priority: 'high', assetId: laptop, specialistId: olena });
    await transitionTicket(ctx, id, 'closed');
    expect((await updateTicket(ctx, id, ticketInput(laptop))).ok).toBe(false);
  });

  it('deleting an asset removes its tickets; deleting a ticket is logged', async () => {
    const { ctx, laptop, monitor } = await world();
    const t1 = await createTicket(ctx, ticketInput(laptop));
    const t2 = await createTicket(ctx, ticketInput(monitor));
    expect((await deleteTicket(ctx, t2.ok ? t2.value.id : '')).ok).toBe(true);
    const { deleteAsset } = await import('@/services/assets');
    await deleteAsset(ctx, laptop);
    const s = await loadSnapshot(ctx);
    expect(s.tickets).toHaveLength(0);
    expect(s.activity.some((e) => e.type === 'ticket.deleted')).toBe(true);
    expect(t1.ok).toBe(true);
  });

  it('validates ticket input and cost', async () => {
    const { ctx, laptop } = await world();
    expect((await createTicket(ctx, ticketInput(laptop, { title: '' }))).ok).toBe(false);
    expect((await createTicket(ctx, ticketInput('ghost'))).ok).toBe(false);
    const t = await createTicket(ctx, ticketInput(laptop));
    const bad = await transitionTicket(ctx, t.ok ? t.value.id : '', 'in_progress', { cost: -3 });
    expect(!bad.ok && bad.errors.cost).toBe('invalid_number');
  });
});
