// End-to-end suite: real Chrome, built app served under the GitHub-Pages-style subpath.
//   npm run build && npm run test:e2e
import { readFileSync } from 'node:fs';
import { check, launch, newPage, noHorizontalOverflow, OUT, readJson, readMeta, readStore, readText, results, saveDownload, writeFixture } from './lib.mjs';

const { server, url: BASE, browser } = await launch();
const allErrors = [];
const T = 8000;
const goto = async (page, hash = '') => { await page.goto(`${BASE}${hash}`); };
const settle = (page) => page.waitForTimeout(150);

async function startEmpty(page) {
  await goto(page);
  await page.getByTestId('start-empty').click();
  await page.waitForSelector('.sidebar', { timeout: T });
}
async function startDemo(page) {
  await goto(page);
  await page.getByTestId('start-demo').click();
  await page.waitForSelector('[data-testid=kpis]', { timeout: T });
}
const field = (page, name) => page.locator(`dialog[open] [name="${name}"]`);
async function fillAsset(page, v) {
  for (const [k, val] of Object.entries(v)) {
    const el = field(page, k);
    if (['category', 'status', 'assigneeId', 'locationId'].includes(k)) await el.selectOption(val);
    else await el.fill(val);
  }
}
const dialogHas = (pg, text) => pg.locator('dialog[open]').getByText(text).first().waitFor({ timeout: 3000 }).then(() => true, () => false);
async function toast(page) { return (await page.locator('.toast').last().innerText({ timeout: T }).catch(() => '')).trim(); }

/* ================= 1. first run, welcome, persistence ================= */
async function scenarioFirstRun() {
  const { context, page, errors } = await newPage(browser);
  await goto(page);
  await page.waitForSelector('[data-testid=start-empty]', { timeout: T });
  check('1.1 first launch without legacy data shows the welcome screen', await page.getByTestId('start-demo').isVisible());
  check('1.2 nothing is auto-seeded (database is empty)', (await readStore(page, 'assets')).length === 0);
  await page.getByTestId('start-empty').click();
  await page.waitForSelector('.sidebar', { timeout: T });
  check('1.3 empty dashboard offers actions instead of fake numbers', (await page.locator('.empty').innerText()).includes('Nothing here yet'));
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: T });
  check('1.4 welcome is not shown again after reload', (await page.locator('[data-testid=start-empty]').count()) === 0);
  allErrors.push(...errors.map((e) => `[1] ${e}`));
  await context.close();
}

/* ================= 2. demo data ================= */
async function scenarioDemo() {
  const { context, page, errors } = await newPage(browser);
  await startEmpty(page);
  // real asset first
  await goto(page, '#/assets');
  await page.getByTestId('add-asset').click();
  await fillAsset(page, { inventoryNumber: 'REAL-1', name: 'My real laptop', serialNumber: 'REAL-SN' });
  await page.getByTestId('asset-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  await goto(page, '#/settings');
  await page.getByTestId('demo-load').click();
  await page.waitForSelector('[data-testid=remove-demo]', { timeout: T });
  check('2.1 demo banner is visible while demo data exists', await page.getByTestId('remove-demo').isVisible());
  const assets = await readStore(page, 'assets');
  check('2.2 demo rows are flagged, real row is not', assets.filter((a) => a.isDemo).length === 25 && assets.filter((a) => !a.isDemo).length === 1);
  await goto(page, '#/');
  const kpiTotal = await page.locator('.kpi').first().locator('.kpi__value').innerText();
  check('2.3 dashboard total equals data (26)', kpiTotal.trim() === '26', kpiTotal);
  await page.getByTestId('remove-demo').click();
  await page.getByTestId('confirm-yes').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid=remove-demo]'), null, { timeout: T });
  const left = await readStore(page, 'assets');
  check('2.4 removing demo data leaves exactly the real asset untouched', left.length === 1 && left[0].inventoryNumber === 'REAL-1' && left[0].name === 'My real laptop');
  check('2.5 demo people/locations/tickets are gone too', (await readStore(page, 'people')).length === 0 && (await readStore(page, 'tickets')).length === 0 && (await readStore(page, 'locations')).length === 0);
  allErrors.push(...errors.map((e) => `[2] ${e}`));
  await context.close();
}

/* ================= 3. migration from previous versions ================= */
const LEGACY_V2 = JSON.stringify([
  { id: 'old-1', name: 'Laptop', model: 'Dell Latitude 5420', serial: 'DL-5420-0001', owner: 'Olena Kovalenko', category: 'Laptop', status: 'In Use', location: 'Office 2', purchaseDate: '2024-01-10', warrantyDate: '2027-01-10' },
  { id: 'old-2', name: 'Switch', model: 'Cisco 2960', serial: 'CS-2960', owner: '', category: 'Network Equipment', status: 'In Stock', location: 'office 2', purchaseDate: '', warrantyDate: '' },
  { id: 'old-3', name: 'Monitor', model: 'LG', serial: 'LG-1', owner: 'olena  kovalenko', category: 'Monitor', status: 'Retired', location: '', purchaseDate: '', warrantyDate: '' },
  { id: 'old-4', name: 'Phone', model: 'Pixel', serial: 'PX-1', owner: 'Ivan', category: 'Mobile Device', status: 'In Stock', location: '', purchaseDate: '', warrantyDate: '' },
]);
const LEGACY_V1 = JSON.stringify([{ id: 'v1-1', name: 'Old PC', model: 'HP', serial: 'HP-1', owner: 'Max' }, { id: 'v1-2', name: 'Old Switch', model: 'TP', serial: 'TP-1' }]);
const seedLegacy = ({ v2, v1 }) => {
  // Seed only once per origin so a reload never "repairs" data the app might have touched.
  if (localStorage.getItem('__seeded')) return;
  if (v2 !== null) localStorage.setItem('inventoryManagement.devices.v2', v2);
  if (v1 !== null) localStorage.setItem('inventoryManagement.devices.v1', v1);
  localStorage.setItem('__seeded', '1');
};

async function scenarioMigration() {
  const { context, page, errors } = await newPage(browser, { init: { fn: seedLegacy, arg: { v2: LEGACY_V2, v1: LEGACY_V1 } } });
  await goto(page);
  await page.waitForSelector('[data-testid=migrate-now]', { timeout: T });
  check('3.1 existing LocalStorage data triggers the upgrade screen (no silent action)', await page.getByTestId('migrate-now').isVisible());
  check('3.2 preview shows the counts (4 assets, 2 people, 1 location)', (await page.getByTestId('mig-assets').innerText()) === '4' && (await page.getByTestId('mig-people').innerText()) === '2' && (await page.getByTestId('mig-locations').innerText()) === '1');
  check('3.3 preview warns about the ambiguous name "Ivan"', (await page.locator('.banner').allInnerTexts()).join(' ').includes('Ivan'));
  check('3.4 nothing has been written yet', (await readStore(page, 'assets')).length === 0);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-legacy-backup').click()]);
  const backup = readJson(await saveDownload(dl, 'legacy-backup-test.json'));
  check('3.5 legacy backup download contains the raw old data byte-for-byte', backup.keys['inventoryManagement.devices.v2'] === LEGACY_V2 && backup.keys['inventoryManagement.devices.v1'] === LEGACY_V1);

  await page.getByTestId('migrate-now').click();
  await page.waitForSelector('[data-testid=migration-continue]', { timeout: T });
  check('3.6 success screen is shown', true);
  const ls = await page.evaluate(() => [localStorage.getItem('inventoryManagement.devices.v2'), localStorage.getItem('inventoryManagement.devices.v1')]);
  check('3.7 legacy LocalStorage keys are byte-identical after migration (never modified or deleted)', ls[0] === LEGACY_V2 && ls[1] === LEGACY_V1);
  await page.getByTestId('migration-continue').click();
  await page.waitForSelector('.sidebar', { timeout: T });

  const assets = await readStore(page, 'assets');
  const people = await readStore(page, 'people');
  const assignments = await readStore(page, 'assignments');
  check('3.8 all 4 devices migrated with legacy ids, serials and names', assets.length === 4 && ['old-1', 'old-2', 'old-3', 'old-4'].every((id) => assets.some((a) => a.id === id)) && assets.find((a) => a.id === 'old-1').serialNumber === 'DL-5420-0001');
  check('3.9 people were deduplicated case/space-insensitively (Olena once, Ivan once)', people.length === 2 && people.filter((p) => p.firstName === 'Olena').length === 1);
  check('3.10 in-use asset holds an active assignment; retired / in-stock owners kept as closed history', assignments.filter((a) => a.returnedAt === null).length === 1 && assignments.filter((a) => a.endReason === 'asset_retired').length === 1 && assignments.filter((a) => a.endReason === 'returned_to_stock').length === 1);
  check('3.11 verified legacy backup stored in the database', !!(await readMeta(page, 'legacyBackup')));
  check('3.12 migration is recorded as done', (await readMeta(page, 'legacyMigration'))?.status === 'done');
  check('3.13 no demo data was added', assets.every((a) => !a.isDemo));

  await goto(page, '#/assets');
  await page.waitForSelector('table.table', { timeout: T });
  check('3.14 assets list shows the 4 migrated devices', (await page.locator('tbody tr').count()) === 4);
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: T });
  check('3.15 after reload there is no upgrade screen and data persists', (await page.locator('[data-testid=migrate-now]').count()) === 0 && (await readStore(page, 'assets')).length === 4);
  await goto(page, '#/settings');
  const reported = await page.waitForSelector('text=Migrated on', { timeout: T }).then(() => true, () => false);
  check('3.16 Settings reports the migration', reported);
  allErrors.push(...errors.map((e) => `[3] ${e}`));
  await context.close();

  // v1.0-only data (no v2 key)
  {
    const c = await newPage(browser, { init: { fn: seedLegacy, arg: { v2: null, v1: LEGACY_V1 } } });
    await goto(c.page);
    await c.page.waitForSelector('[data-testid=migrate-now]', { timeout: T });
    await c.page.getByTestId('migrate-now').click();
    await c.page.waitForSelector('[data-testid=migration-continue]', { timeout: T });
    await c.page.getByTestId('migration-continue').click();
    await c.page.waitForSelector('.sidebar', { timeout: T });
    const a = await readStore(c.page, 'assets');
    check('3.17 v1.0-only data (old fields only) migrates with defaults', a.length === 2 && a.every((x) => x.category === 'other') && a.find((x) => x.id === 'v1-1').status === 'in_use' && a.find((x) => x.id === 'v1-2').status === 'in_stock');
    allErrors.push(...c.errors.map((e) => `[3b] ${e}`));
    await c.context.close();
  }

  // skip, then import later from Settings
  {
    const c = await newPage(browser, { init: { fn: seedLegacy, arg: { v2: LEGACY_V2, v1: null } } });
    await goto(c.page);
    await c.page.waitForSelector('[data-testid=migration-skip]', { timeout: T });
    await c.page.getByTestId('migration-skip').click();
    await c.page.waitForSelector('[data-testid=start-empty]', { timeout: T });
    check('3.18 skipping leads to the welcome screen and imports nothing', (await readStore(c.page, 'assets')).length === 0);
    await c.page.getByTestId('start-empty').click();
    await c.page.waitForSelector('.sidebar', { timeout: T });
    const keep = await c.page.evaluate(() => localStorage.getItem('inventoryManagement.devices.v2'));
    check('3.19 legacy data still untouched after skipping', keep === LEGACY_V2);
    await goto(c.page, '#/settings');
    await c.page.getByTestId('legacy-import-ls').click();
    await c.page.getByTestId('migrate-now').click();
    await c.page.waitForSelector('[data-testid=migration-continue]', { timeout: T });
    await c.page.getByTestId('migration-continue').click();
    await c.page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: T });
    check('3.20 later import from Settings works', (await readStore(c.page, 'assets')).length === 4);
    allErrors.push(...c.errors.map((e) => `[3c] ${e}`));
    await c.context.close();
  }

  // corrupt legacy data
  {
    const c = await newPage(browser, { init: { fn: seedLegacy, arg: { v2: '{this is not json', v1: null } } });
    await goto(c.page);
    await c.page.waitForSelector('.banner', { timeout: T });
    const text = await c.page.locator('.fullscreen__panel').innerText();
    check('3.21 corrupt legacy data is reported clearly, with a backup button, and never crashes', text.includes('could not be read') && (await c.page.getByTestId('download-legacy-backup').isVisible()));
    const ls = await c.page.evaluate(() => localStorage.getItem('inventoryManagement.devices.v2'));
    check('3.22 corrupt legacy value is left exactly as it was', ls === '{this is not json');
    check('3.23 corrupt legacy data does not seed demo data', (await readStore(c.page, 'assets')).length === 0);
    allErrors.push(...c.errors.map((e) => `[3d] ${e}`));
    await c.context.close();
  }

  // migration fails in the browser (IndexedDB write error) -> nothing written, original kept
  {
    const c = await newPage(browser, { init: { fn: seedLegacy, arg: { v2: LEGACY_V2, v1: null } } });
    await c.page.addInitScript(() => {
      // Make every write to the "assets" store fail, to simulate quota / write errors.
      const orig = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'assets' && window.__failAssets) throw new DOMException('simulated quota error', 'QuotaExceededError');
        return orig.apply(this, args);
      };
    });
    await goto(c.page);
    await c.page.waitForSelector('[data-testid=migrate-now]', { timeout: T });
    await c.page.evaluate(() => { window.__failAssets = true; });
    await c.page.getByTestId('migrate-now').click();
    await c.page.waitForSelector('text=Migration failed', { timeout: T });
    check('3.24 a failing migration shows a clear error', true);
    await c.page.evaluate(() => { window.__failAssets = false; });
    check('3.25 failed migration leaves the database empty and the legacy data intact', (await readStore(c.page, 'assets')).length === 0 && (await readStore(c.page, 'people')).length === 0 && (await c.page.evaluate(() => localStorage.getItem('inventoryManagement.devices.v2'))) === LEGACY_V2);
    await c.page.getByText('Try again').click();
    await c.page.waitForSelector('[data-testid=migration-continue]', { timeout: T });
    check('3.26 retry after the failure succeeds', (await readStore(c.page, 'assets')).length === 4);
    await c.context.close();
  }
}

/* ================= 4. asset CRUD, validation, filters ================= */
async function scenarioAssets() {
  const { context, page, errors } = await newPage(browser);
  await startDemo(page);
  await goto(page, '#/assets');
  await page.waitForSelector('table.table', { timeout: T });
  check('4.1 list shows demo assets (page size 25)', (await page.locator('tbody tr').count()) === 25);

  // validation
  await page.getByTestId('add-asset').click();
  await page.getByTestId('asset-save').click();
  check('4.2 empty form shows required errors', (await page.locator('dialog[open] .field__error').first().waitFor({ timeout: 3000 }).then(() => true, () => false)) && (await dialogHas(page, 'required')));
  await fillAsset(page, { inventoryNumber: 'demo-0001', name: 'Dup' });
  await page.getByTestId('asset-save').click();
  check('4.3 duplicate inventory number is rejected (case-insensitive)', (await dialogHas(page, 'already used')));
  await fillAsset(page, { inventoryNumber: 'X-1', serialNumber: 'demo-sn-0001' });
  await page.getByTestId('asset-save').click();
  check('4.4 duplicate serial number is rejected', (await dialogHas(page, 'serial number already exists')));
  await fillAsset(page, { serialNumber: 'X-SN-1', status: 'in_use' });
  await page.getByTestId('asset-save').click();
  check('4.5 "In use" without a holder is rejected', (await dialogHas(page, 'needs a responsible person')));
  await fillAsset(page, { status: 'in_stock', purchaseDate: '2025-05-01', warrantyEndDate: '2025-01-01' });
  await page.getByTestId('asset-save').click();
  check('4.6 warranty earlier than purchase is rejected', (await dialogHas(page, 'earlier than the purchase date')));
  await fillAsset(page, { warrantyEndDate: '2030-05-01', cost: '1234.5', manufacturer: 'ACME', name: 'Brand new asset' });
  await page.getByTestId('asset-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  check('4.7 valid asset is created', (await toast(page)).includes('Asset created'));
  const created = (await readStore(page, 'assets')).find((a) => a.inventoryNumber === 'X-1');
  check('4.8 stored with all entered fields', created && created.name === 'Brand new asset' && created.cost === 1234.5 && created.manufacturer === 'ACME' && created.warrantyEndDate === '2030-05-01' && created.isDemo === false);

  // search
  await goto(page, '#/assets');
  await page.getByTestId('asset-search').fill('brand new');
  await settle(page);
  check('4.9 search by name finds exactly the new asset', (await page.locator('tbody tr').count()) === 1);
  await page.getByTestId('asset-search').fill('olena');
  await settle(page);
  const n = await page.locator('tbody tr').count();
  check('4.10 search by responsible person works', n >= 1);
  await page.getByTestId('asset-search').fill('zzzzzz');
  await settle(page);
  check('4.11 no-match state is shown', (await page.locator('.empty').innerText()).includes('No assets match'));

  // deep-link filters from dashboard KPIs
  await goto(page, '#/assets?status=in_use');
  await page.waitForSelector('table.table');
  const inUse = (await readStore(page, 'assets')).filter((a) => a.status === 'in_use').length;
  check('4.12 ?status=in_use deep link filters the list', (await page.locator('tbody tr').count()) === Math.min(25, inUse));
  check('4.13 active filter chip is shown and removable', (await page.locator('.chip').count()) === 1);
  await page.locator('.chip button').click();
  await settle(page);
  check('4.14 removing the chip clears the filter', (await page.locator('tbody tr').count()) === 25);
  await goto(page, '#/assets?warranty=expired');
  await page.waitForSelector('table.table');
  const today = new Date().toISOString().slice(0, 10);
  const exp = (await readStore(page, 'assets')).filter((a) => a.warrantyEndDate && a.warrantyEndDate < today).length;
  check('4.15 ?warranty=expired matches the data', (await page.locator('tbody tr').count()) === exp);
  await goto(page, '#/assets?category=monitor&status=in_use');
  await page.waitForSelector('table.table');
  const mon = (await readStore(page, 'assets')).filter((a) => a.category === 'monitor' && a.status === 'in_use').length;
  check('4.16 combined filters (category + status)', (await page.locator('tbody tr').count()) === mon);
  await goto(page, '#/assets?location=none');
  await settle(page);

  // sorting
  await goto(page, '#/assets');
  await page.waitForSelector('table.table');
  const firstName = async () => (await page.locator('tbody tr').first().locator('.cell-primary').first().innerText()).trim();
  const asc = await firstName();
  await page.locator('th button', { hasText: 'Name' }).click();
  await settle(page);
  const desc = await firstName();
  check('4.17 clicking a header toggles sort direction', asc !== desc);
  check('4.18 sort state is in the URL', page.url().includes('sort=name') && page.url().includes('dir=desc'));
  await page.locator('th button', { hasText: 'Warranty' }).click();
  await settle(page);
  check('4.19 sorting by another column works', page.url().includes('sort=warranty'));

  // pagination
  await goto(page, '#/assets');
  await page.waitForSelector('table.table');
  await page.locator('.pagination select').selectOption('10');
  await settle(page);
  check('4.20 page size 10 shows 10 rows', (await page.locator('tbody tr').count()) === 10);
  await page.getByLabel('Next page').click();
  await settle(page);
  check('4.21 next page shows different rows and page indicator', (await page.locator('.pagination .num').innerText()).startsWith('2 /'));
  await page.locator('.pagination select').selectOption('25');

  // column picker persists
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.locator('.menu__panel label', { hasText: 'Serial number' }).locator('input').check();
  await page.keyboard.press('Escape');
  await settle(page);
  check('4.22 enabling a column adds it to the table', (await page.locator('thead th', { hasText: 'Serial number' }).count()) === 1);
  await page.reload();
  await page.waitForSelector('table.table');
  check('4.23 column choice persists after reload', (await page.locator('thead th', { hasText: 'Serial number' }).count()) === 1);

  // edit + delete via list
  await goto(page, '#/assets');
  await page.getByTestId('asset-search').fill('Brand new');
  await settle(page);
  await page.getByTestId('edit-asset').first().click();
  await fillAsset(page, { name: 'Renamed asset', status: 'under_repair' });
  await page.getByTestId('asset-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  const edited = (await readStore(page, 'assets')).find((a) => a.inventoryNumber === 'X-1');
  check('4.24 edit saves changes', edited.name === 'Renamed asset' && edited.status === 'under_repair');
  const ev = await readStore(page, 'activity');
  check('4.25 edit wrote typed audit events with before/after values', ev.some((e) => e.type === 'asset.updated' && e.changes.some((c) => c.field === 'name' && c.from === 'Brand new asset' && c.to === 'Renamed asset')) && ev.some((e) => e.type === 'asset.status_changed' && e.assetId === created.id));
  await page.getByTestId('asset-search').fill('Renamed');
  await settle(page);
  await page.getByTestId('delete-asset').first().click();
  await page.getByTestId('confirm-yes').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  check('4.26 delete asks for confirmation and removes the asset', !(await readStore(page, 'assets')).some((a) => a.inventoryNumber === 'X-1'));
  check('4.27 deletion kept its audit trail (snapshot label)', (await readStore(page, 'activity')).some((e) => e.type === 'asset.deleted' && e.entityLabel.includes('X-1')));

  // cancelling a delete keeps the record
  await goto(page, '#/assets');
  const before = (await readStore(page, 'assets')).length;
  await page.getByTestId('delete-asset').first().click();
  await page.locator('dialog[open]').getByText('Cancel').click();
  check('4.28 cancelling delete keeps the record', (await readStore(page, 'assets')).length === before);

  // bulk edit
  await goto(page, '#/assets?category=monitor');
  await page.waitForSelector('table.table');
  await page.locator('thead input[type=checkbox]').check();
  check('4.29 selecting rows shows the bulk bar', await page.getByTestId('bulkbar').isVisible());
  await page.getByTestId('bulk-edit').click();
  await page.locator('dialog[open] select[name="locationId"]').selectOption({ index: 2 });
  await page.getByTestId('bulk-apply').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  const locIds = new Set((await readStore(page, 'assets')).filter((a) => a.category === 'monitor').map((a) => a.locationId));
  check('4.30 bulk edit changes every selected asset', locIds.size === 1);
  // bulk edit that violates a rule changes nothing
  const snapshot = JSON.stringify((await readStore(page, 'assets')).sort((a, b) => a.id.localeCompare(b.id)));
  await page.locator('thead input[type=checkbox]').check();
  await page.getByTestId('bulk-edit').click();
  await page.locator('dialog[open] select[name="status"]').selectOption('in_use');
  await page.getByTestId('bulk-apply').click();
  await page.waitForSelector('dialog[open] .banner', { timeout: T });
  check('4.31 an invalid bulk edit is rejected as a whole and explains why', (await dialogHas(page, 'Nothing was changed')));
  check('4.32 ...and really changed nothing in the database', JSON.stringify((await readStore(page, 'assets')).sort((a, b) => a.id.localeCompare(b.id))) === snapshot);
  allErrors.push(...errors.map((e) => `[4] ${e}`));
  await context.close();
}

/* ================= 5. people, assignment, transfer, offboarding ================= */
async function scenarioPeople() {
  const { context, page, errors } = await newPage(browser);
  await startEmpty(page);

  await goto(page, '#/people');
  await page.getByTestId('add-person').click();
  await page.getByTestId('person-save').click();
  check('5.1 person form requires first and last name', (await dialogHas(page, 'required')));
  await field(page, 'firstName').fill('Anna'); await field(page, 'lastName').fill('Koval'); await field(page, 'email').fill('bad');
  await page.getByTestId('person-save').click();
  check('5.2 email format is validated', (await dialogHas(page, 'valid email')));
  await field(page, 'email').fill('anna@corp.test'); await field(page, 'department').fill('IT');
  await page.getByTestId('person-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  for (const [f, l, e] of [['Boris', 'Mazur', 'boris@corp.test'], ['Clara', 'Ivanenko', 'clara@corp.test']]) {
    await page.getByTestId('add-person').click();
    await field(page, 'firstName').fill(f); await field(page, 'lastName').fill(l); await field(page, 'email').fill(e);
    await page.getByTestId('person-save').click();
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  }
  check('5.3 three people created', (await readStore(page, 'people')).length === 3);
  await page.getByTestId('add-person').click();
  await field(page, 'firstName').fill('Dup'); await field(page, 'lastName').fill('Mail'); await field(page, 'email').fill('ANNA@corp.test');
  await page.getByTestId('person-save').click();
  check('5.4 duplicate email is rejected (case-insensitive)', (await dialogHas(page, 'already has this email')));
  await page.locator('dialog[open]').getByText('Cancel').click();

  // assets
  await goto(page, '#/assets');
  for (const [n, name] of [['IT-1', 'Laptop A'], ['IT-2', 'Monitor B'], ['IT-3', 'Phone C']]) {
    await page.getByTestId('add-asset').click();
    await fillAsset(page, { inventoryNumber: n, name, serialNumber: `SN-${n}` });
    await page.getByTestId('asset-save').click();
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  }
  const people = await readStore(page, 'people');
  const anna = people.find((p) => p.firstName === 'Anna'), boris = people.find((p) => p.firstName === 'Boris');
  const assetByNum = async (n) => (await readStore(page, 'assets')).find((a) => a.inventoryNumber === n);

  // assign via detail page
  const asset1 = await assetByNum('IT-1');
  await goto(page, `#/assets/${asset1.id}`);
  await page.getByTestId('assign-asset').click();
  await page.locator('dialog[open] select[name="personId"]').selectOption(anna.id);
  await page.getByTestId('assign-confirm').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  let a1 = await assetByNum('IT-1');
  check('5.5 assigning sets holder and status in_use', a1.assigneeId === anna.id && a1.status === 'in_use');
  // second + third asset to Anna
  for (const n of ['IT-2', 'IT-3']) {
    const a = await assetByNum(n);
    await goto(page, `#/assets/${a.id}`);
    await page.getByTestId('assign-asset').click();
    await page.locator('dialog[open] select[name="personId"]').selectOption(anna.id);
    await page.getByTestId('assign-confirm').click();
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  }
  // transfer IT-1 to Boris
  await goto(page, `#/assets/${asset1.id}`);
  await page.getByTestId('assign-asset').click();
  const options = await page.locator('dialog[open] select[name="personId"] option').allInnerTexts();
  check('5.6 the current holder is not offered as a transfer target', !options.some((o) => o.includes('Anna')));
  await page.locator('dialog[open] select[name="personId"]').selectOption(boris.id);
  await page.getByTestId('assign-confirm').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  a1 = await assetByNum('IT-1');
  const ledger = (await readStore(page, 'assignments')).filter((x) => x.assetId === asset1.id);
  check('5.7 transfer: new holder, old row closed as "transferred", exactly one active row', a1.assigneeId === boris.id && ledger.length === 2 && ledger.filter((x) => x.returnedAt === null).length === 1 && ledger.some((x) => x.endReason === 'transferred'));
  await page.getByRole('tab', { name: /Assignments/ }).click();
  check('5.8 assignment history tab lists both holders', (await page.locator('tbody tr').count()) === 2);
  await page.getByRole('tab', { name: /History/ }).click();
  check('5.9 history tab shows the holder change', (await page.locator('.timeline').innerText()).includes('holder changed from'));

  // return to stock
  await goto(page, `#/assets/${asset1.id}`);
  await page.getByTestId('return-asset').click();
  await page.getByTestId('confirm-yes').click();
  await page.waitForFunction((id) => true, asset1.id);
  await settle(page);
  a1 = await assetByNum('IT-1');
  check('5.10 return to stock clears holder and sets in_stock', a1.assigneeId === null && a1.status === 'in_stock');

  // offboarding Anna (holds IT-2, IT-3)
  await goto(page, `#/people/${anna.id}`);
  check('5.11 person page lists the 2 held assets', (await page.getByText(/Assets held \(2\)/).count()) === 1);
  await page.getByTestId('offboard-person').click();
  await page.getByTestId('offboard-confirm').click();
  await settle(page);
  check('5.12 offboarding without decisions is refused (person stays active)', (await readStore(page, 'people')).find((p) => p.id === anna.id).status === 'active' && (await dialogHas(page, 'Choose what to do')));
  const choices = page.getByTestId('offboard-choice');
  await choices.nth(0).selectOption(boris.id);
  await choices.nth(1).selectOption('stock');
  await page.getByTestId('offboard-confirm').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  const annaAfter = (await readStore(page, 'people')).find((p) => p.id === anna.id);
  check('5.13 offboarding deactivates the person and keeps the record', annaAfter.status === 'inactive' && !!annaAfter.deactivatedAt);
  const allAssets = await readStore(page, 'assets');
  check('5.14 assets were transferred / returned to stock accordingly', allAssets.filter((a) => a.assigneeId === boris.id).length === 1 && allAssets.filter((a) => a.assigneeId === anna.id).length === 0 && allAssets.filter((a) => a.status === 'in_stock').length === 2);
  const annaRows = (await readStore(page, 'assignments')).filter((x) => x.personId === anna.id);
  check('5.15 assignment history of the former employee is preserved (closed as "offboarding")', annaRows.length === 3 && annaRows.every((x) => x.returnedAt !== null) && annaRows.filter((x) => x.endReason === 'offboarding').length === 2);
  check('5.16 the person page shows the inactive notice and history', (await page.locator('main').innerText()).includes('was deactivated') && (await page.locator('tbody tr').count()) >= 3);

  // inactive people cannot receive assets
  const a3 = await assetByNum('IT-3');
  await goto(page, `#/assets/${a3.id}`);
  await page.getByTestId('assign-asset').click();
  const opts2 = await page.locator('dialog[open] select[name="personId"] option').allInnerTexts();
  check('5.17 inactive people are not offered when assigning', !opts2.some((o) => o.includes('Anna')));
  await page.locator('dialog[open]').getByText('Cancel').click();

  // reactivate
  await goto(page, '#/people');
  await page.getByTestId('reactivate-person').first().click();
  await settle(page);
  check('5.18 a person can be reactivated', (await readStore(page, 'people')).every((p) => p.status === 'active'));

  // person with no assets: offboard = simple deactivate
  const clara = (await readStore(page, 'people')).find((p) => p.firstName === 'Clara');
  await goto(page, `#/people/${clara.id}`);
  await page.getByTestId('offboard-person').click();
  check('5.19 offboarding a person without assets explains it will just deactivate', (await dialogHas(page, 'holds no assets')));
  await page.getByTestId('offboard-confirm').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  check('5.20 ...and deactivates them', (await readStore(page, 'people')).find((p) => p.id === clara.id).status === 'inactive');

  // people list filters
  await goto(page, '#/people?status=inactive');
  await page.waitForSelector('table.table');
  check('5.21 people list status filter', (await page.locator('tbody tr').count()) === 1);
  await goto(page, '#/people');
  await page.getByTestId('people-search').fill('mazur');
  await settle(page);
  check('5.22 people search', (await page.locator('tbody tr').count()) === 1);
  allErrors.push(...errors.map((e) => `[5] ${e}`));
  await context.close();
}

/* ================= 6. maintenance ================= */
async function scenarioMaintenance() {
  const { context, page, errors } = await newPage(browser);
  await startEmpty(page);
  await goto(page, '#/assets');
  await page.getByTestId('add-asset').click();
  await fillAsset(page, { inventoryNumber: 'M-1', name: 'Printer X', serialNumber: 'PX', category: 'printer' });
  await page.getByTestId('asset-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  const asset = (await readStore(page, 'assets'))[0];
  await goto(page, `#/assets/${asset.id}?tab=maintenance`);
  await page.getByRole('button', { name: 'New ticket' }).last().click();
  await page.getByTestId('ticket-save').click();
  check('6.1 ticket requires title and problem', (await dialogHas(page, 'required')));
  await field(page, 'title').fill('Paper jam');
  await field(page, 'problem').fill('Jams every second page');
  await field(page, 'priority').selectOption('high');
  await page.locator('dialog[open] label.check input').check();
  await page.getByTestId('ticket-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  let t = (await readStore(page, 'tickets'))[0];
  check('6.2 ticket created as Open with chosen priority', t.status === 'open' && t.priority === 'high' && t.assetId === asset.id);
  check('6.3 asset was set under repair only because it was ticked', (await readStore(page, 'assets'))[0].status === 'under_repair');
  check('6.4 ticket appears in the asset maintenance tab', (await page.locator('tbody tr').count()) === 1);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  check('6.5 open ticket offers only valid next statuses (no "resolved" yet)', (await page.getByTestId('ticket-to-resolved').count()) === 0 && (await page.getByTestId('ticket-to-in_progress').count()) === 1);
  await page.getByTestId('ticket-to-in_progress').click();
  await settle(page);
  await page.getByTestId('ticket-to-resolved').click();
  await settle(page);
  check('6.6 resolving without work description is refused', (await dialogHas(page, 'required')) && (await readStore(page, 'tickets'))[0].status === 'in_progress');
  await field(page, 'workDone').fill('Replaced the pickup roller');
  await field(page, 'cost').fill('45.5');
  await page.locator('dialog[open] select[name="restore"]').selectOption('in_stock');
  await page.getByTestId('ticket-to-resolved').click();
  await settle(page);
  t = (await readStore(page, 'tickets'))[0];
  check('6.7 ticket resolved with work, cost and timestamp', t.status === 'resolved' && t.workDone.includes('roller') && t.cost === 45.5 && !!t.resolvedAt);
  check('6.8 asset status restored only because it was chosen', (await readStore(page, 'assets'))[0].status === 'in_stock');
  await page.getByTestId('ticket-to-closed').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  t = (await readStore(page, 'tickets'))[0];
  check('6.9 ticket closed (terminal)', t.status === 'closed' && !!t.closedAt);
  const types = (await readStore(page, 'activity')).map((e) => e.type);
  check('6.10 maintenance events were logged', ['ticket.created', 'ticket.status_changed', 'ticket.resolved'].every((x) => types.includes(x)));
  await goto(page, '#/maintenance');
  check('6.11 default maintenance view hides closed tickets', (await page.locator('tbody tr').count()) === 0);
  await page.locator('select[aria-label="Status"]').selectOption('all');
  await settle(page);
  check('6.12 "All tickets" shows it', (await page.locator('tbody tr').count()) === 1);
  await page.getByTestId('open-ticket').click();
  check('6.13 closed ticket is read-only', (await dialogHas(page, 'closed and can no longer be edited')) && (await page.getByTestId('ticket-save').count()) === 0);
  allErrors.push(...errors.map((e) => `[6] ${e}`));
  await context.close();
}

/* ================= 7. backup / restore / CSV / language / theme ================= */
async function scenarioData() {
  const { context, page, errors } = await newPage(browser);
  await startDemo(page);
  await goto(page, '#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
  const file = await saveDownload(dl, 'backup-test.json');
  const backup = readJson(file);
  check('7.1 backup file has schema, version and all collections', backup.schema === 'itam-backup' && backup.version === 3 && backup.data.assets.length === 25 && backup.data.people.length === 8 && Array.isArray(backup.data.activity));
  check('7.2 backup filename is dated', /^inventory-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()));

  // restore into a fresh browser profile
  const c2 = await newPage(browser);
  await startEmpty(c2.page);
  await goto(c2.page, '#/settings');
  await c2.page.getByTestId('restore-input').setInputFiles(file);
  await c2.page.locator('dialog[open]').waitFor({ timeout: T });
  check('7.3 restore asks for confirmation and states what will be replaced', (await dialogHas(c2.page, 'replaces ALL current data')));
  const [safety] = await Promise.all([c2.page.waitForEvent('download'), c2.page.getByTestId('confirm-yes').click()]);
  check('7.4 a safety copy of the current data is downloaded before restoring', safety.suggestedFilename().startsWith('inventory-before-restore-'));
  await c2.page.waitForFunction(() => document.querySelectorAll('.toast').length > 0, null, { timeout: T });
  const restored = await readStore(c2.page, 'assets');
  check('7.5 restore brought back all assets with ids', restored.length === 25 && restored.some((a) => a.id === backup.data.assets[0].id));
  // invalid backups
  for (const [name, text, expect] of [['bad json', '{nope', 'valid JSON'], ['wrong schema', '{"schema":"x"}', 'not a backup'], ['v2 version', JSON.stringify({ ...backup, version: 2 }), 'unsupported version']]) {
    const p = writeFixture(`bad-backup-${name.replace(/\s/g, '-')}.json`, text);
    const before = JSON.stringify((await readStore(c2.page, 'assets')).length);
    await c2.page.getByTestId('restore-input').setInputFiles(p);
    await c2.page.waitForFunction((x) => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes(x)), expect, { timeout: T });
    check(`7.6 invalid backup (${name}) is rejected with a message and changes nothing`, JSON.stringify((await readStore(c2.page, 'assets')).length) === before);
  }
  const broken = structuredClone(backup);
  broken.data.tickets[0].assetId = 'ghost';
  await c2.page.getByTestId('restore-input').setInputFiles(writeFixture('bad-backup-refs.json', JSON.stringify(broken)));
  await c2.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes('inconsistent')), null, { timeout: T });
  check('7.7 backup with broken references is rejected', (await readStore(c2.page, 'assets')).length === 25);
  allErrors.push(...c2.errors.map((e) => `[7b] ${e}`));
  await c2.context.close();

  // CSV import wizard
  await goto(page, '#/import');
  const csv = [
    'Inventory Number;Device;Vendor;Serial;Type;State;Location;Owner;Purchase;Warranty;Price',
    'CSV-1;Imported laptop;Dell;CSV-SN-1;laptop;in_stock;Brand New Room;;01.03.2025;2028-03-01;999,90',
    'CSV-2;Imported monitor;LG;CSV-SN-2;monitor;in_stock;HQ · Server room;;;;',
    ';Missing number;;CSV-SN-3;;;;;;;',
    'CSV-4;Dup serial;;DEMO-SN-0001;;;;;;;',
    'CSV-5;Bad status;;CSV-SN-5;laptop;nonsense;;;;;',
    'CSV-1;Dup in file;;CSV-SN-6;;;;;;;',
  ].join('\r\n');
  const csvFile = writeFixture('import-test.csv', '﻿' + csv);
  await page.getByTestId('csv-input').setInputFiles(csvFile);
  await page.waitForSelector('[data-testid=plan-valid]', { timeout: T }).catch(async (e) => {
    throw new Error(`${e.message.split('\n')[0]} | mapping: ${(await page.evaluate(() => [...document.querySelectorAll('select[id^=map-]')].map((s) => `${s.id.slice(4)}=${s.value}`).join(' ')))} | banners: ${(await page.locator('.banner').allInnerTexts()).join(' / ').replace(/\s+/g, ' ')} | errors: ${errors.join(' ; ')}`);
  });
  check('7.8 delimiter (;) and BOM are detected; columns auto-mapped', (await page.locator('#map-inventory_number').inputValue()) === '0' && (await page.locator('#map-cost').inputValue()) === '10');
  check('7.9 preview: 2 valid rows, 4 rows with errors', (await page.getByTestId('plan-valid').innerText()).startsWith('2 valid') && (await page.getByTestId('plan-errors').innerText()).startsWith('4 rows'));
  const problems = await page.locator('tr.row-error').allInnerTexts();
  const flat = problems.join(' | ');
  check('7.10 each problem names its column and reason', flat.includes('inventory_number') && flat.includes('serial_number') && flat.includes('status') && flat.includes('already'));
  check('7.11 nothing imported before confirming', (await readStore(page, 'assets')).length === 25);
  await page.getByTestId('csv-import').click();
  await page.waitForSelector('[data-testid=done-imported]', { timeout: T });
  check('7.12 result: 2 imported, 4 skipped', (await page.getByTestId('done-imported').innerText()) === '2' && (await page.getByTestId('done-skipped').innerText()) === '4');
  const now = await readStore(page, 'assets');
  const csv1 = now.find((a) => a.inventoryNumber === 'CSV-1');
  check('7.13 imported values are right (date DD.MM.YYYY, decimal comma, new location created)', csv1.purchaseDate === '2025-03-01' && csv1.cost === 999.9 && !!csv1.locationId && (await readStore(page, 'locations')).some((l) => l.name === 'Brand New Room'));
  check('7.14 invalid rows were not imported', !now.some((a) => a.serialNumber === 'CSV-SN-3' || a.serialNumber === 'CSV-SN-5'));
  check('7.15 import was logged', (await readStore(page, 'activity')).some((e) => e.type === 'data.imported' && e.params.assets === 2));

  // CSV export
  await goto(page, '#/assets?q=CSV-');
  await page.waitForSelector('table.table');
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-assets-csv').click()]);
  const exported = readText(await saveDownload(csvDl, 'assets-export-test.csv'));
  check('7.16 CSV export contains only the filtered rows, with BOM and header', exported.startsWith('﻿inventory_number,name') && exported.includes('CSV-1') && !exported.includes('DEMO-0001'));
  // template
  await goto(page, '#/import');
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV template' }).click()]);
  check('7.17 import template downloads', tpl.suggestedFilename() === 'assets-template.csv');

  // language & theme
  await goto(page, '#/');
  await page.locator('.topbar .segmented button', { hasText: 'UK' }).click();
  await settle(page);
  check('7.18 switching to Ukrainian translates the UI', (await page.locator('.sidebar').innerText()).includes('Активи') && (await page.locator('h1').innerText()) === 'Дашборд');
  await goto(page, '#/assets');
  const sub = (await page.locator('.page-header__sub').innerText()).trim();
  check('7.20 plural uses the right Ukrainian form', /^27 активів$/.test(sub), sub);
  await page.reload();
  await page.waitForSelector('.sidebar');
  check('7.21 language persists after reload', (await page.locator('html').getAttribute('lang')) === 'uk' && (await page.locator('.sidebar').innerText()).includes('Активи'));
  await page.locator('.topbar .segmented button', { hasText: 'EN' }).click();
  await page.locator('.topbar .segmented button[aria-label="Dark"]').click();
  await settle(page);
  check('7.22 dark theme sets data-theme and the dark palette', (await page.locator('html').getAttribute('data-theme')) === 'dark' && (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(12, 16, 23)');
  await page.reload();
  await page.waitForSelector('.sidebar');
  check('7.23 theme persists after reload', (await page.locator('html').getAttribute('data-theme')) === 'dark');
  await page.screenshot({ path: `${OUT}/dark-dashboard.png`, fullPage: false });
  await page.locator('.topbar .segmented button[aria-label="System"]').click();
  allErrors.push(...errors.map((e) => `[7] ${e}`));
  await context.close();

  // OS dark preference with default "system" theme
  const dark = await newPage(browser, { colorScheme: 'dark' });
  await startEmpty(dark.page);
  check('7.24 "system" theme follows the OS dark preference', (await dark.page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(12, 16, 23)');
  await dark.context.close();
}

/* ================= 8. routing & GitHub Pages ================= */
async function scenarioRouting() {
  const { context, page, errors } = await newPage(browser);
  const failed = [];
  const foreign = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:4173/') && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u); });
  await startDemo(page);
  const asset = (await readStore(page, 'assets'))[0];
  await goto(page, `#/assets/${asset.id}`);
  await page.reload();
  await page.waitForSelector('h1');
  check('8.1 deep link to an asset survives a page refresh', (await page.locator('h1').innerText()) === asset.name);
  await goto(page, '#/does/not/exist');
  check('8.2 unknown route shows a not-found page', (await page.locator('main').innerText()).includes('Page not found'));
  await goto(page, '#/assets/nope');
  check('8.3 unknown asset id shows a friendly message', (await page.locator('main').innerText()).includes('Asset not found'));
  await page.locator('.sidebar a', { hasText: 'People' }).click();
  check('8.4 sidebar navigation changes the route', page.url().endsWith('#/people'));
  check('8.5 every asset the app requested loaded under the subpath (no 4xx)', failed.filter((f) => !f.includes('favicon')).length === 0, failed.join(' | '));
  const r = await page.request.get(`${BASE}legacy/v1.1/`);
  check('8.6 previous version is still served at ./legacy/v1.1/', r.status() === 200 && (await r.text()).includes('Inventory Management'));
  const root = await page.request.get('http://127.0.0.1:4173/');
  check('8.7 app is only reachable under the repository subpath (like GitHub Pages project sites)', root.status() === 404);
  const html = await (await page.request.get(BASE)).text();
  check('8.8 built HTML references only relative assets (./assets/...)', /(src|href)="\.\/assets\//.test(html) && !/(src|href)="\/(?!\/)/.test(html));
  await goto(page, '#/settings');
  await goto(page, '#/import');
  check('8.9 no network requests to other hosts (fully self-contained)', foreign.length === 0, foreign.join(' | '));
  allErrors.push(...errors.map((e) => `[8] ${e}`));
  await context.close();
}

/* ================= 9. responsive + print ================= */
async function scenarioResponsive() {
  const sizes = [['desktop', 1366, 800], ['tablet', 768, 1024], ['mobile', 375, 812], ['small', 320, 640]];
  for (const [name, w, h] of sizes) {
    const { context, page, errors } = await newPage(browser, { viewport: { width: w, height: h } });
    await startDemo(page);
    const asset = (await readStore(page, 'assets')).find((a) => a.assigneeId);
    const person = (await readStore(page, 'people'))[0];
    const routes = [['dashboard', '#/'], ['assets', '#/assets'], ['asset', `#/assets/${asset.id}`], ['people', '#/people'], ['person', `#/people/${person.id}`], ['maintenance', '#/maintenance?status=all'], ['locations', '#/locations'], ['activity', '#/activity'], ['settings', '#/settings'], ['import', '#/import']];
    for (const [rn, hash] of routes) {
      await goto(page, hash);
      await page.waitForSelector('h1', { timeout: T });
      await settle(page);
      const o = await noHorizontalOverflow(page);
      check(`9.1 ${name} ${w}px · ${rn}: no horizontal page overflow`, o.ok, `scroll=${o.scrollWidth} client=${o.clientWidth}`);
      if (['dashboard', 'assets', 'asset', 'person'].includes(rn)) await page.screenshot({ path: `${OUT}/${name}-${rn}.png`, fullPage: true });
    }
    if (w < 900) {
      await goto(page, '#/');
      const sidebar = page.locator('.sidebar');
      const hiddenBefore = !(await sidebar.evaluate((el) => el.getBoundingClientRect().right > 0));
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.waitForTimeout(450); // CSS transition is 200ms
      const visible = await sidebar.evaluate((el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right > 0);
      check(`9.2 ${name}: sidebar is a drawer that opens from the menu button`, hiddenBefore && visible);
      await page.locator('.sidebar a', { hasText: 'Assets' }).click();
      await page.waitForTimeout(450);
      check(`9.3 ${name}: navigating closes the drawer`, !(await sidebar.evaluate((el) => el.getBoundingClientRect().right > 0)));
      await goto(page, '#/assets');
      await page.waitForSelector('tbody tr');
      const cards = await page.evaluate(() => getComputedStyle(document.querySelector('thead')).position === 'absolute');
      check(`9.4 ${name}: table becomes labelled cards`, cards && (await page.locator('tbody td[data-label]').count()) > 0);
      // tap targets: primary header buttons visible and inside viewport
      const off = await page.evaluate(() => [...document.querySelectorAll('.page-header__actions .btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length);
      check(`9.5 ${name}: page action buttons are inside the viewport`, off === 0);
    } else {
      await goto(page, '#/assets');
      await page.waitForSelector('tbody tr');
      check(`9.6 ${name}: sidebar is persistent`, await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().left === 0));
    }
    allErrors.push(...errors.map((e) => `[9 ${name}] ${e}`));
    await context.close();
  }
  // print
  const { context, page } = await newPage(browser);
  await startDemo(page);
  const asset = (await readStore(page, 'assets'))[0];
  await goto(page, `#/assets/${asset.id}`);
  await page.emulateMedia({ media: 'print' });
  const hidden = await page.evaluate(() => ['.sidebar', '.topbar'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none') && getComputedStyle(document.querySelector('.print-only')).display !== 'none');
  check('9.7 print layout hides navigation and shows the asset card title', hidden);
  await context.close();
}

/* ================= 10. persistence & misc ================= */
async function scenarioMisc() {
  const { context, page, errors } = await newPage(browser);
  await startDemo(page);
  await goto(page, '#/activity');
  await page.waitForSelector('.timeline');
  check('10.1 activity page shows the "no user identity" notice', (await page.locator('main').innerText()).includes('not who did it'));
  await page.locator('select[aria-label="Type of object"]').selectOption('ticket');
  await settle(page);
  check('10.2 activity filter by type', (await page.locator('.timeline li').count()) === 5);
  await goto(page, '#/locations');
  await page.getByTestId('add-location').click();
  await field(page, 'name').fill('HQ · Server room');
  await page.getByTestId('location-save').click();
  check('10.3 duplicate location name rejected', (await dialogHas(page, 'already used')));
  await field(page, 'name').fill('New annex');
  await page.getByTestId('location-save').click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: T });
  check('10.4 location created', (await readStore(page, 'locations')).some((l) => l.name === 'New annex'));
  await page.getByTestId('delete-location').first().click();
  await page.getByTestId('confirm-yes').click();
  await settle(page);
  check('10.5 a location used by assets cannot be deleted (still 6, error shown)', (await readStore(page, 'locations')).length === 6 && (await toast(page)).includes('still used'));
  await goto(page, '#/settings');
  await page.getByTestId('warranty-days').fill('90');
  await goto(page, '#/');
  check('10.6 the warranty threshold setting changes the dashboard label', (await page.locator('.kpi__label', { hasText: 'Warranty ends in' }).innerText()).includes('90'));
  // persistence of everything across a hard reload
  const before = (await readStore(page, 'assets')).length;
  await page.reload();
  await page.waitForSelector('[data-testid=kpis]');
  check('10.7 data persists across reload', (await readStore(page, 'assets')).length === before);
  allErrors.push(...errors.map((e) => `[10] ${e}`));
  await context.close();
}

const SCENARIOS = [['first run', scenarioFirstRun], ['demo', scenarioDemo], ['migration', scenarioMigration], ['assets', scenarioAssets], ['people', scenarioPeople], ['maintenance', scenarioMaintenance], ['data', scenarioData], ['routing', scenarioRouting], ['responsive', scenarioResponsive], ['misc', scenarioMisc]];
const only = process.argv[2];
try {
  for (const [name, fn] of SCENARIOS) {
    if (only && !name.startsWith(only)) continue;
    console.log(`▶ ${name}`);
    try { await fn(); } catch (e) { check(`SCENARIO ${name} crashed`, false, e.stack?.split('\n').slice(0, 4).join(' | ') ?? String(e)); }
  }
  check('11.1 no uncaught exceptions or console errors in any scenario', allErrors.length === 0, allErrors.slice(0, 5).join(' || '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`FAIL  ${f.name}  ${f.detail}`);
process.exit(failed.length ? 1 : 0);

