import type { AssetStatus, Category, EndReason } from './enums';
import type { ActivityEvent, Asset, Assignment, Location, Person } from './types';
import { isRealDate, normText } from './util';

/**
 * Converts data written by the previous apps (v1.0 / v1.1: flat "devices" with a free-text
 * owner and location) into the v2 entities. Everything here is pure: ids and the clock are
 * injected so the result is deterministic and testable.
 */

export const LEGACY_STORAGE_KEYS = {
  v2: 'inventoryManagement.devices.v2',
  v1: 'inventoryManagement.devices.v1',
} as const;

export interface LegacyDevice {
  id: string | null;
  name: string;
  model: string;
  serial: string;
  category: Category;
  status: AssetStatus;
  owner: string;
  location: string;
  purchaseDate: string;
  warrantyDate: string;
}

export interface LegacyParseResult {
  devices: LegacyDevice[];
  /** Records that were unusable (they stay untouched in the source). */
  invalid: { index: number; reason: string }[];
  /** Later records repeating an earlier serial number (case-insensitive). */
  duplicateSerials: string[];
  sourceVersion: number | null;
}

export class LegacyParseError extends Error {
  constructor(public readonly code: 'invalid_json' | 'invalid_structure' | 'newer_version') {
    super(code);
    this.name = 'LegacyParseError';
  }
}

const LEGACY_CATEGORIES: Record<string, Category> = {
  laptop: 'laptop', desktop: 'desktop', monitor: 'monitor', 'network equipment': 'network_equipment',
  printer: 'printer', 'mobile device': 'mobile_device', other: 'other',
};
const LEGACY_STATUSES: Record<string, AssetStatus> = {
  'in use': 'in_use', 'in stock': 'in_stock', 'under repair': 'under_repair', retired: 'retired',
};

const labelKey = (s: string): string => s.trim().toLowerCase().replace(/_/g, ' ');

function optionalString(v: unknown): string | null {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v.trim() : null;
}

/** Mirrors the validation rules of the v1.1 app. Returns a device or a reason string. */
export function normalizeLegacyRecord(raw: unknown): LegacyDevice | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'not an object';
  const r = raw as Record<string, unknown>;
  for (const key of ['name', 'model', 'serial'] as const) {
    if (typeof r[key] !== 'string' || !(r[key] as string).trim()) return `${key} is required`;
  }
  const owner = optionalString(r.owner);
  const location = optionalString(r.location);
  const purchaseDate = optionalString(r.purchaseDate);
  const warrantyDate = optionalString(r.warrantyDate);
  if (owner === null) return 'owner must be text';
  if (location === null) return 'location must be text';
  if (purchaseDate === null || (purchaseDate !== '' && !isRealDate(purchaseDate))) return 'invalid purchase date';
  if (warrantyDate === null || (warrantyDate !== '' && !isRealDate(warrantyDate))) return 'invalid warranty date';

  let category: Category = 'other';
  if (r.category !== undefined && r.category !== null) {
    const c = typeof r.category === 'string' ? LEGACY_CATEGORIES[labelKey(r.category)] : undefined;
    if (!c) return 'unknown category';
    category = c;
  }
  let status: AssetStatus = owner ? 'in_use' : 'in_stock';
  if (r.status !== undefined && r.status !== null) {
    const s = typeof r.status === 'string' ? LEGACY_STATUSES[labelKey(r.status)] : undefined;
    if (!s) return 'unknown status';
    status = s;
  }

  return {
    id: typeof r.id === 'string' && r.id ? r.id : null,
    name: (r.name as string).trim(),
    model: (r.model as string).trim(),
    serial: (r.serial as string).trim(),
    category, status, owner, location, purchaseDate, warrantyDate,
  };
}

/** Accepts a v1/v1.1 export object, a plain array, or the raw LocalStorage value. */
export function parseLegacyJson(text: string): LegacyParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new LegacyParseError('invalid_json');
  }

  let list: unknown[];
  let sourceVersion: number | null = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as { devices?: unknown }).devices)) {
    const obj = data as { version?: unknown; devices: unknown[] };
    if (obj.version !== undefined) {
      if (typeof obj.version !== 'number' || obj.version < 1) throw new LegacyParseError('invalid_structure');
      if (obj.version > 2) throw new LegacyParseError('newer_version');
      sourceVersion = obj.version;
    }
    list = obj.devices;
  } else {
    throw new LegacyParseError('invalid_structure');
  }

  const devices: LegacyDevice[] = [];
  const invalid: { index: number; reason: string }[] = [];
  const duplicateSerials: string[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const result = normalizeLegacyRecord(item);
    if (typeof result === 'string') { invalid.push({ index, reason: result }); return; }
    const key = normText(result.serial);
    if (seen.has(key)) { duplicateSerials.push(result.serial); return; }
    seen.add(key);
    devices.push(result);
  });
  return { devices, invalid, duplicateSerials, sourceVersion };
}

/* ---------------- migration plan ---------------- */

export interface ExistingData {
  assets: readonly Asset[];
  people: readonly Person[];
  locations: readonly Location[];
}

export interface MigrationReport {
  devicesRead: number;
  assetsToCreate: number;
  /** Serial numbers skipped because an asset with that serial already exists. */
  skippedExistingSerial: string[];
  peopleToCreate: number;
  peopleMatched: number;
  locationsToCreate: number;
  locationsMatched: number;
  /** Owner names that could not be split into first + last name. */
  ambiguousNames: string[];
  /** Data that does not satisfy the v2 rules; kept as-is and listed for review. */
  inconsistent: { serial: string; issue: 'in_use_without_owner' | 'in_stock_had_owner' }[];
}

export interface MigrationPlan {
  assets: Asset[];
  people: Person[];
  locations: Location[];
  assignments: Assignment[];
  activity: ActivityEvent[];
  report: MigrationReport;
}

export interface PlanDeps {
  id: () => string;
  now: () => string;
}

const INVENTORY_PREFIX = 'IT-';

export function nextInventoryNumberStart(assets: readonly { inventoryNumber: string }[]): number {
  let max = 0;
  for (const a of assets) {
    const m = /^IT-(\d+)$/i.exec(a.inventoryNumber.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export function formatInventoryNumber(n: number): string {
  return INVENTORY_PREFIX + String(n).padStart(6, '0');
}

export function splitName(full: string): { firstName: string; lastName: string; ambiguous: boolean } {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { firstName: tokens[0] ?? '', lastName: '', ambiguous: true };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(' '), ambiguous: false };
}

export function planLegacyMigration(devices: readonly LegacyDevice[], existing: ExistingData, deps: PlanDeps): MigrationPlan {
  const now = deps.now();
  const report: MigrationReport = {
    devicesRead: devices.length, assetsToCreate: 0, skippedExistingSerial: [], peopleToCreate: 0, peopleMatched: 0,
    locationsToCreate: 0, locationsMatched: 0, ambiguousNames: [], inconsistent: [],
  };

  const usedAssetIds = new Set(existing.assets.map((a) => a.id));
  const serials = new Set(existing.assets.filter((a) => a.serialNumber).map((a) => normText(a.serialNumber)));
  let inventoryCounter = nextInventoryNumberStart(existing.assets);

  const locationsByKey = new Map<string, Location>(existing.locations.map((l) => [normText(l.name), l]));
  const peopleByKey = new Map<string, Person>(existing.people.map((p) => [normText(`${p.firstName} ${p.lastName}`), p]));
  const matchedLocations = new Set<string>();
  const matchedPeople = new Set<string>();

  const plan: MigrationPlan = { assets: [], people: [], locations: [], assignments: [], activity: [], report };

  const ensureLocation = (text: string): string | null => {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    const key = normText(clean);
    let loc = locationsByKey.get(key);
    if (loc) {
      if (existing.locations.some((l) => l.id === loc!.id)) matchedLocations.add(loc.id);
      return loc.id;
    }
    loc = { id: deps.id(), name: clean, description: '', isDemo: false, createdAt: now, updatedAt: now };
    locationsByKey.set(key, loc);
    plan.locations.push(loc);
    return loc.id;
  };

  const ensurePerson = (text: string): string | null => {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    const key = normText(clean);
    let person = peopleByKey.get(key);
    if (person) {
      if (existing.people.some((p) => p.id === person!.id)) matchedPeople.add(person.id);
      return person.id;
    }
    const { firstName, lastName, ambiguous } = splitName(clean);
    if (ambiguous) report.ambiguousNames.push(clean);
    person = {
      id: deps.id(), firstName, lastName, position: '', department: '', email: '', phone: '', locationId: null,
      status: 'active', startDate: '', deactivatedAt: null,
      notes: ambiguous ? `Created from the free-text owner "${clean}" during migration. Please review the name.` : '',
      isDemo: false, createdAt: now, updatedAt: now,
    };
    peopleByKey.set(key, person);
    plan.people.push(person);
    return person.id;
  };

  for (const d of devices) {
    const serialKey = normText(d.serial);
    if (serials.has(serialKey)) { report.skippedExistingSerial.push(d.serial); continue; }
    serials.add(serialKey);

    const locationId = ensureLocation(d.location);
    const personId = ensurePerson(d.owner);

    const id = d.id && !usedAssetIds.has(d.id) ? d.id : deps.id();
    usedAssetIds.add(id);

    let assigneeId: string | null = null;
    let notes = '';
    let assignment: Assignment | null = null;

    if (personId) {
      const closedReason: EndReason | null =
        d.status === 'retired' ? 'asset_retired' : d.status === 'in_stock' ? 'returned_to_stock' : null;
      assignment = {
        id: deps.id(), assetId: id, personId, assignedAt: now,
        returnedAt: closedReason ? now : null, endReason: closedReason,
        note: 'Imported from legacy data', isDemo: false,
      };
      if (closedReason) {
        // v2 rule: retired / in-stock assets have no holder. Keep the legacy owner in the history.
        if (d.status === 'in_stock') {
          notes = `Legacy owner: ${d.owner}`;
          report.inconsistent.push({ serial: d.serial, issue: 'in_stock_had_owner' });
        }
      } else {
        assigneeId = personId;
      }
    } else if (d.status === 'in_use') {
      report.inconsistent.push({ serial: d.serial, issue: 'in_use_without_owner' });
    }

    const asset: Asset = {
      id, inventoryNumber: formatInventoryNumber(inventoryCounter++), name: d.name, manufacturer: '', model: d.model,
      serialNumber: d.serial, category: d.category, status: d.status, locationId, assigneeId,
      purchaseDate: d.purchaseDate, commissionedDate: '', warrantyEndDate: d.warrantyDate,
      supplier: '', cost: null, description: '', notes, isDemo: false, createdAt: now, updatedAt: now,
    };
    plan.assets.push(asset);
    if (assignment) plan.assignments.push(assignment);
    plan.activity.push({
      id: deps.id(), at: now, type: 'asset.imported', entityType: 'asset', entityId: id,
      entityLabel: `${asset.inventoryNumber} · ${asset.name}`, assetId: id, personId,
      changes: [], params: { source: 'legacy' },
    });
  }

  report.assetsToCreate = plan.assets.length;
  report.peopleToCreate = plan.people.length;
  report.peopleMatched = matchedPeople.size;
  report.locationsToCreate = plan.locations.length;
  report.locationsMatched = matchedLocations.size;
  return plan;
}
