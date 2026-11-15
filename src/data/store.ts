import type { ActivityEvent, Asset, Assignment, Location, Person, Ticket } from '@/domain/types';

/**
 * Storage contract used by the services. The IndexedDB implementation lives in ./idb;
 * a future HTTP/REST implementation only has to satisfy these interfaces.
 *
 * IMPORTANT (IndexedDB semantics): inside a `write`/`read` callback only `await` calls made on
 * the collections of the given transaction. Awaiting anything else (fetch, timers, other
 * promises) lets the underlying transaction auto-commit early.
 */
export interface Collection<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(item: T): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface MetaStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Tx {
  assets: Collection<Asset>;
  people: Collection<Person>;
  locations: Collection<Location>;
  assignments: Collection<Assignment>;
  tickets: Collection<Ticket>;
  activity: Collection<ActivityEvent>;
  meta: MetaStore;
}

export interface DataStore {
  /** Read-only transaction. */
  read<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Read-write transaction over all stores. If `fn` throws, nothing is persisted. */
  write<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): void;
}

export const COLLECTION_NAMES = ['assets', 'people', 'locations', 'assignments', 'tickets', 'activity'] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];
