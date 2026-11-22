import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Song, StemName } from '@guitar3d/shared';
import { STEM_NAMES } from '@guitar3d/shared';
import type { Store } from './store.js';
import { STEM_EXT, type SongTools } from './separator.js';
import { JobLock } from './jobLock.js';

/** Accepted uploads (validated by extension and then by ffprobe). */
export const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac'];
export const MAX_SONG_BYTES = 50 * 1024 * 1024;
/**
 * Longest accepted song (G3D_MAX_SONG_SECONDS, default 10 min). Demucs keeps the whole track and its
 * six stems in memory: a 4-min song peaks around 1.9 GB RSS on CPU.
 */
export const maxSongSeconds = () => Number(process.env.G3D_MAX_SONG_SECONDS) || 600;

/** The song id chosen for an upload in progress (multer's destination callback needs it). */
const uploadIds = new WeakMap<object, string>();
const uploadId = (req: object) => uploadIds.get(req) ?? crypto.randomUUID();

const stemsDir = (store: Store, id: string) => path.join(store.songDir(id), 'stems');

/**
 * Separation job queue: one worker, jobs run in upload order. `concurrency` is kept as a knob for a
 * bigger host; with Demucs on CPU each job needs ~1–2 GB RAM, so the default is 1.
 */
export class SongQueue {
  private pending: string[] = [];
  private running = new Map<string, AbortController>();
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly tools: SongTools,
    private readonly concurrency = 1,
    /** Shared with the transcription queue so only one heavy job runs at a time. */
    private readonly lock = new JobLock(),
  ) {}

  /** Songs left 'queued' or 'separating' by a previous run start again. */
  resume() {
    for (const s of [...this.store.listSongs()].reverse()) {
      if (s.status === 'queued' || s.status === 'separating') {
        this.store.updateSong(s.id, { status: 'queued', progress: 0 });
        this.enqueue(s.id);
      }
    }
  }

  enqueue(id: string) {
    if (!this.pending.includes(id) && !this.running.has(id)) this.pending.push(id);
    queueMicrotask(() => this.pump());
  }

  /** Drops a pending job or stops the running one (its child process is killed). */
  cancel(id: string) {
    this.pending = this.pending.filter((x) => x !== id);
    this.running.get(id)?.abort();
  }

  get busy() {
    return this.pending.length + this.running.size > 0;
  }

  /** Resolves when no job is pending or running (tests). */
  idle() {
    return this.busy ? new Promise<void>((r) => this.idleWaiters.push(r)) : Promise.resolve();
  }

  private pump() {
    while (this.running.size < this.concurrency && this.pending.length) {
      const id = this.pending.shift()!;
      const ctrl = new AbortController();
      this.running.set(id, ctrl);
      void this.process(id, ctrl).finally(() => {
        this.running.delete(id);
        this.pump();
        if (!this.busy) this.idleWaiters.splice(0).forEach((r) => r());
      });
    }
  }

  private process(id: string, ctrl: AbortController) {
    return this.lock.run(() => this.separate(id, ctrl));
  }

  private async separate(id: string, ctrl: AbortController) {
    if (ctrl.signal.aborted) return;
    const song = this.store.getSong(id);
    if (!song) return;
    const status = await this.tools.status();
    if (!status.available) {
      this.store.updateSong(id, { status: 'error', progress: 0, error: status.reason ?? 'Stem separation is unavailable.' });
      return;
    }
    this.store.updateSong(id, { status: 'separating', progress: 0, error: undefined });
    const started = Date.now();
    let saved = 0;
    try {
      const stems = await this.tools.separate(path.join(this.store.songDir(id), song.fileName), stemsDir(this.store, id), {
        signal: ctrl.signal,
        onProgress: (p) => {
          // db.json is rewritten on every update: only persist whole-percent steps.
          if (p - saved >= 0.01 && this.store.getSong(id)) {
            saved = p;
            this.store.updateSong(id, { progress: Math.round(p * 1000) / 1000 });
          }
        },
      });
      if (!this.store.getSong(id)) return;
      this.store.updateSong(id, { status: 'ready', progress: 1, stems, separationSeconds: Math.round((Date.now() - started) / 100) / 10 });
    } catch (e) {
      if (ctrl.signal.aborted || !this.store.getSong(id)) return;
      this.store.updateSong(id, { status: 'error', error: `Separation failed: ${(e as Error).message}`.slice(0, 500) });
    }
  }
}

/** `/api/songs`: upload audio, follow separation, stream stems. */
export function songsRouter(store: Store, tools: SongTools, queue: SongQueue) {
  const r = Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const dir = store.songDir(uploadId(req));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => cb(null, `original${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_SONG_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, AUDIO_EXTS.includes(path.extname(file.originalname).toLowerCase())),
  });

  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const notFound = (res: import('express').Response) => res.status(404).json({ error: 'Song not found.' });

  r.get('/songs', (_req, res) => {
    res.json(store.listSongs());
  });

  r.get('/songs/separator', async (_req, res) => {
    res.json(await tools.status());
  });

  r.post('/songs', (req, res) => {
    const id = crypto.randomUUID();
    uploadIds.set(req, id);
    upload.single('file')(req, res, async (err: unknown) => {
      const cleanup = () => fs.rmSync(store.songDir(id), { recursive: true, force: true });
      if (err) {
        cleanup();
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        res.status(tooBig ? 413 : 400).json({ error: tooBig ? `File too large (max ${MAX_SONG_BYTES / 1024 / 1024} MB).` : 'Upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Upload a supported audio file (mp3, wav, flac, ogg, m4a).' });
        return;
      }
      let info;
      try {
        info = await tools.probe(req.file.path);
      } catch {
        cleanup();
        res.status(400).json({ error: 'Could not read the file: not a valid audio file.' });
        return;
      }
      if (info.duration > maxSongSeconds()) {
        cleanup();
        res.status(400).json({ error: `Song too long (max ${Math.round(maxSongSeconds() / 60)} min).` });
        return;
      }
      const base = path.basename(req.file.originalname, path.extname(req.file.originalname)).replace(/[_]+/g, ' ').trim();
      const song: Song = store.addSong({
        id,
        title: str(req.body?.title) || info.title || base || 'Untitled song',
        artist: str(req.body?.artist) || info.artist || '',
        fileName: req.file.filename,
        duration: Math.round(info.duration * 100) / 100,
        uploadedAt: new Date().toISOString(),
        status: 'queued',
        progress: 0,
        stems: [],
      });
      queue.enqueue(id);
      res.status(201).json(song);
    });
  });

  r.get('/songs/:id', (req, res) => {
    const song = store.getSong(req.params.id);
    if (!song) return notFound(res);
    res.json(song);
  });

  /** Rename: `{ title?, artist? }`. */
  r.patch('/songs/:id', (req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; artist?: unknown };
    const patch: Partial<Song> = {};
    if (body.title !== undefined) {
      if (!str(body.title)) {
        res.status(400).json({ error: 'title must not be empty.' });
        return;
      }
      patch.title = str(body.title);
    }
    if (body.artist !== undefined) patch.artist = str(body.artist);
    const song = store.updateSong(req.params.id, patch);
    if (!song) return notFound(res);
    res.json(song);
  });

  /** Re-queues a failed song (e.g. after installing Demucs). */
  r.post('/songs/:id/retry', (req, res) => {
    const song = store.getSong(req.params.id);
    if (!song) return notFound(res);
    if (song.status !== 'error') {
      res.status(409).json({ error: 'Song is already processing or ready.' });
      return;
    }
    queue.enqueue(song.id);
    res.json(store.updateSong(song.id, { status: 'queued', progress: 0, error: undefined }));
  });

  r.get('/songs/:id/stems/:stem', (req, res) => {
    const song = store.getSong(req.params.id);
    const stem = req.params.stem as StemName;
    if (!song || !STEM_NAMES.includes(stem) || !song.stems.includes(stem)) return notFound(res);
    // dotfiles: 'allow' so a data dir below a dot folder (e.g. ~/.local) still serves.
    res.sendFile(path.join(stemsDir(store, song.id), `${stem}${STEM_EXT}`), { dotfiles: 'allow', maxAge: '1h' });
  });

  r.get('/songs/:id/original', (req, res) => {
    const song = store.getSong(req.params.id);
    if (!song) return notFound(res);
    res.sendFile(path.join(store.songDir(song.id), song.fileName), { dotfiles: 'allow' });
  });

  r.delete('/songs/:id', (req, res) => {
    queue.cancel(req.params.id);
    res.status(store.deleteSong(req.params.id) ? 204 : 404).end();
  });

  return r;
}
