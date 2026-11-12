import type { TabFormat, TabMeta } from '@guitar3d/shared';

export type TabSort = 'recent' | 'played' | 'title';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Thin client for the tab library endpoints. `f` is injectable for tests. */
export function createTabsApi(f: typeof fetch = (...a) => fetch(...a)) {
  return {
    list: (q?: { q?: string; sort?: TabSort }) => {
      const p = new URLSearchParams();
      if (q?.q) p.set('q', q.q);
      if (q?.sort) p.set('sort', q.sort);
      const qs = p.toString();
      return f(`/api/tabs${qs ? `?${qs}` : ''}`).then((r) => json<TabMeta[]>(r));
    },
    uploadFile: (file: Blob, name: string, meta: { title?: string; artist?: string; format?: TabFormat } = {}) => {
      const fd = new FormData();
      fd.append('file', file, name);
      if (meta.title) fd.append('title', meta.title);
      if (meta.artist) fd.append('artist', meta.artist);
      if (meta.format) fd.append('format', meta.format);
      return f('/api/tabs', { method: 'POST', body: fd }).then((r) => json<TabMeta>(r));
    },
    uploadAlphaTex: (alphaTex: string, meta: { title?: string; artist?: string; format?: 'alphatex' | 'ascii' } = {}) =>
      f('/api/tabs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alphaTex, ...meta }) }).then((r) =>
        json<TabMeta>(r),
      ),
    rename: (id: string, patch: { title?: string; artist?: string }) =>
      f(`/api/tabs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then((r) =>
        json<TabMeta>(r),
      ),
    markPlayed: (id: string) => f(`/api/tabs/${id}/played`, { method: 'POST' }).then((r) => json<TabMeta>(r)),
    remove: (id: string) => f(`/api/tabs/${id}`, { method: 'DELETE' }),
    /** Raw file bytes; alphaTex tabs (format 'alphatex' | 'ascii') should be decoded as text and fed to `api.tex()`. */
    file: (id: string) => f(`/api/tabs/${id}/file`).then((r) => r.arrayBuffer()),
  };
}

export const tabsApi = createTabsApi();

/** True when the stored file is alphaTex text (load with `AlphaTabApi.tex`), not a binary score. */
export const isTextTab = (t: Pick<TabMeta, 'format' | 'fileName'>) => t.format === 'alphatex' || t.format === 'ascii' || t.fileName.endsWith('.atex');
