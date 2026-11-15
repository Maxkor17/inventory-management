// Stable machine codes. Display labels live in src/i18n (never store labels).

export const CATEGORIES = [
  'laptop', 'desktop', 'monitor', 'network_equipment', 'printer',
  'mobile_device', 'server', 'peripheral', 'software', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ASSET_STATUSES = ['in_use', 'in_stock', 'under_repair', 'retired', 'reserved', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const PERSON_STATUSES = ['active', 'inactive'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const END_REASONS = ['returned_to_stock', 'transferred', 'offboarding', 'asset_retired', 'asset_lost'] as const;
export type EndReason = (typeof END_REASONS)[number];

export const ENTITY_TYPES = ['asset', 'person', 'location', 'ticket', 'system'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ACTIVITY_TYPES = [
  'asset.created', 'asset.updated', 'asset.status_changed', 'asset.assignee_changed',
  'asset.location_changed', 'asset.deleted', 'asset.imported',
  'person.created', 'person.updated', 'person.deactivated', 'person.reactivated', 'person.offboarded',
  'location.created', 'location.updated', 'location.deleted',
  'ticket.created', 'ticket.updated', 'ticket.status_changed', 'ticket.resolved', 'ticket.deleted',
  'data.migrated', 'data.imported', 'data.restored', 'data.demo_loaded', 'data.demo_removed',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
