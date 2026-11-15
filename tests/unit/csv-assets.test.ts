import { describe, expect, it } from 'vitest';
import { ASSET_CSV_FIELDS, assetCsvTemplate, assetsToCsv, autoMapColumns, planAssetCsvImport } from '@/domain/csv-assets';
import { parseCsv } from '@/domain/csv';
import { importAssetsFromCsv } from '@/services/import-csv';
import { createAsset } from '@/services/assets';
import { createLocation } from '@/services/locations';
import { createPerson, deactivatePerson } from '@/services/people';
import { loadSnapshot } from '@/services/queries';
import { assetInput, failingStore, locationInput, makeCtx, personInput } from '../helpers';

const HEADER = ['inventory_number', 'name', 'manufacturer', 'model', 'serial_number', 'category', 'status', 'location', 'assignee', 'purchase_date', 'warranty_end_date', 'cost'];

async function world() {
  const { ctx } = await makeCtx();
  await createLocation(ctx, locationInput({ name: 'HQ' }));
  const p = await createPerson(ctx, personInput({ firstName: 'Olena', lastName: 'K', email: 'olena@x.com' }));
  const gone = await createPerson(ctx, personInput({ firstName: 'Old', lastName: 'Timer', email: 'old@x.com' }));
  await deactivatePerson(ctx, gone.ok ? gone.value.id : '');
  await createAsset(ctx, assetInput({ inventoryNumber: 'IT-EXIST', serialNumber: 'EXIST' }));
  const snap = await loadSnapshot(ctx);
  return { ctx, snap, person: p.ok ? p.value.id : '' };
}

describe('autoMapColumns', () => {
  it('maps exact names and common aliases, never one column twice', () => {
    const m = autoMapColumns(['Inventory Number', 'Device', 'Vendor', 'Serial', 'Type', 'Owner', 'Warranty', 'Price', 'Comment']);
    expect(m).toMatchObject({ inventory_number: 0, name: 1, manufacturer: 2, serial_number: 3, category: 4, assignee: 5, warranty_end_date: 6, cost: 7, notes: 8 });
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });
  it('leaves unknown columns unmapped', () => {
    expect(autoMapColumns(['foo', 'bar'])).toEqual({});
  });
});

describe('export / template', () => {
  it('export has the stable header and round-trips through the parser', async () => {
    const { snap } = await world();
    const csv = assetsToCsv(snap.assets, snap.people, snap.locations);
    const parsed = parseCsv(csv).rows;
    expect(parsed[0]).toEqual([...ASSET_CSV_FIELDS]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]![0]).toBe('IT-EXIST');
  });
  it('the template is itself a valid import file', async () => {
    const { snap } = await world();
    const rows = parseCsv(assetCsvTemplate()).rows;
    const plan = planAssetCsvImport(rows.slice(1), autoMapColumns(rows[0]!), snap);
    expect(plan.errorCount).toBe(0);
    expect(plan.validCount).toBe(1);
  });
});

describe('planAssetCsvImport', () => {
  it('validates rows with the same rules as the form and reports per-field errors', async () => {
    const { snap } = await world();
    const rows = [
      ['IT-1', 'Good', 'Dell', 'X', 'S1', 'laptop', 'in_stock', 'HQ', '', '2025-01-10', '2028-01-10', '1200'],
      ['', 'No number', '', '', 'S2', '', '', '', '', '', '', ''],
      ['IT-3', '', '', '', 'S3', '', '', '', '', '', '', ''],
      ['it-exist', 'Dup number', '', '', 'S4', '', '', '', '', '', '', ''],
      ['IT-5', 'Dup serial', '', '', 'exist', '', '', '', '', '', '', ''],
      ['IT-6', 'Bad enum', '', '', 'S6', 'toaster', 'lost-ish', '', '', '', '', ''],
      ['IT-7', 'Bad date', '', '', 'S7', '', '', '', '', '2025-02-31', '', ''],
      ['IT-8', 'Date order', '', '', 'S8', '', '', '', '', '2025-05-01', '2025-01-01', ''],
      ['IT-9', 'Bad cost', '', '', 'S9', '', '', '', '', '', '', 'abc'],
      ['IT-10', 'Unknown person', '', '', 'S10', '', '', '', 'nobody@x.com', '', '', ''],
      ['IT-11', 'Inactive person', '', '', 'S11', '', '', '', 'old@x.com', '', '', ''],
      ['IT-12', 'In use no holder', '', '', 'S12', 'laptop', 'in_use', '', '', '', '', ''],
      ['IT-13', 'Stock with holder', '', '', 'S13', 'laptop', 'in_stock', '', 'olena@x.com', '', '', ''],
    ];
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    const err = (i: number) => plan.rows[i]!.errors;
    expect(plan.validCount).toBe(1);
    expect(err(1).inventory_number).toBe('required');
    expect(err(2).name).toBe('required');
    expect(err(3).inventory_number).toBe('duplicate_inventory_number');
    expect(err(4).serial_number).toBe('duplicate_serial');
    expect(err(5)).toMatchObject({ category: 'invalid_enum', status: 'invalid_enum' });
    expect(err(6).purchase_date).toBe('invalid_date');
    expect(err(7).warranty_end_date).toBe('date_before_purchase');
    expect(err(8).cost).toBe('invalid_number');
    expect(err(9).assignee).toBe('unknown_person');
    expect(err(10).assignee).toBe('person_inactive');
    expect(err(11).assignee).toBe('in_use_requires_assignee');
    expect(err(12).assignee).toBe('status_conflicts_with_assignee');
    expect(plan.rows[0]!.line).toBe(2); // header is line 1
  });

  it('detects duplicates inside the file itself', async () => {
    const { snap } = await world();
    const rows = [
      ['IT-1', 'A', '', '', 'S1', '', '', '', '', '', '', ''],
      ['IT-1', 'B', '', '', 'S2', '', '', '', '', '', '', ''],
      ['IT-3', 'C', '', '', 'S1', '', '', '', '', '', '', ''],
    ];
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    expect(plan.validCount).toBe(1);
    expect(plan.rows[1]!.errors.inventory_number).toBe('duplicate_inventory_number');
    expect(plan.rows[2]!.errors.serial_number).toBe('duplicate_serial');
  });

  it('resolves people by email or full name, defaults status from the holder, accepts DD.MM.YYYY', async () => {
    const { snap, person } = await world();
    const rows = [
      ['IT-1', 'A', '', '', 'S1', 'laptop', '', '', 'Olena K', '01.03.2025', '', ''],
      ['IT-2', 'B', '', '', 'S2', 'network equipment', '', '', 'OLENA@X.COM', '', '', ''],
    ];
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    expect(plan.errorCount).toBe(0);
    expect(plan.rows[0]!.input).toMatchObject({ assigneeId: person, status: 'in_use', purchaseDate: '2025-03-01' });
    expect(plan.rows[1]!.input.category).toBe('network_equipment');
  });

  it('reports locations that do not exist yet (deduplicated, case-insensitive)', async () => {
    const { snap } = await world();
    const rows = [
      ['IT-1', 'A', '', '', 'S1', '', '', 'Warehouse', '', '', '', ''],
      ['IT-2', 'B', '', '', 'S2', '', '', 'warehouse', '', '', '', ''],
      ['IT-3', 'C', '', '', 'S3', '', '', 'hq', '', '', '', ''],
    ];
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    expect(plan.missingLocations).toEqual(['Warehouse']);
  });

  it('removes the spreadsheet-injection guard when reading', async () => {
    const { snap } = await world();
    const plan = planAssetCsvImport([["IT-1", "'=HYPERLINK(1)", '', '', '', '', '', '', '', '', '', '']], autoMapColumns(HEADER), snap);
    expect(plan.rows[0]!.input.name).toBe('=HYPERLINK(1)');
  });
});

describe('importAssetsFromCsv', () => {
  const rows = [
    ['IT-1', 'A', '', '', 'S1', 'laptop', 'in_stock', 'Warehouse', '', '', '', ''],
    ['IT-2', 'B', '', '', 'S2', 'monitor', 'in_stock', 'HQ', '', '', '', ''],
    ['', 'bad row', '', '', 'S3', '', '', '', '', '', '', ''],
  ];

  it('imports valid rows, skips invalid ones, creates missing locations on request, and logs it', async () => {
    const { ctx, snap } = await world();
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    const r = await importAssetsFromCsv(ctx, plan, { createMissingLocations: true });
    expect(r.ok && r.value).toEqual({ imported: 2, skipped: 1, locationsCreated: 1 });
    const s = await loadSnapshot(ctx);
    expect(s.assets).toHaveLength(3);
    expect(s.locations.map((l) => l.name).sort()).toEqual(['HQ', 'Warehouse']);
    expect(s.assets.find((a) => a.inventoryNumber === 'IT-1')!.locationId).toBe(s.locations.find((l) => l.name === 'Warehouse')!.id);
    expect(s.activity.filter((e) => e.type === 'asset.imported')).toHaveLength(2);
    expect(s.activity.some((e) => e.type === 'data.imported')).toBe(true);
  });

  it('without permission to create locations, rows needing a new location are skipped', async () => {
    const { ctx, snap } = await world();
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    const r = await importAssetsFromCsv(ctx, plan, { createMissingLocations: false });
    expect(r.ok && r.value).toMatchObject({ imported: 1, skipped: 2, locationsCreated: 0 });
    expect((await loadSnapshot(ctx)).locations).toHaveLength(1);
  });

  it('is atomic: a failure part-way leaves no imported assets, locations or events', async () => {
    const { ctx, snap } = await world();
    const before = await loadSnapshot(ctx);
    const plan = planAssetCsvImport(rows, autoMapColumns(HEADER), snap);
    const failing = { ...ctx, store: failingStore(ctx.store, 3) };
    await expect(importAssetsFromCsv(failing, plan, { createMissingLocations: true })).rejects.toThrow('injected_failure');
    const after = await loadSnapshot(ctx);
    expect(after.assets).toEqual(before.assets);
    expect(after.locations).toEqual(before.locations);
    expect(after.activity.length).toBe(before.activity.length);
  });

  it('imports with an assignee and opens an assignment', async () => {
    const { ctx, snap, person } = await world();
    const plan = planAssetCsvImport([['IT-9', 'Held', '', '', 'S9', 'laptop', 'in_use', '', 'olena@x.com', '', '', '']], autoMapColumns(HEADER), snap);
    await importAssetsFromCsv(ctx, plan, { createMissingLocations: false });
    const s = await loadSnapshot(ctx);
    expect(s.assets.find((a) => a.inventoryNumber === 'IT-9')!.assigneeId).toBe(person);
    expect(s.assignments.filter((a) => a.returnedAt === null)).toHaveLength(1);
  });
});
