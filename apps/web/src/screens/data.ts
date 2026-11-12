import type { GuitarProfile, TabMeta, TabProgress } from '@guitar3d/shared';

/**
 * Screen-level data access. Kept separate from src/api.ts (shared with other workstreams) so
 * the UI can be defensive about endpoints that may not exist yet.
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

/* ---------- Guitars ---------- */

export interface GuitarSummary {
  id: string;
  name: string;
  totalLengthCm: number | null;
  scaleLengthCm: number | null;
  fretCount: number | null;
  builtIn: boolean;
  thumbnail?: string;
}

export const BUILT_IN_GUITAR: GuitarSummary = {
  id: 'veston',
  name: 'Veston dreadnought',
  totalLengthCm: 106.7,
  scaleLengthCm: 64.8,
  fretCount: 20,
  builtIn: true,
  thumbnail: '/guitar/headstock.jpg',
};

const toSummary = (g: Partial<GuitarProfile> & { id: string }): GuitarSummary => ({
  id: g.id,
  name: g.name || 'Adsız gitar',
  totalLengthCm: g.totalLengthCm ?? null,
  scaleLengthCm: g.scaleLengthCm ?? null,
  fretCount: g.fretCount ?? null,
  builtIn: g.id === BUILT_IN_GUITAR.id,
  thumbnail: g.textures?.bodyTop ?? g.textures?.headstock,
});

/**
 * GET /api/guitars (workstream B). Accepts either an array of profiles or
 * `{ guitars, activeId }`. Falls back to the built-in Veston when the endpoint is missing.
 */
export async function listGuitars(): Promise<{ guitars: GuitarSummary[]; activeId: string | null; fallback: boolean }> {
  try {
    const r = await fetch('/api/guitars');
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(String(r.status));
    const body = (await r.json()) as unknown;
    const arr = (Array.isArray(body) ? body : (body as { guitars?: unknown[] }).guitars ?? []) as (Partial<GuitarProfile> & { id: string })[];
    const activeId = Array.isArray(body) ? null : ((body as { activeId?: string }).activeId ?? null);
    const guitars = arr.filter((g) => g && g.id).map(toSummary);
    if (!guitars.some((g) => g.builtIn)) guitars.unshift(BUILT_IN_GUITAR);
    return { guitars, activeId, fallback: false };
  } catch {
    return { guitars: [BUILT_IN_GUITAR], activeId: BUILT_IN_GUITAR.id, fallback: true };
  }
}
