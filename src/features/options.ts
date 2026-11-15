import type { Asset, Location, Person } from '@/domain/types';
import { fullName } from '@/domain/people';
import { ASSET_STATUSES, CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '@/domain/enums';
import { tc } from '@/i18n';
import type { Option } from '@/ui/components/Fields';

export const categoryOptions = (): Option[] => CATEGORIES.map((c) => ({ value: c, label: tc('category', c) }));
export const statusOptions = (): Option[] => ASSET_STATUSES.map((s) => ({ value: s, label: tc('status', s) }));
export const priorityOptions = (): Option[] => TICKET_PRIORITIES.map((p) => ({ value: p, label: tc('priority', p) }));
export const ticketStatusOptions = (): Option[] => TICKET_STATUSES.map((s) => ({ value: s, label: tc('ticket_status', s) }));

const byLabel = (a: Option, b: Option): number => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

/** Active people (plus `keepId` even if inactive, so an existing holder stays selectable). */
export function personOptions(people: readonly Person[], opts: { keepId?: string | null; excludeId?: string; activeOnly?: boolean } = {}): Option[] {
  const { keepId, excludeId, activeOnly = true } = opts;
  return people
    .filter((p) => p.id !== excludeId && (!activeOnly || p.status === 'active' || p.id === keepId))
    .map((p) => ({ value: p.id, label: p.status === 'inactive' ? `${fullName(p)} (${tc('person_status', 'inactive')})` : fullName(p) }))
    .sort(byLabel);
}

export const locationOptions = (locations: readonly Location[]): Option[] =>
  locations.map((l) => ({ value: l.id, label: l.name })).sort(byLabel);

export const assetOptions = (assets: readonly Asset[]): Option[] =>
  assets.map((a) => ({ value: a.id, label: `${a.inventoryNumber} · ${a.name}` })).sort(byLabel);
