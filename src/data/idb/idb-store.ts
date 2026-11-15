import { openDB } from 'idb';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { Collection, DataStore, MetaStore, Tx } from '../store';

export const DB_NAME = 'inventory-management-itam';
/** Bump together with a new case in `upgrade` when the stored shape changes. */
export const SCHEMA_VERSION = 1;

const STORE_NAMES = ['assets', 'people', 'locations', 'assignments', 'tickets', 'activity', 'meta'] as const;

// Typed as read-write so put/delete/clear are callable; `read()` transactions never use them.
type AnyTx = IDBPTransaction<unknown, string[], 'readwrite'>;

function collection<T extends { id: string }>(tx: AnyTx, name: string): Collection<T> {
  const store = () => tx.objectStore(name);
  return {
    get: async (id) => (await store().get(id)) as T | undefined,
    getAll: async () => (await store().getAll()) as T[],
    put: async (item) => { await store().put(item); },
    delete: async (id) => { await store().delete(id); },
    clear: async () => { await store().clear(); },
  };
}

function metaStore(tx: AnyTx): MetaStore {
  const store = () => tx.objectStore('meta');
  return {
    get: async <T,>(key: string) => {
      const row = (await store().get(key)) as { key: string; value: T } | undefined;
      return row?.value;
    },
    set: async (key, value) => { await store().put({ key, value }); },
    delete: async (key) => { await store().delete(key); },
  };
}

function buildTx(tx: AnyTx): Tx {
  return {
    assets: collection(tx, 'assets'),
    people: collection(tx, 'people'),
    locations: collection(tx, 'locations'),
    assignments: collection(tx, 'assignments'),
    tickets: collection(tx, 'tickets'),
    activity: collection(tx, 'activity'),
    meta: metaStore(tx),
  };
}

export function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/** Opens (and creates/upgrades) the database. Rejects if IndexedDB is unavailable or blocked. */
export async function openIdbStore(dbName: string = DB_NAME): Promise<DataStore> {
  if (!isIndexedDbSupported()) throw new Error('indexeddb_unavailable');

  const db: IDBPDatabase = await openDB(dbName, SCHEMA_VERSION, {
    upgrade(database) {
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    },
    blocking() {
      // Another tab wants to upgrade: release our connection so it can proceed.
      db.close();
    },
  });

  async function run<T>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = db.transaction([...STORE_NAMES], mode) as unknown as AnyTx;
    // Observe completion from the start so an abort never becomes an unhandled rejection.
    const done = tx.done.then(() => undefined, (e: unknown) => { throw e; });
    done.catch(() => undefined);
    try {
      const result = await fn(buildTx(tx));
      await done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* already finished */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  return {
    read: (fn) => run('readonly', fn),
    write: (fn) => run('readwrite', fn),
    close: () => db.close(),
  };
}
