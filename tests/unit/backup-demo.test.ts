import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo-data';
import { isActivityEvent, isAsset, isAssignment, isLocation, isPerson, isTicket } from '@/domain/guards';
import { buildBackup, parseBackup, restoreBackup, serializeBackup } from '@/services/backup-restore';
import { assignAsset, createAsset } from '@/services/assets';
import { loadDemoData, removeDemoData } from '@/services/demo';
import { createLocation } from '@/services/locations';
import { createPerson } from '@/services/people';
import { loadSnapshot } from '@/services/queries';
import { createTicket } from '@/services/tickets';
import { assetInput, failingStore, locationInput, makeCtx, personInput, ticketInput } from '../helpers';

const TODAY = '2026-11-15';

async function realData() {
  const { ctx } = await makeCtx();
  const loc = await createLocation(ctx, locationInput({ name: 'Real HQ' }));
  const per = await createPerson(ctx, personInput({ email: 'real@x.com' }));
  const a = await createAsset(ctx, assetInput({ locationId: loc.ok ? loc.value.id : null }));
  await assignAsset(ctx, a.ok ? a.value.id : '', per.ok ? per.value.id : '');
  await createTicket(ctx, ticketInput(a.ok ? a.value.id : ''));
  return { ctx, loc: loc.ok ? loc.value.id : '', per: per.ok ? per.value.id : '', asset: a.ok ? a.value.id : '' };
}

describe('backup / restore', () => {
  it('round-trips everything through JSON', async () => {
    const { ctx } = await realData();
    const text = serializeBackup(await buildBackup(ctx));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);

    const other = await makeCtx();
    const r = await restoreBackup(other.ctx, text);
    expect(r.ok).toBe(true);
    const a = await loadSnapshot(ctx);
    const b = await loadSnapshot(other.ctx);
    for (const k of ['assets', 'people', 'locations', 'assignments', 'tickets'] as const) {
      expect(b[k]).toEqual(a[k]);
    }
    expect(b.activity.length).toBe(a.activity.length + 1); // + data.restored
  });

  it('restore REPLACES existing data (and never leaves a mix)', async () => {
    const { ctx } = await realData();
    const text = serializeBackup(await buildBackup(ctx));
    const target = await makeCtx();
    await createAsset(target.ctx, assetInput({ inventoryNumber: 'OLD-1', serialNumber: 'OLD' }));
    await restoreBackup(target.ctx, text);
    const s = await loadSnapshot(target.ctx);
    expect(s.assets.some((x) => x.inventoryNumber === 'OLD-1')).toBe(false);
    expect(s.assets).toHaveLength(1);
  });

  it('rejects bad input without touching existing data', async () => {
    const { ctx } = await realData();
    const good = await buildBackup(ctx);
    const before = await loadSnapshot(ctx);
    const mutate = (fn: (b: ReturnType<typeof structuredClone<typeof good>>) => void) => {
      const c = structuredClone(good);
      fn(c);
      return JSON.stringify(c);
    };
    const cases: [string, string, string][] = [
      ['not json', '{nope', 'invalid_json'],
      ['wrong schema', JSON.stringify({ schema: 'x', version: 3, data: {} }), 'invalid_schema'],
      ['old version', mutate((b) => { (b as { version: number }).version = 2; }), 'unsupported_version'],
      ['newer version', mutate((b) => { (b as { version: number }).version = 4; }), 'unsupported_version'],
      ['missing collection', mutate((b) => { delete (b.data as Record<string, unknown>).tickets; }), 'invalid_schema'],
      ['bad enum', mutate((b) => { (b.data.assets[0] as { status: string }).status = 'weird'; }), 'invalid_records'],
      ['bad date', mutate((b) => { b.data.assets[0]!.purchaseDate = '2025-02-31'; }), 'invalid_records'],
      ['duplicate id', mutate((b) => { b.data.assets.push({ ...b.data.assets[0]!, inventoryNumber: 'X', serialNumber: 'Y' }); }), 'invalid_records'],
      ['duplicate inventory number', mutate((b) => { b.data.assets.push({ ...b.data.assets[0]!, id: 'zz', serialNumber: 'Y2' }); }), 'invalid_records'],
      ['dangling asset location', mutate((b) => { b.data.assets[0]!.locationId = 'ghost'; }), 'broken_references'],
      ['dangling ticket asset', mutate((b) => { b.data.tickets[0]!.assetId = 'ghost'; }), 'broken_references'],
      ['dangling assignment person', mutate((b) => { b.data.assignments[0]!.personId = 'ghost'; }), 'broken_references'],
      ['holder without assignment', mutate((b) => { b.data.assignments[0]!.returnedAt = '2026-01-01T00:00:00.000Z'; }), 'invalid_records'],
    ];
    for (const [name, text, code] of cases) {
      const r = await restoreBackup(ctx, text);
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.errors._form, name).toBe(code);
    }
    const after = await loadSnapshot(ctx);
    for (const k of ['assets', 'people', 'locations', 'assignments', 'tickets', 'activity'] as const) expect(after[k]).toEqual(before[k]);
  });

  it('a failure while writing the restore rolls back to the previous data', async () => {
    const { ctx } = await realData();
    const text = serializeBackup(await buildBackup(ctx));
    const target = await makeCtx();
    await createAsset(target.ctx, assetInput({ inventoryNumber: 'KEEP', serialNumber: 'KEEP' }));
    const before = await loadSnapshot(target.ctx);
    const failing = { ...target.ctx, store: failingStore(target.ctx.store, 4) };
    await expect(restoreBackup(failing, text)).rejects.toThrow('injected_failure');
    const after = await loadSnapshot(target.ctx);
    expect(after.assets).toEqual(before.assets);
    expect(after.activity).toEqual(before.activity);
  });
});

describe('demo data', () => {
  it('generates internally consistent, valid, clearly-marked records', () => {
    let n = 0;
    const d = buildDemoData({ id: () => `d-${++n}`, now: () => '2026-01-01T00:00:00.000Z', today: TODAY });
    expect(d.assets.length).toBeGreaterThan(20);
    expect(d.assets.every((x) => x.isDemo && isAsset(x))).toBe(true);
    expect(d.people.every((x) => x.isDemo && isPerson(x))).toBe(true);
    expect(d.locations.every((x) => x.isDemo && isLocation(x))).toBe(true);
    expect(d.assignments.every((x) => x.isDemo && isAssignment(x))).toBe(true);
    expect(d.tickets.every((x) => x.isDemo && isTicket(x))).toBe(true);
    expect(d.activity.every(isActivityEvent)).toBe(true);
    expect(d.assets.every((x) => x.inventoryNumber.startsWith('DEMO-'))).toBe(true);
    // the whole dataset must pass the same integrity checks as a user backup
    const file = JSON.stringify({ schema: 'itam-backup', version: 3, exportedAt: 'x', data: d });
    const parsed = parseBackup(file);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    // warranty variety so the dashboard has something real to show
    const kinds = new Set(d.assets.map((a) => (a.warrantyEndDate === '' ? 'none' : a.warrantyEndDate < TODAY ? 'expired' : 'ok')));
    expect(kinds).toEqual(new Set(['none', 'expired', 'ok']));
  });

  it('loads into an empty database and refuses to load twice', async () => {
    const { ctx } = await makeCtx();
    const r = await loadDemoData(ctx, TODAY);
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets.every((a) => a.isDemo)).toBe(true);
    expect(s.activity.some((e) => e.type === 'data.demo_loaded')).toBe(true);
    const again = await loadDemoData(ctx, TODAY);
    expect(!again.ok && again.errors._form).toBe('demo_exists');
  });

  it('removes only demo rows and leaves real data completely untouched', async () => {
    const { ctx, asset, per, loc } = await realData();
    await loadDemoData(ctx, TODAY);
    const realBefore = (await loadSnapshot(ctx)).assets.find((a) => a.id === asset);
    const r = await removeDemoData(ctx);
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets.map((a) => a.id)).toEqual([asset]);
    expect(s.assets[0]).toEqual(realBefore);
    expect(s.people.map((p) => p.id)).toEqual([per]);
    expect(s.locations.map((l) => l.id)).toEqual([loc]);
    expect(s.tickets).toHaveLength(1);
    expect(s.assignments).toHaveLength(1);
    expect(s.activity.some((e) => e.type === 'data.demo_removed')).toBe(true);
    // no demo-related activity is left behind
    expect(s.activity.every((e) => !String(e.entityLabel).startsWith('DEMO-'))).toBe(true);
  });

  it('refuses to remove demo data while real records still reference it', async () => {
    const { ctx, asset } = await realData();
    await loadDemoData(ctx, TODAY);
    const snap = await loadSnapshot(ctx);
    const demoPerson = snap.people.find((p) => p.isDemo && p.status === 'active')!;
    await assignAsset(ctx, asset, demoPerson.id); // a REAL asset now held by a DEMO person
    const before = await loadSnapshot(ctx);
    const r = await removeDemoData(ctx);
    expect(!r.ok && r.errors._form).toBe('demo_in_use');
    const after = await loadSnapshot(ctx);
    expect(after.assets).toEqual(before.assets);
    expect(after.people).toEqual(before.people);
  });

  it('removal with nothing to remove is reported, not silent', async () => {
    const { ctx } = await makeCtx();
    const r = await removeDemoData(ctx);
    expect(!r.ok && r.errors._form).toBe('no_demo');
  });

  it('demo data never enters a database that was not asked to load it (loading is explicit)', async () => {
    const { ctx } = await makeCtx();
    expect((await loadSnapshot(ctx)).assets).toHaveLength(0);
  });
});
