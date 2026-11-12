import { importer, LogLevel, Settings } from '@coderline/alphatab';
import type { TabFormat, TabMeta } from '@guitar3d/shared';
import { asciiTabToAlphaTex, looksLikeAsciiTab, type AsciiTabOptions } from './asciiTab';
import { createTabsApi } from './api';

export const TAB_ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.musicxml,.xml,.mxl,.atex,.tex,.txt';

const BINARY_EXT: Record<string, TabFormat> = {
  gp: 'gp', gp3: 'gp3', gp4: 'gp4', gp5: 'gp5', gpx: 'gpx', gp7: 'gp7', musicxml: 'musicxml', xml: 'musicxml', mxl: 'mxl',
};

export interface ImportOptions {
  /** Rhythm/tempo overrides for ASCII tabs. */
  ascii?: AsciiTabOptions;
  /** Upload successfully parsed tabs to the server (default true). */
  upload?: boolean;
  /** Parse every file with alphaTab before uploading to catch broken files and read title/artist (default true). */
  validate?: boolean;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
}

export interface ImportedTab {
  /** File name, or 'Yapıştırılan tab' for pasted text. */
  name: string;
  format: TabFormat | 'unknown';
  ok: boolean;
  error?: string;
  warnings: string[];
  title?: string;
  artist?: string;
  /** alphaTex text for text formats (alphaTex / converted ASCII). */
  alphaTex?: string;
  /** Server entry when uploaded. */
  meta?: TabMeta;
}

const ext = (name: string) => /\.([^.]+)$/.exec(name.toLowerCase())?.[1] ?? '';

/** Heuristic for text without a helpful extension. */
export function sniffText(text: string): 'alphatex' | 'ascii' | 'unknown' {
  if (looksLikeAsciiTab(text)) return 'ascii';
  if (/\\(track|title|tempo|tuning|staff|ts)\b/.test(text) || /(^|\s):\d+\s+\(?\d+\.\d/.test(text)) return 'alphatex';
  return 'unknown';
}

/** alphaTab turns some spaces into NBSP; keep metadata plain. */
const clean = (s: string | undefined) => s?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() || undefined;

function quietSettings() {
  const s = new Settings();
  s.core.logLevel = LogLevel.None;
  return s;
}

/** Parses a binary score with alphaTab; returns title/artist or throws a readable error. */
export function inspectScoreBytes(bytes: Uint8Array) {
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, quietSettings());
  return { title: clean(score.title), artist: clean(score.artist), bars: score.masterBars.length, tracks: score.tracks.length };
}

/** Parses alphaTex with alphaTab; returns title/artist or throws with the first diagnostics. */
export function inspectAlphaTex(tex: string) {
  try {
    const score = importer.ScoreLoader.loadAlphaTex(tex, quietSettings());
    return { title: clean(score.title), artist: clean(score.artist), bars: score.masterBars.length, tracks: score.tracks.length };
  } catch (e) {
    const inner = (e as { inner?: { diagnostics?: { message?: string }[] }; diagnostics?: { message?: string }[] });
    const diags = inner.diagnostics ?? inner.inner?.diagnostics;
    const first = Array.isArray(diags) ? diags.find((d) => d?.message)?.message : undefined;
    throw new Error(`alphaTex okunamadı${first ? `: ${first}` : ''}`);
  }
}

async function importText(name: string, text: string, kind: 'alphatex' | 'ascii', opts: ImportOptions): Promise<ImportedTab> {
  const res: ImportedTab = { name, format: kind, ok: false, warnings: [] };
  let tex = text;
  if (kind === 'ascii') {
    const conv = asciiTabToAlphaTex(text, opts.ascii);
    tex = conv.alphaTex;
    res.warnings.push(...conv.warnings);
    res.title = conv.title ?? (name.includes('.') ? name.replace(/\.[^.]+$/, '') : undefined);
    res.artist = conv.artist;
  }
  if (opts.validate !== false) {
    const info = inspectAlphaTex(tex);
    res.title ??= info.title;
    res.artist ??= info.artist;
  }
  res.alphaTex = tex;
  if (opts.upload !== false) {
    res.meta = await createTabsApi(opts.fetchImpl).uploadAlphaTex(tex, { title: res.title, artist: res.artist, format: kind });
  }
  res.ok = true;
  return res;
}

async function importFile(file: File, opts: ImportOptions): Promise<ImportedTab> {
  const e = ext(file.name);
  try {
    if (e === 'atex' || e === 'tex') return await importText(file.name, await file.text(), 'alphatex', opts);
    if (e === 'txt' || e === '') {
      const text = await file.text();
      const kind = sniffText(text);
      if (kind === 'unknown') throw new Error('Metin dosyasında ASCII tab ya da alphaTex bulunamadı.');
      return await importText(file.name, text, kind, opts);
    }
    const format = BINARY_EXT[e];
    if (!format) throw new Error(`Desteklenmeyen dosya türü: .${e}`);
    const res: ImportedTab = { name: file.name, format, ok: false, warnings: [] };
    if (opts.validate !== false) {
      try {
        const info = inspectScoreBytes(new Uint8Array(await file.arrayBuffer()));
        res.title = info.title;
        res.artist = info.artist;
      } catch (err) {
        throw new Error(`Dosya okunamadı (${(err as Error).message ?? 'bilinmeyen hata'}).`);
      }
    }
    if (opts.upload !== false) {
      res.meta = await createTabsApi(opts.fetchImpl).uploadFile(file, file.name, { title: res.title, artist: res.artist });
    }
    res.ok = true;
    return res;
  } catch (err) {
    return { name: file.name, format: (BINARY_EXT[e] ?? (e === 'atex' || e === 'tex' ? 'alphatex' : 'unknown')) as ImportedTab['format'], ok: false, error: (err as Error).message, warnings: [] };
  }
}

/**
 * Imports tabs from dropped/selected files or pasted text.
 * - Guitar Pro (.gp/.gp3/.gp4/.gp5/.gpx/.gp7), MusicXML (.musicxml/.xml/.mxl): validated with alphaTab, uploaded as is;
 * - alphaTex (.atex/.tex) and ASCII tab (.txt or pasted): ASCII is converted to alphaTex, both stored as .atex.
 * Never throws for a bad file; every input gets an `ImportedTab` with `ok`/`error`.
 */
export async function importTabs(input: File[] | FileList | string, opts: ImportOptions = {}): Promise<ImportedTab[]> {
  if (typeof input === 'string') {
    const name = 'Yapıştırılan tab';
    const kind = sniffText(input);
    if (kind === 'unknown') return [{ name, format: 'unknown', ok: false, error: 'Metinde ASCII tab ya da alphaTex bulunamadı.', warnings: [] }];
    try {
      return [await importText(name, input, kind, opts)];
    } catch (err) {
      return [{ name, format: kind, ok: false, error: (err as Error).message, warnings: [] }];
    }
  }
  const out: ImportedTab[] = [];
  for (const f of Array.from(input)) out.push(await importFile(f, opts));
  return out;
}
