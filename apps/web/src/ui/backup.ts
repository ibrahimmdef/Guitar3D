/**
 * Export / import of all Guitar3D data: the server part (tabs, guitars, sessions, progress, notes,
 * assignments) from `GET /api/backup` and this browser's local data (settings, per-tab setup,
 * course, routines, badges…: every `guitar3d.*` localStorage key). Recordings (IndexedDB) are not
 * included. There are no accounts: "sync" means a file or a snapshot on the server.
 */

export interface BackupBundle {
  format: 'guitar3d-backup';
  server: unknown;
  local: Record<string, string>;
}

const PREFIX = 'guitar3d.';

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

export function parseBundle(text: string): BackupBundle {
  let b: Partial<BackupBundle>;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('Dosya okunamadı (JSON değil).');
  }
  if (b?.format !== 'guitar3d-backup' || !b.server) throw new Error('Bu bir Guitar3D yedeği değil.');
  return { format: 'guitar3d-backup', server: b.server, local: (b.local ?? {}) as Record<string, string> };
}

async function ok(r: Response) {
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
  return r;
}

export async function makeBundle(): Promise<BackupBundle> {
  const server = await fetch('/api/backup').then(ok).then((r) => r.json());
  return { format: 'guitar3d-backup', server, local: collectLocal() };
}

/** Replaces server and local data with the bundle. The page should reload afterwards. */
export async function restoreBundle(b: BackupBundle) {
  await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b.server) }).then(ok);
  applyLocal(b.local);
}

export const listSnapshots = () => fetch('/api/backups').then(ok).then((r) => r.json() as Promise<{ name: string; size: number; createdAt: string }[]>);
export const saveSnapshot = () =>
  fetch('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ local: collectLocal() }) }).then(ok).then((r) => r.json());
export const loadSnapshot = (name: string) => fetch(`/api/backups/${encodeURIComponent(name)}`).then(ok).then((r) => r.text()).then(parseBundle);
