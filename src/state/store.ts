import { computed, signal } from '@preact/signals';
import type { DataStore } from '@/data/store';
import type { Result } from '@/domain/types';
import type { Ctx } from '@/services/context';
import { createCtx } from '@/services/context';
import { loadSnapshot } from '@/services/queries';
import type { Snapshot } from '@/services/queries';

const EMPTY: Snapshot = { assets: [], people: [], locations: [], assignments: [], tickets: [], activity: [] };

export const data = signal<Snapshot>(EMPTY);

let currentCtx: Ctx | null = null;

export function initStore(store: DataStore): Ctx {
  currentCtx = createCtx(store);
  return currentCtx;
}

export function ctx(): Ctx {
  if (!currentCtx) throw new Error('store_not_initialised');
  return currentCtx;
}

/** Re-reads everything from the database into the reactive snapshot. */
export async function refresh(): Promise<void> {
  data.value = await loadSnapshot(ctx());
}

export const assetsById = computed(() => new Map(data.value.assets.map((a) => [a.id, a])));
export const peopleById = computed(() => new Map(data.value.people.map((p) => [p.id, p])));
export const locationsById = computed(() => new Map(data.value.locations.map((l) => [l.id, l])));

export const hasDemoData = computed(() =>
  data.value.assets.some((a) => a.isDemo) || data.value.people.some((p) => p.isDemo) || data.value.locations.some((l) => l.isDemo));

/** Runs a service call, refreshes the snapshot on success and returns the Result untouched. */
export async function mutate<T>(op: () => Promise<Result<T>>): Promise<Result<T>> {
  const r = await op();
  if (r.ok) await refresh();
  return r;
}
