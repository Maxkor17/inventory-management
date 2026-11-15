import type {
  ActivityType, AssetStatus, Category, EndReason, EntityType,
  PersonStatus, TicketPriority, TicketStatus,
} from './enums';

/** Dates are plain `YYYY-MM-DD` strings (no timezone); timestamps are ISO-8601 UTC. */
export type DateString = string;
export type Timestamp = string;

export interface Asset {
  id: string;
  inventoryNumber: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  category: Category;
  status: AssetStatus;
  locationId: string | null;
  /** Denormalised current holder. Only the assignment services may change it. */
  assigneeId: string | null;
  purchaseDate: DateString;
  commissionedDate: DateString;
  warrantyEndDate: DateString;
  supplier: string;
  cost: number | null;
  description: string;
  notes: string;
  isDemo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the asset form edits. `assigneeId` is applied through the assignment rules. */
export type AssetInput = Omit<Asset, 'id' | 'isDemo' | 'createdAt' | 'updatedAt'>;

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  locationId: string | null;
  status: PersonStatus;
  startDate: DateString;
  deactivatedAt: Timestamp | null;
  notes: string;
  isDemo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export type PersonInput = Omit<Person, 'id' | 'status' | 'deactivatedAt' | 'isDemo' | 'createdAt' | 'updatedAt'>;

export interface Location {
  id: string;
  name: string;
  description: string;
  isDemo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export type LocationInput = Pick<Location, 'name' | 'description'>;

/** One row of the assignment ledger. Active while `returnedAt` is null. */
export interface Assignment {
  id: string;
  assetId: string;
  personId: string;
  assignedAt: Timestamp;
  returnedAt: Timestamp | null;
  endReason: EndReason | null;
  note: string;
  isDemo: boolean;
}

export interface Ticket {
  id: string;
  assetId: string;
  title: string;
  problem: string;
  priority: TicketPriority;
  status: TicketStatus;
  specialistId: string | null;
  workDone: string;
  cost: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt: Timestamp | null;
  closedAt: Timestamp | null;
  isDemo: boolean;
}
export type TicketInput = Pick<Ticket, 'assetId' | 'title' | 'problem' | 'priority' | 'specialistId' | 'workDone' | 'cost'>;

export interface FieldChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export type EventParams = Record<string, string | number | null>;

/**
 * Append-only audit entry. There is deliberately no "actor": the app has no
 * authentication, so it cannot know (and does not pretend to know) who acted.
 */
export interface ActivityEvent {
  id: string;
  at: Timestamp;
  type: ActivityType;
  entityType: EntityType;
  entityId: string;
  /** Snapshot of the entity's label so the entry stays readable after deletion. */
  entityLabel: string;
  assetId: string | null;
  personId: string | null;
  changes: FieldChange[];
  params: EventParams;
}

export interface BackupFile {
  schema: 'itam-backup';
  version: 3;
  exportedAt: Timestamp;
  data: {
    assets: Asset[];
    people: Person[];
    locations: Location[];
    assignments: Assignment[];
    tickets: Ticket[];
    activity: ActivityEvent[];
  };
}

/** field name -> error code (an i18n key suffix). `_form` is a form-level error. */
export type Errors = Record<string, string>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: Errors };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(errors: Errors): Result<T> => ({ ok: false, errors });
