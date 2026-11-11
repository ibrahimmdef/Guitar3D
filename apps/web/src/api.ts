import type { TabMeta, TabProgress } from '@guitar3d/shared';
import type { GuitarSpec } from './fretboard/guitarSpec';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listTabs: () => fetch('/api/tabs').then((r) => json<TabMeta[]>(r)),
  uploadTab: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/tabs', { method: 'POST', body: fd }).then((r) => json<TabMeta>(r));
  },
  deleteTab: (id: string) => fetch(`/api/tabs/${id}`, { method: 'DELETE' }),
  tabFile: (id: string) => fetch(`/api/tabs/${id}/file`).then((r) => r.arrayBuffer()),
  getProgress: (id: string) => fetch(`/api/progress/${id}`).then((r) => json<TabProgress>(r)),
  putProgress: (p: TabProgress) =>
    fetch(`/api/progress/${p.tabId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then((r) => json<TabProgress>(r)),
  guitarAssets: () => fetch('/api/guitar/assets').then((r) => json<{ textures: Record<string, string | null>; bodyModel: string | null }>(r)),
  guitarSpec: () => fetch('/api/guitar/spec').then((r) => json<Partial<GuitarSpec>>(r)),
  putTexture: (name: string, blob: Blob) => fetch(`/api/guitar/textures/${name}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }),
  deleteTexture: (name: string) => fetch(`/api/guitar/textures/${name}`, { method: 'DELETE' }),
};
