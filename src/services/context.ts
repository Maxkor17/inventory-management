import type { DataStore, Tx } from '@/data/store';
import type { ActivityEvent, Asset, EventParams, FieldChange, Person } from '@/domain/types';
import type { ActivityType, EntityType } from '@/domain/enums';
import { fullName } from '@/domain/people';
import { newId, nowISO } from '@/domain/util';

/** Everything a service needs; injected so tests can control ids and the clock. */
export interface Ctx {
  store: DataStore;
  now: () => string;
  id: () => string;
}

export function createCtx(store: DataStore, overrides: Partial<Omit<Ctx, 'store'>> = {}): Ctx {
  return { store, now: overrides.now ?? nowISO, id: overrides.id ?? newId };
}

export const assetLabel = (a: Pick<Asset, 'inventoryNumber' | 'name'>): string => `${a.inventoryNumber} · ${a.name}`;
export const personLabel = (p: Pick<Person, 'firstName' | 'lastName'>): string => fullName(p);

export interface EventInput {
  type: ActivityType;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  assetId?: string | null;
  personId?: string | null;
  changes?: FieldChange[];
  params?: EventParams;
}

/** Writes an audit entry inside the caller's transaction (so it commits or aborts with the change). */
export async function logEvent(ctx: Ctx, tx: Tx, e: EventInput): Promise<void> {
  const event: ActivityEvent = {
    id: ctx.id(),
    at: ctx.now(),
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    entityLabel: e.entityLabel,
    assetId: e.assetId ?? null,
    personId: e.personId ?? null,
    changes: e.changes ?? [],
    params: e.params ?? {},
  };
  await tx.activity.put(event);
}
