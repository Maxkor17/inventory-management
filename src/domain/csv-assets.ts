import { toCsv, unguardCsvCell } from './csv';
import { ASSET_STATUSES, CATEGORIES } from './enums';
import type { AssetStatus, Category } from './enums';
import { fullName } from './people';
import type { Asset, AssetInput, Errors, Location, Person } from './types';
import { isRealDate, normText } from './util';
import { validateAssetInput } from './validation';

/** CSV columns (English codes; independent of the UI language so files stay portable). */
export const ASSET_CSV_FIELDS = [
  'inventory_number', 'name', 'manufacturer', 'model', 'serial_number', 'category', 'status', 'location', 'assignee',
  'purchase_date', 'commissioned_date', 'warranty_end_date', 'supplier', 'cost', 'description', 'notes',
] as const;
export type CsvField = (typeof ASSET_CSV_FIELDS)[number];

export const REQUIRED_CSV_FIELDS: readonly CsvField[] = ['inventory_number', 'name'];

/* ---------------- export ---------------- */
export function assetsToCsv(assets: readonly Asset[], people: readonly Person[], locations: readonly Location[]): string {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const rows: (string | number | null)[][] = [[...ASSET_CSV_FIELDS]];
  for (const a of assets) {
    const holder = a.assigneeId ? peopleById.get(a.assigneeId) : undefined;
    rows.push([
      a.inventoryNumber, a.name, a.manufacturer, a.model, a.serialNumber, a.category, a.status,
      a.locationId ? locById.get(a.locationId)?.name ?? '' : '', holder ? holder.email || fullName(holder) : '',
      a.purchaseDate, a.commissionedDate, a.warrantyEndDate, a.supplier, a.cost, a.description, a.notes,
    ]);
  }
  return toCsv(rows);
}

/** A header-only file users can fill in. */
export const assetCsvTemplate = (): string =>
  toCsv([[...ASSET_CSV_FIELDS], ['IT-000123', 'Laptop', 'Dell', 'Latitude 5440', 'SN12345', 'laptop', 'in_stock', 'HQ Floor 2', '', '2025-03-01', '2025-03-05', '2028-03-01', 'Comfy', 1200, '', '']]);

/* ---------------- import: column mapping ---------------- */
export type ColumnMapping = Partial<Record<CsvField, number>>;

const ALIASES: Record<CsvField, string[]> = {
  inventory_number: ['inventory_number', 'inventory_no', 'inventory', 'inv_number', 'asset_tag', 'asset_number', 'tag'],
  name: ['name', 'device', 'device_name', 'asset', 'asset_name', 'title'],
  manufacturer: ['manufacturer', 'vendor', 'brand', 'make'],
  model: ['model'],
  serial_number: ['serial_number', 'serial', 'serial_no', 'sn'],
  category: ['category', 'type', 'asset_type'],
  status: ['status', 'state'],
  location: ['location', 'office', 'room', 'place'],
  assignee: ['assignee', 'owner', 'responsible', 'holder', 'assigned_to', 'employee', 'user'],
  purchase_date: ['purchase_date', 'purchased', 'purchase', 'date_purchased', 'bought'],
  commissioned_date: ['commissioned_date', 'commissioned', 'in_service', 'in_service_date', 'start_date'],
  warranty_end_date: ['warranty_end_date', 'warranty_end', 'warranty', 'warranty_until', 'warranty_expiration'],
  supplier: ['supplier', 'seller', 'vendor_name'],
  cost: ['cost', 'price', 'value', 'amount'],
  description: ['description', 'desc'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

const headerKey = (h: string): string => h.trim().toLowerCase().replace(/[\s\-./]+/g, '_').replace(/^_+|_+$/g, '');

export function autoMapColumns(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const keys = header.map(headerKey);
  for (const field of ASSET_CSV_FIELDS) {
    const idx = keys.findIndex((k, i) => ALIASES[field].includes(k) && !Object.values(mapping).includes(i));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

/* ---------------- import: parsing + validation ---------------- */
export interface PlannedRow {
  /** 1-based line number in the file (header = line 1). */
  line: number;
  raw: string[];
  input: AssetInput;
  locationName: string;
  errors: Errors;
}

export interface CsvImportPlan {
  rows: PlannedRow[];
  validCount: number;
  errorCount: number;
  /** Location names used by valid rows that do not exist yet. */
  missingLocations: string[];
}

const enumKey = (s: string): string => s.trim().toLowerCase().replace(/[\s\-]+/g, '_');

function parseEnum<T extends string>(list: readonly T[], raw: string, fallback: T): T | null {
  if (!raw) return fallback;
  const k = enumKey(raw);
  return (list as readonly string[]).includes(k) ? (k as T) : null;
}

function parseDate(raw: string): string | null {
  if (!raw) return '';
  if (isRealDate(raw)) return raw;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw); // DD.MM.YYYY
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    if (isRealDate(iso)) return iso;
  }
  return null;
}

export function planAssetCsvImport(
  dataRows: readonly string[][],
  mapping: ColumnMapping,
  ref: { assets: readonly Asset[]; people: readonly Person[]; locations: readonly Location[] },
): CsvImportPlan {
  const locByName = new Map(ref.locations.map((l) => [normText(l.name), l]));
  const personByEmail = new Map(ref.people.filter((p) => p.email).map((p) => [normText(p.email), p]));
  const personByName = new Map(ref.people.map((p) => [normText(fullName(p)), p]));

  // Assets accepted so far in this file, so duplicates *within* the file are caught too.
  const simulated: Asset[] = [...ref.assets];
  const rows: PlannedRow[] = [];
  const missing = new Set<string>();

  dataRows.forEach((raw, i) => {
    const cell = (f: CsvField): string => {
      const idx = mapping[f];
      return idx === undefined ? '' : unguardCsvCell((raw[idx] ?? '').trim());
    };
    const errors: Errors = {};

    const assignee = cell('assignee');
    let assigneeId: string | null = null;
    if (assignee) {
      const p = personByEmail.get(normText(assignee)) ?? personByName.get(normText(assignee));
      if (!p) errors.assignee = 'unknown_person';
      else if (p.status !== 'active') errors.assignee = 'person_inactive';
      else assigneeId = p.id;
    }

    const category = parseEnum<Category>(CATEGORIES, cell('category'), 'other');
    if (category === null) errors.category = 'invalid_enum';
    const status = parseEnum<AssetStatus>(ASSET_STATUSES, cell('status'), assigneeId ? 'in_use' : 'in_stock');
    if (status === null) errors.status = 'invalid_enum';

    const dates: Record<'purchase_date' | 'commissioned_date' | 'warranty_end_date', string> = { purchase_date: '', commissioned_date: '', warranty_end_date: '' };
    for (const f of ['purchase_date', 'commissioned_date', 'warranty_end_date'] as const) {
      const d = parseDate(cell(f));
      if (d === null) errors[f] = 'invalid_date'; else dates[f] = d;
    }

    let cost: number | null = null;
    const costRaw = cell('cost').replace(',', '.');
    if (costRaw) {
      const n = Number(costRaw);
      if (!Number.isFinite(n) || n < 0) errors.cost = 'invalid_number'; else cost = n;
    }

    const locationName = cell('location').replace(/\s+/g, ' ');
    const input: AssetInput = {
      inventoryNumber: cell('inventory_number'), name: cell('name'), manufacturer: cell('manufacturer'), model: cell('model'),
      serialNumber: cell('serial_number'), category: category ?? 'other', status: status ?? 'in_stock', locationId: null, assigneeId,
      purchaseDate: dates.purchase_date, commissionedDate: dates.commissioned_date, warrantyEndDate: dates.warranty_end_date,
      supplier: cell('supplier'), cost, description: cell('description'), notes: cell('notes'),
    };

    // Reuse the exact same rules as the asset form (required fields, uniqueness, date order, status/holder).
    const checked = validateAssetInput(input, { assets: simulated, people: ref.people, locations: ref.locations });
    if (!checked.ok) {
      for (const [k, v] of Object.entries(checked.errors)) {
        const csvKey = ({ inventoryNumber: 'inventory_number', serialNumber: 'serial_number', warrantyEndDate: 'warranty_end_date', purchaseDate: 'purchase_date', commissionedDate: 'commissioned_date', assigneeId: 'assignee' } as Record<string, string>)[k] ?? k;
        if (!(csvKey in errors)) errors[csvKey] = v;
      }
    } else if (input.status === 'in_use' && !input.assigneeId) {
      errors.assignee = 'in_use_requires_assignee';
    } else if (['in_stock', 'retired', 'lost'].includes(input.status) && input.assigneeId) {
      errors.assignee = 'status_conflicts_with_assignee';
    }

    if (!Object.keys(errors).length) {
      if (locationName && !locByName.has(normText(locationName))) missing.add(locationName);
      simulated.push({
        ...input, id: `plan-${i}`, isDemo: false, createdAt: '', updatedAt: '',
      } as Asset);
    }
    rows.push({ line: i + 2, raw: [...raw], input, locationName, errors });
  });

  const errorCount = rows.filter((r) => Object.keys(r.errors).length).length;
  const seenMissing = new Map<string, string>();
  for (const m of missing) if (!seenMissing.has(normText(m))) seenMissing.set(normText(m), m);
  return { rows, validCount: rows.length - errorCount, errorCount, missingLocations: [...seenMissing.values()] };
}
