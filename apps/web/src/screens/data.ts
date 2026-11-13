import type { TabMeta, TabProgress } from '@guitar3d/shared';

/**
 * Screen-level data access for tabs and progress. Guitars live in guitar-setup/api.ts
 * (guitarsApi) and guitar-setup/activeGuitar.ts (useActiveGuitar).
 */
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const listTabs = () => fetch('/api/tabs').then((r) => json<TabMeta[]>(r));

export async function fetchTabFile(id: string): Promise<ArrayBuffer> {
  const r = await fetch(`/api/tabs/${encodeURIComponent(id)}/file`);
  if (r.status === 404) throw new Error('Bu tab artık kütüphanede yok.');
  if (!r.ok) throw new Error(`Tab dosyası alınamadı (HTTP ${r.status}).`);
  return r.arrayBuffer();
}

export async function deleteTab(id: string) {
  const r = await fetch(`/api/tabs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Silinemedi (HTTP ${r.status}).`);
}

export async function uploadTab(file: File): Promise<TabMeta> {
  const fd = new FormData();
  fd.append('file', file);
  return fetch('/api/tabs', { method: 'POST', body: fd }).then((r) => json<TabMeta>(r));
}

export const getProgress = (id: string) => fetch(`/api/progress/${encodeURIComponent(id)}`).then((r) => json<TabProgress>(r));

/** Best clean speed across practised sections, or null when never practised. */
export function bestSpeed(p: TabProgress | undefined): number | null {
  if (!p || p.sections.length === 0) return null;
  return Math.max(...p.sections.map((s) => s.bestCleanSpeed));
}
