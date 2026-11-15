import { ASSET_STATUSES, CATEGORIES, PERSON_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES, isOneOf } from './enums';
import type {
  Asset, AssetInput, Errors, Location, LocationInput, Person, PersonInput, Result, TicketInput,
} from './types';
import { fail, ok } from './types';
import { isRealDate, normText } from './util';

export const MAX_SHORT = 200;
export const MAX_LONG = 5000;

export interface RefData {
  assets: readonly Asset[];
  people: readonly Person[];
  locations: readonly Location[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- small helpers ---------- */
const trim = (s: string): string => s.trim();

function requireText(errors: Errors, field: string, value: string, max = MAX_SHORT): void {
  if (!value) errors[field] = 'required';
  else if (value.length > max) errors[field] = 'too_long';
}
function optionalText(errors: Errors, field: string, value: string, max = MAX_SHORT): void {
  if (value.length > max) errors[field] = 'too_long';
}
function optionalDate(errors: Errors, field: string, value: string): void {
  if (value !== '' && !isRealDate(value)) errors[field] = 'invalid_date';
}
function optionalCost(errors: Errors, field: string, value: number | null): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) errors[field] = 'invalid_number';
}

/* ---------- asset ---------- */
export interface AssetValidationOptions {
  /** Asset being edited (excluded from uniqueness checks). */
  selfId?: string;
  /** Holder before the edit — an inactive person is tolerated only if unchanged. */
  currentAssigneeId?: string | null;
}

export function validateAssetInput(
  raw: AssetInput,
  ref: RefData,
  opts: AssetValidationOptions = {},
): Result<AssetInput> {
  const v: AssetInput = {
    ...raw,
    inventoryNumber: trim(raw.inventoryNumber),
    name: trim(raw.name),
    manufacturer: trim(raw.manufacturer),
    model: trim(raw.model),
    serialNumber: trim(raw.serialNumber),
    supplier: trim(raw.supplier),
    description: trim(raw.description),
    notes: trim(raw.notes),
    purchaseDate: trim(raw.purchaseDate),
    commissionedDate: trim(raw.commissionedDate),
    warrantyEndDate: trim(raw.warrantyEndDate),
  };
  const errors: Errors = {};

  requireText(errors, 'inventoryNumber', v.inventoryNumber);
  requireText(errors, 'name', v.name);
  optionalText(errors, 'manufacturer', v.manufacturer);
  optionalText(errors, 'model', v.model);
  optionalText(errors, 'serialNumber', v.serialNumber);
  optionalText(errors, 'supplier', v.supplier);
  optionalText(errors, 'description', v.description, MAX_LONG);
  optionalText(errors, 'notes', v.notes, MAX_LONG);

  if (!errors.inventoryNumber) {
    const key = normText(v.inventoryNumber);
    if (ref.assets.some((a) => a.id !== opts.selfId && normText(a.inventoryNumber) === key)) {
      errors.inventoryNumber = 'duplicate_inventory_number';
    }
  }
  if (v.serialNumber && !errors.serialNumber) {
    const key = normText(v.serialNumber);
    if (ref.assets.some((a) => a.id !== opts.selfId && a.serialNumber && normText(a.serialNumber) === key)) {
      errors.serialNumber = 'duplicate_serial';
    }
  }

  if (!isOneOf(CATEGORIES, v.category)) errors.category = 'invalid_enum';
  if (!isOneOf(ASSET_STATUSES, v.status)) errors.status = 'invalid_enum';

  if (v.locationId !== null && !ref.locations.some((l) => l.id === v.locationId)) errors.locationId = 'unknown_location';

  if (v.assigneeId !== null) {
    const person = ref.people.find((p) => p.id === v.assigneeId);
    if (!person) errors.assigneeId = 'unknown_person';
    else if (person.status !== 'active' && v.assigneeId !== opts.currentAssigneeId) errors.assigneeId = 'person_inactive';
  }

  optionalDate(errors, 'purchaseDate', v.purchaseDate);
  optionalDate(errors, 'commissionedDate', v.commissionedDate);
  optionalDate(errors, 'warrantyEndDate', v.warrantyEndDate);
  if (!errors.commissionedDate && !errors.purchaseDate && v.purchaseDate && v.commissionedDate && v.commissionedDate < v.purchaseDate) {
    errors.commissionedDate = 'date_before_purchase';
  }
  if (!errors.warrantyEndDate && !errors.purchaseDate && v.purchaseDate && v.warrantyEndDate && v.warrantyEndDate < v.purchaseDate) {
    errors.warrantyEndDate = 'date_before_purchase';
  }
  optionalCost(errors, 'cost', v.cost);

  return Object.keys(errors).length ? fail(errors) : ok(v);
}

/* ---------- person ---------- */
export function validatePersonInput(
  raw: PersonInput,
  ref: Pick<RefData, 'people' | 'locations'>,
  opts: { selfId?: string } = {},
): Result<PersonInput> {
  const v: PersonInput = {
    ...raw,
    firstName: trim(raw.firstName),
    lastName: trim(raw.lastName),
    position: trim(raw.position),
    department: trim(raw.department),
    email: trim(raw.email),
    phone: trim(raw.phone),
    startDate: trim(raw.startDate),
    notes: trim(raw.notes),
  };
  const errors: Errors = {};

  requireText(errors, 'firstName', v.firstName);
  requireText(errors, 'lastName', v.lastName);
  optionalText(errors, 'position', v.position);
  optionalText(errors, 'department', v.department);
  optionalText(errors, 'phone', v.phone, 50);
  optionalText(errors, 'notes', v.notes, MAX_LONG);

  if (v.email) {
    if (!EMAIL_RE.test(v.email) || v.email.length > MAX_SHORT) errors.email = 'invalid_email';
    else if (ref.people.some((p) => p.id !== opts.selfId && p.email && normText(p.email) === normText(v.email))) {
      errors.email = 'duplicate_email';
    }
  }
  if (v.locationId !== null && !ref.locations.some((l) => l.id === v.locationId)) errors.locationId = 'unknown_location';
  optionalDate(errors, 'startDate', v.startDate);

  return Object.keys(errors).length ? fail(errors) : ok(v);
}

/* ---------- location ---------- */
export function validateLocationInput(
  raw: LocationInput,
  ref: Pick<RefData, 'locations'>,
  opts: { selfId?: string } = {},
): Result<LocationInput> {
  const v: LocationInput = { name: trim(raw.name).replace(/\s+/g, ' '), description: trim(raw.description) };
  const errors: Errors = {};
  requireText(errors, 'name', v.name);
  optionalText(errors, 'description', v.description, MAX_LONG);
  if (!errors.name && ref.locations.some((l) => l.id !== opts.selfId && normText(l.name) === normText(v.name))) {
    errors.name = 'duplicate_name';
  }
  return Object.keys(errors).length ? fail(errors) : ok(v);
}

/* ---------- ticket ---------- */
export function validateTicketInput(
  raw: TicketInput,
  ref: Pick<RefData, 'assets' | 'people'>,
): Result<TicketInput> {
  const v: TicketInput = {
    ...raw,
    title: trim(raw.title),
    problem: trim(raw.problem),
    workDone: trim(raw.workDone),
  };
  const errors: Errors = {};
  if (!v.assetId) errors.assetId = 'required';
  else if (!ref.assets.some((a) => a.id === v.assetId)) errors.assetId = 'unknown_asset';
  requireText(errors, 'title', v.title);
  requireText(errors, 'problem', v.problem, MAX_LONG);
  optionalText(errors, 'workDone', v.workDone, MAX_LONG);
  if (!isOneOf(TICKET_PRIORITIES, v.priority)) errors.priority = 'invalid_enum';
  if (v.specialistId !== null && !ref.people.some((p) => p.id === v.specialistId)) errors.specialistId = 'unknown_person';
  optionalCost(errors, 'cost', v.cost);
  return Object.keys(errors).length ? fail(errors) : ok(v);
}

// Re-exported so UI code has a single import point for enum lists used in selects.
export { ASSET_STATUSES, CATEGORIES, PERSON_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES };
