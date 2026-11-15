import {
  ACTIVITY_TYPES, ASSET_STATUSES, CATEGORIES, END_REASONS, ENTITY_TYPES,
  PERSON_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES, isOneOf,
} from './enums';
import type { ActivityEvent, Assignment, Asset, Location, Person, Ticket } from './types';
import { isRealDate } from './util';

/** Structural checks for data that comes from outside (backup restore). */

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (v: unknown): v is string => typeof v === 'string';
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const numOrNull = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v));
const dateOrEmpty = (v: unknown): v is string => str(v) && (v === '' || isRealDate(v));

export function isAsset(x: unknown): x is Asset {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.inventoryNumber) && str(x.name) && str(x.manufacturer) &&
    str(x.model) && str(x.serialNumber) && isOneOf(CATEGORIES, x.category) && isOneOf(ASSET_STATUSES, x.status) &&
    strOrNull(x.locationId) && strOrNull(x.assigneeId) && dateOrEmpty(x.purchaseDate) &&
    dateOrEmpty(x.commissionedDate) && dateOrEmpty(x.warrantyEndDate) && str(x.supplier) && numOrNull(x.cost) &&
    str(x.description) && str(x.notes) && bool(x.isDemo) && str(x.createdAt) && str(x.updatedAt);
}

export function isPerson(x: unknown): x is Person {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.firstName) && str(x.lastName) && str(x.position) &&
    str(x.department) && str(x.email) && str(x.phone) && strOrNull(x.locationId) &&
    isOneOf(PERSON_STATUSES, x.status) && dateOrEmpty(x.startDate) && strOrNull(x.deactivatedAt) &&
    str(x.notes) && bool(x.isDemo) && str(x.createdAt) && str(x.updatedAt);
}

export function isLocation(x: unknown): x is Location {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.name) && str(x.description) && bool(x.isDemo) &&
    str(x.createdAt) && str(x.updatedAt);
}

export function isAssignment(x: unknown): x is Assignment {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.assetId) && str(x.personId) && str(x.assignedAt) &&
    strOrNull(x.returnedAt) && (x.endReason === null || isOneOf(END_REASONS, x.endReason)) &&
    str(x.note) && bool(x.isDemo);
}

export function isTicket(x: unknown): x is Ticket {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.assetId) && str(x.title) && str(x.problem) &&
    isOneOf(TICKET_PRIORITIES, x.priority) && isOneOf(TICKET_STATUSES, x.status) && strOrNull(x.specialistId) &&
    str(x.workDone) && numOrNull(x.cost) && str(x.createdAt) && str(x.updatedAt) && strOrNull(x.resolvedAt) &&
    strOrNull(x.closedAt) && bool(x.isDemo);
}

export function isActivityEvent(x: unknown): x is ActivityEvent {
  return isRec(x) && str(x.id) && x.id !== '' && str(x.at) && isOneOf(ACTIVITY_TYPES, x.type) &&
    isOneOf(ENTITY_TYPES, x.entityType) && str(x.entityId) && str(x.entityLabel) && strOrNull(x.assetId) &&
    strOrNull(x.personId) && Array.isArray(x.changes) && isRec(x.params);
}
