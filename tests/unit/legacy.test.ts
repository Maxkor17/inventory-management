import { describe, expect, it } from 'vitest';
import {
  LegacyParseError, formatInventoryNumber, nextInventoryNumberStart, normalizeLegacyRecord, parseLegacyJson,
  planLegacyMigration, splitName,
} from '@/domain/legacy-mapping';
import type { LegacyDevice } from '@/domain/legacy-mapping';
import { detectLegacySource, getLegacyBackup, getLegacyMigrationRecord, previewLegacy, runLegacyMigration, skipLegacyMigration } from '@/services/legacy-migration';
import type { LegacySource } from '@/services/legacy-migration';
import { createAsset } from '@/services/assets';
import { createLocation } from '@/services/locations';
import { createPerson } from '@/services/people';
import { loadSnapshot } from '@/services/queries';
import { assetInput, countingStore, droppingStore, failingStore, locationInput, makeCtx, personInput } from '../helpers';

const V2_RAW = JSON.stringify([
  { id: 'old-1', name: 'Laptop', model: 'T14', serial: 'SN-A', owner: 'Olena Kovalenko', category: 'Laptop', status: 'In Use', location: 'Office 2', purchaseDate: '2024-01-10', warrantyDate: '2027-01-10' },
  { id: 'old-2', name: 'Switch', model: 'C2960', serial: 'SN-B', owner: '', category: 'Network Equipment', status: 'In Stock', location: 'office   2', purchaseDate: '', warrantyDate: '' },
  { id: 'old-3', name: 'Monitor', model: 'LG', serial: 'SN-C', owner: ' olena  kovalenko ', category: 'Monitor', status: 'Retired', location: '', purchaseDate: '', warrantyDate: '' },
  { id: 'old-4', name: 'Phone', model: 'Pixel', serial: 'SN-D', owner: 'Ivan', category: 'Mobile Device', status: 'In Stock', location: '', purchaseDate: '', warrantyDate: '' },
  { id: 'old-5', name: 'Printer', model: 'HP', serial: 'SN-E', owner: '', category: 'Printer', status: 'In Use', location: '', purchaseDate: '', warrantyDate: '' },
]);

const sourceOf = (key: 'v2' | 'v1' | 'file', raw: string): LegacySource => ({ key, raw, backups: key === 'file' ? {} : { [key]: raw } });

describe('parseLegacyJson', () => {
  it('reads the raw LocalStorage array', () => {
    const r = parseLegacyJson(V2_RAW);
    expect(r.devices).toHaveLength(5);
    expect(r.invalid).toEqual([]);
  });
  it('reads v1.0 records with only the old fields and applies the old defaults', () => {
    const r = parseLegacyJson('[{"name":"PC","model":"M","serial":"S1","owner":"Max"},{"name":"X","model":"M","serial":"S2"}]');
    expect(r.devices[0]).toMatchObject({ category: 'other', status: 'in_use', owner: 'Max' });
    expect(r.devices[1]).toMatchObject({ category: 'other', status: 'in_stock', owner: '' });
  });
  it('reads exported files (version 1 and 2) and bare arrays', () => {
    const one = '{"version":1,"exportedAt":"x","devices":[{"name":"A","model":"M","serial":"S"}]}';
    const two = '{"version":2,"exportedAt":"x","devices":[{"name":"A","model":"M","serial":"S","category":"printer","status":"retired"}]}';
    expect(parseLegacyJson(one).sourceVersion).toBe(1);
    expect(parseLegacyJson(two).devices[0]).toMatchObject({ category: 'printer', status: 'retired' });
  });
  it('rejects invalid JSON, bad structure and newer versions', () => {
    expect(() => parseLegacyJson('{nope')).toThrow(LegacyParseError);
    expect(() => parseLegacyJson('{"foo":1}')).toThrow(LegacyParseError);
    expect(() => parseLegacyJson('{"version":3,"devices":[]}')).toThrow(/newer_version/);
  });
  it('reports invalid records and duplicate serials instead of dropping them silently', () => {
    const r = parseLegacyJson(JSON.stringify([
      { name: 'ok', model: 'm', serial: 'S1' }, { name: '', model: 'm', serial: 'S2' }, { name: 'dup', model: 'm', serial: ' s1 ' },
      { name: 'cat', model: 'm', serial: 'S3', category: 'Toaster' }, { name: 'd', model: 'm', serial: 'S4', purchaseDate: '2025-02-31' }, 5,
    ]));
    expect(r.devices).toHaveLength(1);
    expect(r.invalid.map((x) => x.index)).toEqual([1, 3, 4, 5]);
    expect(r.duplicateSerials).toEqual(['s1']);
  });
  it('normalizeLegacyRecord accepts code-style enum values', () => {
    expect(normalizeLegacyRecord({ name: 'a', model: 'b', serial: 'c', category: 'network_equipment', status: 'under_repair' })).toMatchObject({ category: 'network_equipment', status: 'under_repair' });
  });
});

describe('name and inventory helpers', () => {
  it('splits names', () => {
    expect(splitName('Olena Kovalenko')).toEqual({ firstName: 'Olena', lastName: 'Kovalenko', ambiguous: false });
    expect(splitName('Ivan')).toEqual({ firstName: 'Ivan', lastName: '', ambiguous: true });
    expect(splitName('Maria  de la Cruz')).toMatchObject({ firstName: 'Maria', lastName: 'de la Cruz' });
  });
  it('continues inventory numbering after existing IT- numbers', () => {
    expect(nextInventoryNumberStart([])).toBe(1);
    expect(nextInventoryNumberStart([{ inventoryNumber: 'IT-000041' }, { inventoryNumber: 'DEMO-0099' }])).toBe(42);
    expect(formatInventoryNumber(7)).toBe('IT-000007');
  });
});

describe('planLegacyMigration', () => {
  const deps = () => { let n = 0; return { id: () => `n-${++n}`, now: () => '2026-01-01T00:00:00.000Z' }; };
  const devices = parseLegacyJson(V2_RAW).devices;

  it('creates assets, deduplicated people and locations, and per-asset import events', () => {
    const p = planLegacyMigration(devices, { assets: [], people: [], locations: [] }, deps());
    expect(p.assets.map((a) => a.id)).toEqual(['old-1', 'old-2', 'old-3', 'old-4', 'old-5']); // legacy ids kept
    expect(p.assets.map((a) => a.inventoryNumber)).toEqual(['IT-000001', 'IT-000002', 'IT-000003', 'IT-000004', 'IT-000005']);
    expect(p.people.map((x) => `${x.firstName}|${x.lastName}`)).toEqual(['Olena|Kovalenko', 'Ivan|']); // case/space-insensitive dedupe
    expect(p.locations.map((l) => l.name)).toEqual(['Office 2']); // "office   2" merged
    expect(p.activity).toHaveLength(5);
    expect(p.activity.every((e) => e.type === 'asset.imported')).toBe(true);
  });

  it('maps status + owner to assignments that respect the v2 rules', () => {
    const p = planLegacyMigration(devices, { assets: [], people: [], locations: [] }, deps());
    const by = (serial: string) => p.assets.find((a) => a.serialNumber === serial)!;
    // in use + owner -> active assignment
    expect(by('SN-A').assigneeId).not.toBe(null);
    expect(p.assignments.find((a) => a.assetId === 'old-1')).toMatchObject({ returnedAt: null, endReason: null });
    // retired + owner -> closed assignment (history kept), no holder
    expect(by('SN-C').assigneeId).toBe(null);
    expect(p.assignments.find((a) => a.assetId === 'old-3')).toMatchObject({ endReason: 'asset_retired' });
    // in stock + owner -> closed assignment, legacy owner preserved in notes
    expect(by('SN-D').assigneeId).toBe(null);
    expect(by('SN-D').notes).toContain('Ivan');
    expect(p.assignments.find((a) => a.assetId === 'old-4')).toMatchObject({ endReason: 'returned_to_stock' });
    // in use without owner is kept but reported
    expect(by('SN-E').status).toBe('in_use');
    expect(p.report.inconsistent).toEqual(expect.arrayContaining([{ serial: 'SN-E', issue: 'in_use_without_owner' }, { serial: 'SN-D', issue: 'in_stock_had_owner' }]));
    expect(p.report.ambiguousNames).toEqual(['Ivan']);
  });

  it('merges into existing data: matches people/locations, skips existing serials, continues numbering', () => {
    const existingPerson = { id: 'ep', firstName: 'Olena', lastName: 'Kovalenko' } as never;
    const existingLoc = { id: 'el', name: 'OFFICE 2' } as never;
    const existingAsset = { id: 'ea', inventoryNumber: 'IT-000010', serialNumber: 'sn-a' } as never;
    const p = planLegacyMigration(devices, { assets: [existingAsset], people: [existingPerson], locations: [existingLoc] }, deps());
    expect(p.report.skippedExistingSerial).toEqual(['SN-A']);
    expect(p.assets[0]!.inventoryNumber).toBe('IT-000011');
    expect(p.people.map((x) => x.firstName)).toEqual(['Ivan']);
    expect(p.locations).toHaveLength(0);
    expect(p.report.peopleMatched).toBe(1);
    expect(p.report.locationsMatched).toBe(1);
    expect(p.assets.find((a) => a.serialNumber === 'SN-B')!.locationId).toBe('el');
  });

  it('generates a fresh id when a legacy id collides with an existing asset', () => {
    const d: LegacyDevice[] = [{ id: 'ea', name: 'x', model: 'm', serial: 'NEW', category: 'other', status: 'in_stock', owner: '', location: '', purchaseDate: '', warrantyDate: '' }];
    const p = planLegacyMigration(d, { assets: [{ id: 'ea', inventoryNumber: 'IT-000001', serialNumber: 'old' } as never], people: [], locations: [] }, deps());
    expect(p.assets[0]!.id).not.toBe('ea');
  });
});

describe('detectLegacySource (read-only)', () => {
  const storage = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });
  it('prefers v1.1 (v2 key) over v1.0 and records both raw values', () => {
    const s = detectLegacySource(storage({ 'inventoryManagement.devices.v2': 'A', 'inventoryManagement.devices.v1': 'B' }))!;
    expect(s.key).toBe('v2');
    expect(s.backups).toEqual({ v2: 'A', v1: 'B' });
  });
  it('falls back to v1.0 and returns null when nothing is stored or storage throws', () => {
    expect(detectLegacySource(storage({ 'inventoryManagement.devices.v1': '[]' }))!.key).toBe('v1');
    expect(detectLegacySource(storage({}))).toBeNull();
    expect(detectLegacySource({ getItem: () => { throw new Error('blocked'); } })).toBeNull();
  });
  it('the storage interface exposes no write methods at all', () => {
    const s = storage({ 'inventoryManagement.devices.v2': 'A' }) as Record<string, unknown>;
    expect(Object.keys(s)).toEqual(['getItem']);
  });
});

describe('runLegacyMigration', () => {
  it('migrates in one transaction, stores the raw backup and records completion', async () => {
    const { ctx } = await makeCtx();
    const r = await runLegacyMigration(ctx, sourceOf('v2', V2_RAW));
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets).toHaveLength(5);
    expect(s.people).toHaveLength(2);
    expect(s.locations).toHaveLength(1);
    expect(s.activity.some((e) => e.type === 'data.migrated')).toBe(true);
    expect(await getLegacyBackup(ctx)).toMatchObject({ sourceKey: 'v2', raw: { v2: V2_RAW } });
    expect(await getLegacyMigrationRecord(ctx)).toMatchObject({ status: 'done', sourceKey: 'v2', counts: { assets: 5, people: 2, locations: 1 } });
  });

  it('preserves every legacy serial, name, model and (via assignments) owner', async () => {
    const { ctx } = await makeCtx();
    await runLegacyMigration(ctx, sourceOf('v2', V2_RAW));
    const s = await loadSnapshot(ctx);
    const legacy = JSON.parse(V2_RAW) as { serial: string; name: string; model: string; owner: string }[];
    for (const d of legacy) {
      const a = s.assets.find((x) => x.serialNumber === d.serial)!;
      expect(a.name).toBe(d.name);
      expect(a.model).toBe(d.model);
      if (d.owner.trim()) {
        const as = s.assignments.find((x) => x.assetId === a.id)!;
        const p = s.people.find((x) => x.id === as.personId)!;
        expect(`${p.firstName} ${p.lastName}`.trim().toLowerCase()).toBe(d.owner.trim().replace(/\s+/g, ' ').toLowerCase());
      }
    }
  });

  it('is atomic: a failure at ANY single write leaves the database completely empty', async () => {
    // Learn how many writes a successful run performs, then fail each one in turn.
    const probe = await makeCtx();
    const counter = countingStore(probe.store);
    expect((await runLegacyMigration({ ...probe.ctx, store: counter.store }, sourceOf('v2', V2_RAW))).ok).toBe(true);
    const total = counter.puts();
    expect(total).toBeGreaterThanOrEqual(15); // 5 assets + 2 people + 1 location + 3 assignments + 5 events + summary

    for (let failAt = 1; failAt <= total; failAt++) {
      const { ctx } = await makeCtx();
      const failing = { ...ctx, store: failingStore(ctx.store, failAt) };
      await expect(runLegacyMigration(failing, sourceOf('v2', V2_RAW)), `failAt=${failAt}`).rejects.toThrow('injected_failure');
      const s = await loadSnapshot(ctx);
      expect([s.assets.length, s.people.length, s.locations.length, s.assignments.length, s.activity.length], `failAt=${failAt}`).toEqual([0, 0, 0, 0, 0]);
      expect(await getLegacyMigrationRecord(ctx)).toBeUndefined();
      expect(await getLegacyBackup(ctx)).toBeUndefined();
    }
  });

  it('verification catches a SILENTLY lost write and rolls everything back', async () => {
    // Order of puts: locations(1) people(2,3) assets(4..8) ... dropping #4 loses one asset without any error.
    for (const dropAt of [1, 2, 4, 8]) {
      const { ctx } = await makeCtx();
      const lossy = { ...ctx, store: droppingStore(ctx.store, dropAt) };
      await expect(runLegacyMigration(lossy, sourceOf('v2', V2_RAW)), `dropAt=${dropAt}`).rejects.toThrow('migration_verification_failed');
      const s = await loadSnapshot(ctx);
      expect([s.assets.length, s.people.length, s.locations.length, s.assignments.length, s.activity.length]).toEqual([0, 0, 0, 0, 0]);
      expect(await getLegacyMigrationRecord(ctx)).toBeUndefined();
    }
  });

  it('rejects unreadable input without writing anything', async () => {
    const { ctx } = await makeCtx();
    for (const raw of ['{bad', '{"x":1}', '{"version":9,"devices":[]}']) {
      const r = await runLegacyMigration(ctx, sourceOf('v2', raw));
      expect(r.ok).toBe(false);
    }
    expect((await loadSnapshot(ctx)).assets).toHaveLength(0);
    expect(await getLegacyMigrationRecord(ctx)).toBeUndefined();
  });

  it('an empty legacy list still completes (no demo data is ever implied)', async () => {
    const { ctx } = await makeCtx();
    const r = await runLegacyMigration(ctx, sourceOf('v1', '[]'));
    expect(r.ok).toBe(true);
    expect(await getLegacyMigrationRecord(ctx)).toMatchObject({ status: 'done' });
  });

  it('merges into a database that already has data without touching it', async () => {
    const { ctx } = await makeCtx();
    const loc = await createLocation(ctx, locationInput({ name: 'office 2' }));
    const per = await createPerson(ctx, personInput({ firstName: 'Olena', lastName: 'Kovalenko', email: 'o@x.com' }));
    const own = await createAsset(ctx, assetInput({ inventoryNumber: 'IT-000007', serialNumber: 'MINE-1' }));
    const r = await runLegacyMigration(ctx, sourceOf('v2', V2_RAW));
    expect(r.ok).toBe(true);
    const s = await loadSnapshot(ctx);
    expect(s.assets.some((a) => a.id === (own.ok ? own.value.id : ''))).toBe(true);
    expect(s.locations).toHaveLength(1); // matched by name, not duplicated
    expect(s.people.filter((p) => p.firstName === 'Olena')).toHaveLength(1);
    expect(loc.ok && per.ok).toBe(true);
    expect(s.assets.find((a) => a.serialNumber === 'SN-A')!.inventoryNumber).toBe('IT-000008');
  });

  it('a second run skips devices that already exist (no duplicates)', async () => {
    const { ctx } = await makeCtx();
    await runLegacyMigration(ctx, sourceOf('v2', V2_RAW));
    const again = await runLegacyMigration(ctx, sourceOf('file', V2_RAW));
    expect(again.ok && again.value.report.skippedExistingSerial).toHaveLength(5);
    expect((await loadSnapshot(ctx)).assets).toHaveLength(5);
  });

  it('file imports do not mark the localStorage migration as done', async () => {
    const { ctx } = await makeCtx();
    await runLegacyMigration(ctx, sourceOf('file', V2_RAW));
    expect(await getLegacyMigrationRecord(ctx)).toBeUndefined();
    expect((await loadSnapshot(ctx)).activity.some((e) => e.type === 'data.imported')).toBe(true);
  });

  it('skipping is recorded and can be followed by a later migration', async () => {
    const { ctx } = await makeCtx();
    await skipLegacyMigration(ctx);
    expect(await getLegacyMigrationRecord(ctx)).toMatchObject({ status: 'skipped' });
    await runLegacyMigration(ctx, sourceOf('v2', V2_RAW));
    expect(await getLegacyMigrationRecord(ctx)).toMatchObject({ status: 'done' });
  });
});

describe('previewLegacy', () => {
  it('reports what would happen and writes nothing', async () => {
    const { ctx } = await makeCtx();
    const r = await previewLegacy(ctx, V2_RAW);
    expect(r.ok && r.value.report).toMatchObject({ assetsToCreate: 5, peopleToCreate: 2, locationsToCreate: 1, ambiguousNames: ['Ivan'] });
    const s = await loadSnapshot(ctx);
    expect([s.assets.length, s.people.length, s.activity.length]).toEqual([0, 0, 0]);
    const bad = await previewLegacy(ctx, '{nope');
    expect(!bad.ok && bad.errors._form).toBe('invalid_json');
  });
});
