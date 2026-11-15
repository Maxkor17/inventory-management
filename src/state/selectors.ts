import type { Asset, Assignment, Person, Ticket } from '@/domain/types';
import { fullName } from '@/domain/people';
import { warrantyState } from '@/domain/warranty';
import type { WarrantyState } from '@/domain/warranty';

/** Assets whose warranty still matters (retired / lost assets are ignored in alerts). */
export const isLive = (a: Asset): boolean => a.status !== 'retired' && a.status !== 'lost';

export interface WarrantyBuckets {
  expired: Asset[];
  soon: Asset[];
}

export function warrantyBuckets(assets: readonly Asset[], today: string, soonDays: number): WarrantyBuckets {
  const expired: Asset[] = [];
  const soon: Asset[] = [];
  for (const a of assets) {
    if (!isLive(a)) continue;
    const w = warrantyState(a.warrantyEndDate, today, soonDays);
    if (w.kind === 'expired') expired.push(a);
    else if (w.kind === 'soon') soon.push(a);
  }
  expired.sort((x, y) => (x.warrantyEndDate < y.warrantyEndDate ? 1 : -1)); // most recently expired first
  soon.sort((x, y) => (x.warrantyEndDate < y.warrantyEndDate ? -1 : 1)); // ending soonest first
  return { expired, soon };
}

export function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

export function purchasesByYear(assets: readonly Asset[]): { year: string; count: number }[] {
  const m = countBy(assets.filter((a) => a.purchaseDate), (a) => a.purchaseDate.slice(0, 4));
  return [...m.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => (a.year < b.year ? -1 : 1));
}

export const activeAssignments = (assignments: readonly Assignment[]): Assignment[] => assignments.filter((a) => a.returnedAt === null);

export const heldAssets = (assets: readonly Asset[], personId: string): Asset[] => assets.filter((a) => a.assigneeId === personId);

export const ticketsOf = (tickets: readonly Ticket[], assetId: string): Ticket[] =>
  tickets.filter((t) => t.assetId === assetId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export function warrantyOf(a: Asset, today: string, soonDays: number): WarrantyState {
  return warrantyState(a.warrantyEndDate, today, soonDays);
}

export const personName = (p: Person | undefined): string => (p ? fullName(p) : '');
