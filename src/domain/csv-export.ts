import { toCsv } from './csv';
import { fullName } from './people';
import type { ActivityEvent, Asset, Location, Person, Ticket } from './types';

export function peopleToCsv(people: readonly Person[], locations: readonly Location[], assets: readonly Asset[]): string {
  const loc = new Map(locations.map((l) => [l.id, l.name]));
  const header = ['first_name', 'last_name', 'position', 'department', 'email', 'phone', 'location', 'status', 'start_date', 'assets_held', 'notes'];
  const rows = people.map((p) => [
    p.firstName, p.lastName, p.position, p.department, p.email, p.phone, p.locationId ? loc.get(p.locationId) ?? '' : '',
    p.status, p.startDate, assets.filter((a) => a.assigneeId === p.id).length, p.notes,
  ]);
  return toCsv([header, ...rows]);
}

export function ticketsToCsv(tickets: readonly Ticket[], assets: readonly Asset[], people: readonly Person[]): string {
  const asset = new Map(assets.map((a) => [a.id, a]));
  const person = new Map(people.map((p) => [p.id, p]));
  const header = ['title', 'asset_inventory_number', 'asset_name', 'priority', 'status', 'specialist', 'created_at', 'resolved_at', 'closed_at', 'cost', 'problem', 'work_done'];
  const rows = tickets.map((x) => {
    const a = asset.get(x.assetId);
    const s = x.specialistId ? person.get(x.specialistId) : undefined;
    return [x.title, a?.inventoryNumber ?? '', a?.name ?? '', x.priority, x.status, s ? fullName(s) : '', x.createdAt, x.resolvedAt ?? '', x.closedAt ?? '', x.cost, x.problem, x.workDone];
  });
  return toCsv([header, ...rows]);
}

export function activityToCsv(events: readonly ActivityEvent[]): string {
  const header = ['at', 'type', 'entity_type', 'entity', 'changes', 'details'];
  const rows = events.map((e) => [
    e.at, e.type, e.entityType, e.entityLabel,
    e.changes.map((c) => `${c.field}: ${c.from ?? ''} -> ${c.to ?? ''}`).join('; '),
    Object.keys(e.params).length ? JSON.stringify(e.params) : '',
  ]);
  return toCsv([header, ...rows]);
}
