/**
 * Practice recordings ("takes") in IndexedDB, per tab. Each take remembers where and how fast the
 * tab was playing when it started, so it can be replayed on top of the original.
 */

export interface TakeMeta {
  id: string;
  /** Tab id, or `lesson:<id>`. */
  tabKey: string;
  createdAt: string;
  /** Tab position (MIDI tick) and playback speed at the start. */
  startTick: number;
  speed: number;
  durationMs: number;
  mime: string;
}
export interface Take extends TakeMeta {
  blob: Blob;
}

const DB = 'guitar3d-recordings';
const STORE = 'takes';
/** Takes kept per tab; older ones are deleted. */
export const MAX_TAKES_PER_TAB = 10;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcı kayıtları saklayamıyor.'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('tabKey', 'tabKey');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          resolve(req.result);
          db.close();
        };
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Newest first, without the audio. */
export async function listTakes(tabKey: string): Promise<TakeMeta[]> {
  const all = await tx<Take[]>('readonly', (s) => s.index('tabKey').getAll(tabKey));
  return sortTakes(all.map(({ blob: _b, ...m }) => m));
}

export const getTake = (id: string) => tx<Take | undefined>('readonly', (s) => s.get(id));
export const deleteTake = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => {});

export async function addTake(t: Take) {
  await tx('readwrite', (s) => s.put(t));
  const extra = (await listTakes(t.tabKey)).slice(MAX_TAKES_PER_TAB);
  for (const old of extra) await deleteTake(old.id);
}

export const sortTakes = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** First recording format the browser supports (Safari has no webm). */
export function pickMime(isSupported: (m: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(isSupported) ?? '';
}
