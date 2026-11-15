import { openIdbStore } from '@/data/idb/idb-store';
import type { DataStore, Tx } from '@/data/store';
import type { AssetInput, LocationInput, PersonInput, TicketInput } from '@/domain/types';
import type { Ctx } from '@/services/context';

let dbCounter = 0;

/** Fresh in-memory database + deterministic ids and a clock that advances 1s per call. */
export async function makeCtx(storeWrapper?: (s: DataStore) => DataStore): Promise<{ ctx: Ctx; store: DataStore }> {
  const raw = await openIdbStore(`test-db-${++dbCounter}-${Math.random().toString(36).slice(2)}`);
  const store = storeWrapper ? storeWrapper(raw) : raw;
  let n = 0;
  let t = Date.UTC(2026, 0, 1, 12, 0, 0);
  const ctx: Ctx = {
    store,
    id: () => `id-${++n}`,
    now: () => new Date((t += 1000)).toISOString(),
  };
  return { ctx, store };
}

export const assetInput = (over: Partial<AssetInput> = {}): AssetInput => ({
  inventoryNumber: 'IT-000001', name: 'Laptop', manufacturer: 'Dell', model: 'Latitude', serialNumber: 'SN-1',
  category: 'laptop', status: 'in_stock', locationId: null, assigneeId: null,
  purchaseDate: '', commissionedDate: '', warrantyEndDate: '', supplier: '', cost: null, description: '', notes: '',
  ...over,
});

export const personInput = (over: Partial<PersonInput> = {}): PersonInput => ({
  firstName: 'Olena', lastName: 'Kovalenko', position: '', department: '', email: '', phone: '',
  locationId: null, startDate: '', notes: '', ...over,
});

export const locationInput = (over: Partial<LocationInput> = {}): LocationInput => ({ name: 'Office', description: '', ...over });

export const ticketInput = (assetId: string, over: Partial<TicketInput> = {}): TicketInput => ({
  assetId, title: 'Broken', problem: 'It does not work', priority: 'medium', specialistId: null, workDone: '', cost: null, ...over,
});

/** Wraps a store and counts every collection `put` — used to learn how many writes an operation makes. */
export function countingStore(inner: DataStore): { store: DataStore; puts: () => number } {
  let puts = 0;
  const wrapTx = (tx: Tx): Tx => {
    const wrap = <C extends { put(item: never): Promise<void> }>(c: C): C => ({
      ...c,
      put: async (item: never) => { puts++; return c.put(item); },
    });
    return {
      ...tx,
      assets: wrap(tx.assets), people: wrap(tx.people), locations: wrap(tx.locations),
      assignments: wrap(tx.assignments), tickets: wrap(tx.tickets), activity: wrap(tx.activity),
    };
  };
  return {
    store: { read: (fn) => inner.read(fn), write: (fn) => inner.write((tx) => fn(wrapTx(tx))), close: () => inner.close() },
    puts: () => puts,
  };
}

/** Wraps a store so the Nth `put` is silently ignored (no error) — simulates a lost write. */
export function droppingStore(inner: DataStore, dropPut: number): DataStore {
  let puts = 0;
  const wrapTx = (tx: Tx): Tx => {
    const wrap = <C extends { put(item: never): Promise<void> }>(c: C): C => ({
      ...c,
      put: async (item: never) => { if (++puts === dropPut) return; return c.put(item); },
    });
    return {
      ...tx,
      assets: wrap(tx.assets), people: wrap(tx.people), locations: wrap(tx.locations),
      assignments: wrap(tx.assignments), tickets: wrap(tx.tickets), activity: wrap(tx.activity),
    };
  };
  return { read: (fn) => inner.read(fn), write: (fn) => inner.write((tx) => fn(wrapTx(tx))), close: () => inner.close() };
}

/** Wraps a store so the Nth `put` (across all collections) throws — to prove transactions roll back. */
export function failingStore(inner: DataStore, failOnPut: number): DataStore {
  let puts = 0;
  const wrapTx = (tx: Tx): Tx => {
    const wrap = <C extends { put(item: never): Promise<void> }>(c: C): C => ({
      ...c,
      put: async (item: never) => {
        if (++puts === failOnPut) throw new Error('injected_failure');
        return c.put(item);
      },
    });
    return {
      ...tx,
      assets: wrap(tx.assets), people: wrap(tx.people), locations: wrap(tx.locations),
      assignments: wrap(tx.assignments), tickets: wrap(tx.tickets), activity: wrap(tx.activity),
    };
  };
  return {
    read: (fn) => inner.read(fn),
    write: (fn) => inner.write((tx) => fn(wrapTx(tx))),
    close: () => inner.close(),
  };
}
