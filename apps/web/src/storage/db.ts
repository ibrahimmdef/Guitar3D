/**
 * Where the app keeps its data: IndexedDB, the browser's built-in database. There is no server;
 * everything stays on this device (use Settings → Backup to move it to another one).
 *
 * The database has one "object store" (think: table) per kind of data. Each entry is a value
 * stored under a string key. This file only knows how to get, put and delete entries; what the
 * entries mean lives in library.ts (tabs, progress, notes, sessions) and guitars.ts.
 */

export const STORES = ['tabs', 'tabFiles', 'progress', 'notes', 'sessions', 'guitars', 'textures', 'kv'] as const;
export type StoreName = (typeof STORES)[number];

export interface Backend {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  /** Every value of a store (in key order). */
  all<T>(store: StoreName): Promise<T[]>;
  keys(store: StoreName): Promise<string[]>;
  clear(store: StoreName): Promise<void>;
}

const DB_NAME = 'guitar3d';
const DB_VERSION = 1;

/** Turns an IndexedDB request (callback style) into a promise. */
function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The real backend. The database is created (or upgraded) the first time it is opened. */
export function indexedDbBackend(factory: IDBFactory = indexedDB): Backend {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opening;
  };
  const store = async (name: StoreName, mode: IDBTransactionMode) => (await open()).transaction(name, mode).objectStore(name);
  return {
    get: async <T,>(s: StoreName, key: string) => (await done((await store(s, 'readonly')).get(key))) as T | undefined,
    put: async (s, key, value) => void (await done((await store(s, 'readwrite')).put(value, key))),
    delete: async (s, key) => void (await done((await store(s, 'readwrite')).delete(key))),
    all: async <T,>(s: StoreName) => (await done((await store(s, 'readonly')).getAll())) as T[],
    keys: async (s) => ((await done((await store(s, 'readonly')).getAllKeys())) as IDBValidKey[]).map(String),
    clear: async (s) => void (await done((await store(s, 'readwrite')).clear())),
  };
}

/**
 * The same interface in memory: used by the tests (Node has no IndexedDB) and as a fallback when the
 * browser blocks storage. Values are copied like IndexedDB does, so callers can't change stored data
 * by accident.
 */
export function memoryBackend(): Backend {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  const copy = <T,>(v: T): T => (v instanceof ArrayBuffer ? (v.slice(0) as T) : structuredClone(v));
  const sorted = (s: StoreName) => [...data.get(s)!.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    get: async <T,>(s: StoreName, key: string) => (data.get(s)!.has(key) ? copy(data.get(s)!.get(key) as T) : undefined),
    put: async (s, key, value) => void data.get(s)!.set(key, copy(value)),
    delete: async (s, key) => void data.get(s)!.delete(key),
    all: async <T,>(s: StoreName) => sorted(s).map(([, v]) => copy(v as T)),
    keys: async (s) => sorted(s).map(([k]) => k),
    clear: async (s) => data.get(s)!.clear(),
  };
}

let current: Backend | null = null;

/** The backend in use: IndexedDB in the browser, memory where it doesn't exist. */
export function db(): Backend {
  current ??= typeof indexedDB === 'undefined' ? memoryBackend() : indexedDbBackend();
  return current;
}

/** Tests: start from an empty in-memory database. */
export function useMemoryDb(): Backend {
  current = memoryBackend();
  return current;
}

/** Random id for new entries (tabs, notes, guitars…). */
export const newId = () => crypto.randomUUID();
