import { BUILTIN_GUITAR_ID, type GuitarProfile, type TabMeta } from '@guitar3d/shared';
import { db, STORES, type StoreName } from './db';

/**
 * Backup file: every store of the database plus this browser's `guitar3d.*` localStorage keys
 * (settings, per-tab setup, badges…), as one JSON file. Binary data (tab files, photos) is base64.
 * It is the way to move your data to another browser or computer.
 *
 * `restoreBackup` also reads the backups of the old server version of the app (format v1).
 */

export interface BackupFile {
  format: 'guitar3d-backup';
  version: 2;
  createdAt: string;
  /** store → [key, value][]. ArrayBuffers are written as { $bytes: base64 }. */
  data: Partial<Record<StoreName, [string, unknown][]>>;
  local: Record<string, string>;
}

const PREFIX = 'guitar3d.';

// ---- base64 for binary values -------------------------------------------------------------

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** JSON can't hold bytes: ArrayBuffers (also inside objects, e.g. a photo's data) become { $bytes }. */
const encode = (v: unknown): unknown =>
  v instanceof ArrayBuffer ? { $bytes: toBase64(v) } : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) : v;
const decode = (v: unknown): unknown => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if (typeof o.$bytes === 'string' && Object.keys(o).length === 1) return fromBase64(o.$bytes);
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decode(x)]));
};

// ---- localStorage part --------------------------------------------------------------------

export function collectLocal(storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(PREFIX)) out[k] = storage.getItem(k) ?? '';
  }
  return out;
}

/** Writes the local part back; only `guitar3d.*` keys are accepted. Returns how many were written. */
export function applyLocal(local: unknown, storage: Pick<Storage, 'setItem'> = localStorage): number {
  if (!local || typeof local !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(local as Record<string, unknown>)) {
    if (!k.startsWith(PREFIX) || typeof v !== 'string') continue;
    storage.setItem(k, v);
    n++;
  }
  return n;
}

// ---- export / import ----------------------------------------------------------------------

export async function makeBackup(local: Record<string, string> = collectLocal()): Promise<BackupFile> {
  const data: BackupFile['data'] = {};
  for (const s of STORES) {
    const keys = await db().keys(s);
    data[s] = await Promise.all(keys.map(async (k) => [k, encode(await db().get(s, k))] as [string, unknown]));
  }
  return { format: 'guitar3d-backup', version: 2, createdAt: new Date().toISOString(), data, local };
}

/** Reads a backup file's text; throws a readable error when it isn't one. */
export function parseBackup(text: string): BackupFile | OldBackup {
  let b: { format?: string; version?: number; server?: unknown };
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('Couldn\'t read the file (not JSON).');
  }
  if (b?.format !== 'guitar3d-backup') throw new Error('This isn\'t a Guitar3D backup.');
  if (b.version === 2) return b as BackupFile;
  if (b.server) return b as OldBackup;
  throw new Error('This backup comes from a newer version of the app.');
}

/** Replaces all data with the backup. `apply` writes the localStorage part (the page should reload). */
export async function restoreBackup(b: BackupFile | OldBackup, apply: (local: unknown) => void = applyLocal) {
  const v2 = 'version' in b && b.version === 2 ? b : fromOldBackup(b as OldBackup);
  for (const s of STORES) await db().clear(s);
  for (const s of STORES) for (const [k, v] of v2.data[s] ?? []) await db().put(s, k, decode(v));
  apply(v2.local);
}

// ---- the old server version's backups -----------------------------------------------------

/** Backup of the server version: `server.db` (JSON database) and `server.files` (path → base64). */
export interface OldBackup {
  format: 'guitar3d-backup';
  server: { version: 1; db: Record<string, unknown>; files: Record<string, string> };
  local?: Record<string, string>;
}

const PHOTO = /^guitars\/([\w-]+)\/(bodyTop|fretboard|headstock|bodyBack)\.(png|jpg|webp)$/;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Converts an old server backup: tab files by tab id, photos by `<guitar>/<name>`, photo URLs to `local:` refs. */
export function fromOldBackup(old: OldBackup): BackupFile {
  const s = old.server;
  if (!s || s.version !== 1 || !s.db || typeof s.files !== 'object') throw new Error('Invalid backup file.');
  const d = s.db as {
    tabs?: TabMeta[];
    progress?: Record<string, unknown>;
    guitars?: Record<string, GuitarProfile>;
    settings?: { activeGuitarId?: string };
    sessions?: { id: string }[];
    notes?: { id: string }[];
  };
  const bytes = (b64: string) => ({ $bytes: b64 });
  const tabs = (d.tabs ?? []).filter((t) => s.files[`tabs/${t.fileName}`]);
  // auto-transcription details are gone with that feature
  const plainTab = (t: TabMeta & { transcription?: unknown }) => {
    const copy = { ...t };
    delete copy.transcription;
    return copy;
  };
  const ref = (u: string) => u.replace(/^\/api\/guitars\/([\w-]+)\/textures\/(\w+)/, 'local:$1/$2');
  const guitars = Object.values(d.guitars ?? {}).map((g) => {
    const t = { ...g.textures };
    for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) if (t[k]) t[k] = ref(t[k]!);
    if (t.fretboard) t.fretboard = { ...t.fretboard, url: ref(t.fretboard.url) };
    return [g.id, { ...g, textures: t }] as [string, unknown];
  });
  const photos: [string, unknown][] = [];
  for (const [path, b64] of Object.entries(s.files)) {
    const m = PHOTO.exec(path);
    if (m) photos.push([`${m[1]}/${m[2]}`, { type: MIME[m[3]], data: bytes(b64) }]);
  }
  const active = d.settings?.activeGuitarId;
  return {
    format: 'guitar3d-backup',
    version: 2,
    createdAt: new Date().toISOString(),
    data: {
      tabs: tabs.map((t) => [t.id, plainTab(t)]),
      tabFiles: tabs.map((t) => [t.id, bytes(s.files[`tabs/${t.fileName}`])]),
      progress: Object.entries(d.progress ?? {}),
      guitars,
      textures: photos,
      sessions: (d.sessions ?? []).map((x) => [x.id, x]),
      notes: (d.notes ?? []).map((x) => [x.id, x]),
      kv: [['settings', { activeGuitarId: active && (active === BUILTIN_GUITAR_ID || d.guitars?.[active]) ? active : BUILTIN_GUITAR_ID }]],
    },
    local: old.local ?? {},
  };
}
