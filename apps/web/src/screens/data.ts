import type { SeparatorStatus, Song, StemName, TabMeta, TabProgress } from '@guitar3d/shared';

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
  if (r.status === 404) throw new Error('This tab is no longer in the library.');
  if (!r.ok) throw new Error(`Couldn't load the tab file (HTTP ${r.status}).`);
  return r.arrayBuffer();
}

export async function deleteTab(id: string) {
  const r = await fetch(`/api/tabs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Couldn't delete (HTTP ${r.status}).`);
}

export async function uploadTab(file: File): Promise<TabMeta> {
  const fd = new FormData();
  fd.append('file', file);
  // Guitar Pro files are binary: read title / artist here (the server only parses text formats).
  if (/\.(gp|gp3|gp4|gp5|gpx|gp7)$/i.test(file.name)) {
    try {
      const { importer, Settings } = await import('@coderline/alphatab');
      const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(await file.arrayBuffer()), new Settings());
      if (score.title.trim()) fd.append('title', score.title.trim());
      if (score.artist.trim()) fd.append('artist', score.artist.trim());
    } catch {
      /* unreadable here: the server keeps the file name, the player shows the error */
    }
  }
  return fetch('/api/tabs', { method: 'POST', body: fd }).then((r) => json<TabMeta>(r));
}

export const getProgress = (id: string) => fetch(`/api/progress/${encodeURIComponent(id)}`).then((r) => json<TabProgress>(r));

/** Best clean speed across practised sections, or null when never practised. */
export function bestSpeed(p: TabProgress | undefined): number | null {
  if (!p || p.sections.length === 0) return null;
  return Math.max(...p.sections.map((s) => s.bestCleanSpeed));
}

// ---- audio songs (stem separation) -------------------------------------------------------

export const SONG_ACCEPT = '.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,audio/*';
export const SONG_MAX_MB = 50;

export const listSongs = () => fetch('/api/songs').then((r) => json<Song[]>(r));
export const getSong = (id: string) => fetch(`/api/songs/${encodeURIComponent(id)}`).then((r) => json<Song>(r));
export const separatorStatus = () => fetch('/api/songs/separator').then((r) => json<SeparatorStatus>(r));
export const stemUrl = (id: string, stem: StemName) => `/api/songs/${encodeURIComponent(id)}/stems/${stem}`;

export function uploadSong(file: File): Promise<Song> {
  if (file.size > SONG_MAX_MB * 1024 * 1024) return Promise.reject(new Error(`File too large (max ${SONG_MAX_MB} MB).`));
  const fd = new FormData();
  fd.append('file', file);
  return fetch('/api/songs', { method: 'POST', body: fd }).then((r) => json<Song>(r));
}

export const retrySong = (id: string) => fetch(`/api/songs/${encodeURIComponent(id)}/retry`, { method: 'POST' }).then((r) => json<Song>(r));

export async function deleteSong(id: string) {
  const r = await fetch(`/api/songs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Delete failed (HTTP ${r.status}).`);
}
