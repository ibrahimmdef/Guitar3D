import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { SectionPass, TabFormat, TabMeta, TabProgress } from '@guitar3d/shared';
import { Store } from './store.js';
import { guitarsRouter } from './guitars.js';
import { sessionsRouter } from './sessions.js';
import { notesRouter } from './notes.js';
import { backupRouter } from './backup.js';
import { extractTabInfo } from './tabInfo.js';
import { SongQueue, songsRouter } from './songs.js';
import { DemucsTools, type SongTools } from './separator.js';
import { JobLock } from './jobLock.js';
import { YtDlpTools, type LinkTools } from './linkImport.js';
import { BasicPitchTools, type TranscriberTools } from './transcriber.js';
import { TranscriptionQueue, transcriptionsRouter } from './transcriptions.js';

/** Upload extension → stored format. Text formats (.atex/.tex) hold alphaTex. */
export const TAB_FORMATS: Record<string, TabFormat> = {
  '.gp': 'gp', '.gp3': 'gp3', '.gp4': 'gp4', '.gp5': 'gp5', '.gpx': 'gpx', '.gp7': 'gp7',
  '.xml': 'musicxml', '.musicxml': 'musicxml', '.mxl': 'mxl', '.atex': 'alphatex', '.tex': 'alphatex',
};
const ALLOWED = Object.keys(TAB_FORMATS);
const SORTS: Record<string, (a: TabMeta, b: TabMeta) => number> = {
  recent: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  played: (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || b.uploadedAt.localeCompare(a.uploadedAt),
  title: (a, b) => a.title.localeCompare(b.title, 'en'),
};
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export interface AppOptions {
  /** Separation / probing backend (tests pass a mock). Defaults to Demucs + ffmpeg. */
  songTools?: SongTools;
  /** Transcription backend (tests pass a mock). Defaults to Basic Pitch + librosa. */
  transcriberTools?: TranscriberTools;
  /** yt-dlp backend for "Add a song from a link" (tests pass a mock). */
  linkTools?: LinkTools;
}

export function createApp(store: Store, opts: AppOptions = {}) {
  const app = express();
  const songTools = opts.songTools ?? new DemucsTools();
  const transcriberTools = opts.transcriberTools ?? new BasicPitchTools();
  const linkTools = opts.linkTools ?? new YtDlpTools();
  // Separation and transcription share one lock: never two heavy jobs at once.
  const heavy = new JobLock();
  const songQueue = new SongQueue(store, songTools, 1, heavy, linkTools);
  songQueue.resume();
  app.locals.songQueue = songQueue;
  const transcriptionQueue = new TranscriptionQueue(store, transcriberTools, heavy);
  transcriptionQueue.resume();
  app.locals.transcriptionQueue = transcriptionQueue;
  app.use('/api', backupRouter(store));
  app.use(express.json({ limit: '5mb' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.tabsDir,
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${storedExt(file.originalname)}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** ?q= searches title/artist (case and accent insensitive); ?sort=recent|played|title. */
  app.get('/api/tabs', (req, res) => {
    let tabs = store.listTabs();
    const q = typeof req.query.q === 'string' ? fold(req.query.q.trim()) : '';
    if (q) tabs = tabs.filter((t) => fold(`${t.title} ${t.artist}`).includes(q));
    const sort = SORTS[String(req.query.sort ?? 'recent')] ?? SORTS.recent;
    res.json([...tabs].sort(sort));
  });

  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  /**
   * Multipart upload (`file` + optional `title`, `artist`, `format`) of a Guitar Pro / MusicXML / alphaTex file,
   * or JSON `{ alphaTex, title?, artist?, format?: 'alphatex' | 'ascii' }` for text tabs (stored as .atex).
   */
  app.post('/api/tabs', (req, res, next) => (req.is('application/json') ? next() : upload.single('file')(req, res, next)), (req, res) => {
    if (req.is('application/json')) {
      const body = req.body as { alphaTex?: unknown; title?: unknown; artist?: unknown; format?: unknown };
      if (typeof body?.alphaTex !== 'string' || !body.alphaTex.trim() || body.alphaTex.length > 2_000_000) {
        res.status(400).json({ error: 'alphaTex text is required.' });
        return;
      }
      const id = crypto.randomUUID();
      const fileName = `${id}.atex`;
      fs.writeFileSync(path.join(store.tabsDir, fileName), body.alphaTex);
      const info = extractTabInfo(Buffer.from(body.alphaTex), 'alphatex');
      const meta = store.addTab({
        id,
        title: str(body.title) || info.title || 'Untitled tab',
        artist: str(body.artist) || info.artist || '',
        fileName,
        uploadedAt: new Date().toISOString(),
        format: body.format === 'ascii' ? 'ascii' : 'alphatex',
      });
      res.status(201).json(meta);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Upload a supported Guitar Pro, MusicXML or alphaTex file.' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const format: TabFormat = req.body?.format === 'ascii' ? 'ascii' : TAB_FORMATS[ext];
    const base = path.basename(req.file.originalname, path.extname(req.file.originalname));
    let info: { title?: string; artist?: string } = {};
    try {
      info = extractTabInfo(fs.readFileSync(req.file.path), TAB_FORMATS[ext]);
    } catch {
      // metadata is best effort
    }
    const meta = store.addTab({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      title: str(req.body?.title) || info.title || base,
      artist: str(req.body?.artist) || info.artist || '',
      fileName: req.file.filename,
      uploadedAt: new Date().toISOString(),
      format,
    });
    res.status(201).json(meta);
  });

  /** Rename: `{ title?, artist? }`. */
  app.patch('/api/tabs/:id', (req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; artist?: unknown };
    const patch: { title?: string; artist?: string } = {};
    if (body.title !== undefined) {
      if (!str(body.title)) {
        res.status(400).json({ error: 'title must not be empty.' });
        return;
      }
      patch.title = str(body.title);
    }
    if (body.artist !== undefined) patch.artist = str(body.artist);
    const tab = store.updateTab(req.params.id, patch);
    if (!tab) {
      res.status(404).json({ error: 'Tab not found.' });
      return;
    }
    res.json(tab);
  });

  /** Marks the tab as played now (drives "recently played"). */
  app.post('/api/tabs/:id/played', (req, res) => {
    const tab = store.updateTab(req.params.id, { lastPlayedAt: new Date().toISOString() });
    if (!tab) {
      res.status(404).json({ error: 'Tab not found.' });
      return;
    }
    res.json(tab);
  });

  app.get('/api/tabs/:id/file', (req, res) => {
    const tab = store.getTab(req.params.id);
    if (!tab) {
      res.status(404).json({ error: 'Tab not found.' });
      return;
    }
    const file = path.resolve(store.tabsDir, tab.fileName);
    if (tab.fileName.endsWith('.atex')) res.type('text/plain; charset=utf-8');
    // dotfiles: 'allow' so a data dir below a dot folder (e.g. ~/.local) still serves.
    res.sendFile(file, { dotfiles: 'allow' });
  });

  app.delete('/api/tabs/:id', (req, res) => {
    res.status(store.deleteTab(req.params.id) ? 204 : 404).end();
  });

  app.get('/api/progress', (_req, res) => {
    res.json(store.listProgress());
  });

  app.post('/api/progress/:tabId/passes', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (!int(b.startBar) || !int(b.endBar) || (b.endBar as number) < (b.startBar as number)) {
      res.status(400).json({ error: 'startBar and endBar must be bar indexes with startBar <= endBar.' });
      return;
    }
    if (!num(b.speed, 0.1, 2) || typeof b.clean !== 'boolean') {
      res.status(400).json({ error: 'speed (0.1–2) and clean (boolean) are required.' });
      return;
    }
    if ((b.score !== undefined && !num(b.score, 0, 100)) || (b.bpm !== undefined && !num(b.bpm, 1, 1000)) || (b.mode !== undefined && b.mode !== 'mic' && b.mode !== 'manual')) {
      res.status(400).json({ error: 'score must be 0–100, bpm 1–1000 and mode "mic" or "manual".' });
      return;
    }
    // Explicit mode inference: 'mic' when a score is provided (requires microphone scoring),
    // 'manual' otherwise. A manual pass with a score is now rejected to avoid ambiguity.
    let mode: SectionPass['mode'];
    if (b.mode !== undefined) {
      mode = b.mode as SectionPass['mode'];
    } else if (b.score !== undefined) {
      mode = 'mic';
    } else {
      mode = 'manual';
    }
    // Reject manual passes that include a score (should use mode: "mic" instead)
    if (mode === 'manual' && b.score !== undefined) {
      res.status(400).json({ error: 'Manual passes cannot include a score. Use mode: "mic" for microphone-scored passes.' });
      return;
    }
    const pass: SectionPass = {
      at: new Date().toISOString(),
      speed: Math.round((b.speed as number) * 1000) / 1000,
      clean: b.clean,
      mode,
      ...(b.score !== undefined ? { score: Math.round(b.score as number) } : {}),
    };
    const section = { startBar: b.startBar as number, endBar: b.endBar as number, ...(b.bpm ? { bpm: Math.round(b.bpm as number) } : {}) };
    res.status(201).json(store.recordPass(req.params.tabId, section, pass));
  });

  app.get('/api/progress/:tabId', (req, res) => {
    res.json(store.getProgress(req.params.tabId));
  });

  app.put('/api/progress/:tabId', (req, res) => {
    const body = req.body as Partial<TabProgress>;
    if (!Array.isArray(body?.sections)) {
      res.status(400).json({ error: 'A sections array is required.' });
      return;
    }
    res.json(store.putProgress({ tabId: req.params.tabId, sections: body.sections }));
  });

  app.use('/api', guitarsRouter(store));
  app.use('/api', sessionsRouter(store));
  app.use('/api', notesRouter(store));
  app.use('/api', songsRouter(store, songTools, songQueue, linkTools));
  app.use('/api', transcriptionsRouter(store, transcriberTools, transcriptionQueue));

  return app;
}

/** Stored extension: .tex is normalised to .atex so the file endpoint can serve it as text. */
function storedExt(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ext === '.tex' ? '.atex' : ext;
}
