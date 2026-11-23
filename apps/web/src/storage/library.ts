import type { BarNote, NewPracticeSession, PracticeSession, SectionPass, TabFormat, TabMeta, TabProgress } from '@guitar3d/shared';
import { db, newId } from './db';
import { extractTabInfo } from './tabInfo';

/**
 * The tab library and everything recorded about practising it: tab files and their details,
 * speed-trainer progress per section, notes on bars and practice sessions.
 */

// ---- tabs ---------------------------------------------------------------------------------

/** File extension → format. `.atex` / `.tex` hold alphaTex text. */
export const TAB_FORMATS: Record<string, TabFormat> = {
  '.gp': 'gp', '.gp3': 'gp3', '.gp4': 'gp4', '.gp5': 'gp5', '.gpx': 'gpx', '.gp7': 'gp7',
  '.xml': 'musicxml', '.musicxml': 'musicxml', '.mxl': 'mxl', '.atex': 'alphatex', '.tex': 'alphatex',
};

export const MAX_TAB_BYTES = 20 * 1024 * 1024;

export type TabSort = 'recent' | 'played' | 'title';

const SORTS: Record<TabSort, (a: TabMeta, b: TabMeta) => number> = {
  recent: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  played: (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || b.uploadedAt.localeCompare(a.uploadedAt),
  title: (a, b) => a.title.localeCompare(b.title, 'en'),
};

/** Lower case without accents, so "Büklüm" is found by "buklum". */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const clean = (v: string | undefined, max = 200) => (v ?? '').trim().slice(0, max);

const extOf = (name: string) => {
  const m = /\.[^.]+$/.exec(name);
  return m ? m[0].toLowerCase() : '';
};

export async function listTabs(q: { q?: string; sort?: TabSort } = {}): Promise<TabMeta[]> {
  let tabs = await db().all<TabMeta>('tabs');
  const needle = fold(q.q?.trim() ?? '');
  if (needle) tabs = tabs.filter((t) => fold(`${t.title} ${t.artist}`).includes(needle));
  return tabs.sort(SORTS[q.sort ?? 'recent']);
}

export const getTab = (id: string) => db().get<TabMeta>('tabs', id);

/**
 * Adds a Guitar Pro / MusicXML / alphaTex file. Title and artist come from `meta` (the caller reads
 * them from binary files with alphaTab), else from the text of the file, else the file name.
 */
export async function addTabFile(data: ArrayBuffer, name: string, meta: { title?: string; artist?: string; format?: TabFormat } = {}): Promise<TabMeta> {
  const ext = extOf(name);
  const known = TAB_FORMATS[ext];
  if (!known) throw new Error('Upload a supported Guitar Pro, MusicXML or alphaTex file.');
  if (data.byteLength > MAX_TAB_BYTES) throw new Error('The file is too large (max 20 MB).');
  const info = extractTabInfo(data, known);
  const id = newId();
  const tab: TabMeta = {
    id,
    title: clean(meta.title) || info.title || name.slice(0, name.length - ext.length),
    artist: clean(meta.artist) || info.artist || '',
    // text tabs are stored as .atex so the player knows to read them as text
    fileName: `${id}${known === 'alphatex' ? '.atex' : ext}`,
    uploadedAt: new Date().toISOString(),
    format: meta.format === 'ascii' ? 'ascii' : known,
  };
  await db().put('tabFiles', id, data);
  await db().put('tabs', id, tab);
  return tab;
}

/** Adds a tab written as alphaTex text (text import, the editor). */
export async function addTabText(alphaTex: string, meta: { title?: string; artist?: string; format?: 'alphatex' | 'ascii' } = {}): Promise<TabMeta> {
  if (!alphaTex.trim()) throw new Error('alphaTex text is required.');
  const bytes = new TextEncoder().encode(alphaTex);
  return addTabFile(bytes.buffer as ArrayBuffer, 'tab.atex', { ...meta, format: meta.format ?? 'alphatex', title: meta.title || extractTabInfo(bytes.buffer as ArrayBuffer, 'alphatex').title || 'Untitled tab' });
}

export async function renameTab(id: string, patch: { title?: string; artist?: string }): Promise<TabMeta> {
  const tab = await getTab(id);
  if (!tab) throw new Error('Tab not found.');
  if (patch.title !== undefined) {
    if (!clean(patch.title)) throw new Error('The title must not be empty.');
    tab.title = clean(patch.title);
  }
  if (patch.artist !== undefined) tab.artist = clean(patch.artist);
  await db().put('tabs', id, tab);
  return tab;
}

/** Remembers when the tab was last opened ("recently played" sort). */
export async function markTabPlayed(id: string): Promise<TabMeta | undefined> {
  const tab = await getTab(id);
  if (!tab) return undefined;
  tab.lastPlayedAt = new Date().toISOString();
  await db().put('tabs', id, tab);
  return tab;
}

export async function tabFile(id: string): Promise<ArrayBuffer> {
  const data = await db().get<ArrayBuffer>('tabFiles', id);
  if (!data) throw new Error('This tab is no longer in the library.');
  return data;
}

/** Deletes the tab, its file and its progress. */
export async function deleteTab(id: string) {
  await db().delete('tabs', id);
  await db().delete('tabFiles', id);
  await db().delete('progress', id);
}

// ---- progress -----------------------------------------------------------------------------

/** Passes kept per section. */
export const MAX_PASS_HISTORY = 500;

export async function getProgress(tabId: string): Promise<TabProgress> {
  return (await db().get<TabProgress>('progress', tabId)) ?? { tabId, sections: [] };
}

export const listProgress = () => db().all<TabProgress>('progress');

/** Saves progress; sections that come without history or tempo keep the stored ones. */
export async function putProgress(p: TabProgress): Promise<TabProgress> {
  const old = (await getProgress(p.tabId)).sections;
  const next: TabProgress = {
    tabId: p.tabId,
    sections: p.sections.map((s) => {
      const prev = old.find((o) => o.startBar === s.startBar && o.endBar === s.endBar);
      const merged = { ...s };
      if (prev && !s.history?.length) merged.history = prev.history;
      if (prev && s.bpm === undefined) merged.bpm = prev.bpm;
      return merged;
    }),
  };
  await db().put('progress', p.tabId, next);
  return next;
}

export interface PassInput {
  startBar: number;
  endBar: number;
  /** Playback speed of the pass (1 = full tempo). */
  speed: number;
  clean: boolean;
  /** Microphone score 0–100 (mic passes only). */
  score?: number;
  bpm?: number;
  mode: 'mic' | 'manual';
}

/** Adds a speed-trainer pass to its section (created on first use) and raises the best clean speed. */
export async function recordPass(tabId: string, b: PassInput): Promise<TabProgress> {
  const int = (v: number) => Number.isInteger(v) && v >= 0;
  if (!int(b.startBar) || !int(b.endBar) || b.endBar < b.startBar) throw new Error('startBar and endBar must be bar indexes with startBar <= endBar.');
  if (!(b.speed >= 0.1 && b.speed <= 2)) throw new Error('speed must be between 0.1 and 2.');
  const pass: SectionPass = {
    at: new Date().toISOString(),
    speed: Math.round(b.speed * 1000) / 1000,
    clean: b.clean,
    mode: b.mode,
    ...(b.mode === 'mic' && b.score !== undefined ? { score: Math.round(Math.min(100, Math.max(0, b.score))) } : {}),
  };
  const sections = [...(await getProgress(tabId)).sections];
  let i = sections.findIndex((s) => s.startBar === b.startBar && s.endBar === b.endBar);
  if (i < 0) {
    sections.push({ startBar: b.startBar, endBar: b.endBar, bestCleanSpeed: 0, updatedAt: pass.at });
    i = sections.length - 1;
  }
  const s = sections[i];
  sections[i] = {
    ...s,
    bestCleanSpeed: pass.clean ? Math.max(s.bestCleanSpeed, pass.speed) : s.bestCleanSpeed,
    updatedAt: pass.at,
    ...(b.bpm ? { bpm: Math.round(b.bpm) } : {}),
    history: [...(s.history ?? []), pass].slice(-MAX_PASS_HISTORY),
  };
  return putProgress({ tabId, sections });
}

// ---- bar notes ----------------------------------------------------------------------------

/** Notes of one tab (`tabKey` = tab id or `lesson:<id>`), by bar. */
export async function listNotes(tabKey: string): Promise<BarNote[]> {
  const all = await db().all<BarNote>('notes');
  return all.filter((n) => n.tabKey === tabKey).sort((a, b) => a.bar - b.bar || a.createdAt.localeCompare(b.createdAt));
}

export async function addNote(n: Pick<BarNote, 'tabKey' | 'bar' | 'text'>): Promise<BarNote> {
  const text = clean(n.text, 1000);
  if (!text || !Number.isInteger(n.bar) || n.bar < 0) throw new Error('A bar (0 or more) and some text are required.');
  const note: BarNote = { id: newId(), tabKey: n.tabKey, bar: n.bar, text, createdAt: new Date().toISOString() };
  await db().put('notes', note.id, note);
  return note;
}

export const deleteNote = (id: string) => db().delete('notes', id);

// ---- practice sessions --------------------------------------------------------------------

/** One session lasts at most 12 hours; the oldest are dropped beyond MAX_SESSIONS. */
const MAX_SESSION_SECONDS = 12 * 3600;
export const MAX_SESSIONS = 20000;

/** Sessions, newest first; `since` keeps the ones that ended after it. */
export async function listSessions(since?: Date): Promise<PracticeSession[]> {
  const all = await db().all<PracticeSession>('sessions');
  const t = since?.getTime() ?? -Infinity;
  return all.filter((s) => Date.parse(s.endedAt) >= t).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function addSession(s: NewPracticeSession): Promise<PracticeSession | null> {
  const seconds = Math.min(MAX_SESSION_SECONDS, Math.round(s.seconds));
  const started = Date.parse(s.startedAt);
  if (!(seconds >= 1) || Number.isNaN(started)) return null;
  const session: PracticeSession = {
    ...s,
    id: newId(),
    title: clean(s.title) || 'Practice',
    seconds,
    startedAt: new Date(started).toISOString(),
    endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : new Date(started + seconds * 1000).toISOString(),
  };
  await db().put('sessions', session.id, session);
  const keys = await db().keys('sessions');
  if (keys.length > MAX_SESSIONS) {
    const oldest = (await listSessions()).slice(MAX_SESSIONS);
    for (const o of oldest) await db().delete('sessions', o.id);
  }
  return session;
}
