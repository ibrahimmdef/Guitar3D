import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Song, StemName } from '@guitar3d/shared';
import { STEM_NAMES } from '@guitar3d/shared';
import type { Store } from './store.js';
import { separationTempDir, STEM_EXT, type SongTools } from './separator.js';
import { JobLock } from './jobLock.js';
import { checkLink, deleteLinkOriginals, LinkError, type LinkTools } from './linkImport.js';

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

/** Title shown for a link song until yt-dlp's metadata arrives. */
export const linkPlaceholderTitle = (url: string) => {
  try {
    return `Song from ${new URL(url).hostname.replace(/^www\./, '')}`;
  } catch {
    return 'Song from a link';
  }
};

/** Moves a file, falling back to copy + delete across file systems. */
function moveFile(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.rmSync(from, { force: true });
  }
}

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
    /** yt-dlp for songs added from a link (undefined: link songs fail with a clear error). */
    private readonly links?: LinkTools,
  ) {}

  /** Songs left 'queued', 'downloading' or 'separating' by a previous run start again. */
  resume() {
    for (const s of [...this.store.listSongs()].reverse()) {
      if (s.status === 'queued' || s.status === 'downloading' || s.status === 'separating') {
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

  /** Link songs download first (network-bound, outside the heavy-job lock), then separate. */
  private async process(id: string, ctrl: AbortController) {
    const song = this.store.getSong(id);
    if (!song) return;
    const needsDownload = !!song.sourceUrl && (!song.fileName || !fs.existsSync(path.join(this.store.songDir(id), song.fileName)));
    if (needsDownload && !(await this.download(id, song.sourceUrl!, ctrl))) return;
    return this.lock.run(() => this.separate(id, ctrl));
  }

  /** Downloads a link song's audio and validates it like an upload. Resolves false on failure. */
  private async download(id: string, url: string, ctrl: AbortController): Promise<boolean> {
    const fail = (message: string) => {
      if (!ctrl.signal.aborted && this.store.getSong(id)) this.store.updateSong(id, { status: 'error', progress: 0, error: message.slice(0, 500) });
      return false;
    };
    if (!this.links) return fail('Adding songs from links is unavailable on this server.');
    this.store.updateSong(id, { status: 'downloading', progress: 0, error: undefined });
    const tmpRoot = separationTempDir();
    fs.mkdirSync(tmpRoot, { recursive: true });
    const work = fs.mkdtempSync(path.join(tmpRoot, 'dl-'));
    let saved = 0;
    try {
      const got = await this.links.download(url, work, {
        signal: ctrl.signal,
        maxSeconds: maxSongSeconds(),
        onProgress: (p) => {
          if (p - saved >= 0.02 && this.store.getSong(id)) {
            saved = p;
            this.store.updateSong(id, { progress: Math.round(p * 1000) / 1000 });
          }
        },
      });
      if (ctrl.signal.aborted || !this.store.getSong(id)) return false;
      // Same checks as an upload: extension, size, decodable audio, duration.
      const ext = path.extname(got.file).toLowerCase();
      if (!AUDIO_EXTS.includes(ext)) return fail('The download is not a supported audio file. Upload the audio file instead.');
      if (fs.statSync(got.file).size > MAX_SONG_BYTES) return fail(`The audio is too large (max ${MAX_SONG_BYTES / 1024 / 1024} MB).`);
      let info;
      try {
        info = await this.tools.probe(got.file);
      } catch {
        return fail('The downloaded file is not valid audio. Upload the audio file instead.');
      }
      if (info.duration > maxSongSeconds()) return fail(`Song too long (max ${Math.round(maxSongSeconds() / 60)} min).`);
      const song = this.store.getSong(id);
      if (!song) return false;
      const dir = this.store.songDir(id);
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `original${ext}`;
      moveFile(got.file, path.join(dir, fileName));
      this.store.updateSong(id, {
        fileName,
        duration: Math.round(info.duration * 100) / 100,
        // Keep a title/artist the user typed; otherwise use the page's metadata.
        title: song.title === linkPlaceholderTitle(url) ? (got.title || info.title || song.title).slice(0, 200) : song.title,
        artist: song.artist || (got.artist || info.artist || '').slice(0, 200),
        status: 'queued',
        progress: 0,
        originalDeleted: undefined,
      });
      return true;
    } catch (e) {
      if (ctrl.signal.aborted) return false;
      return fail(e instanceof LinkError ? e.message : `Download failed: ${(e as Error).message}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Data retention: a downloaded original is not kept once its stems exist. */
  private dropLinkOriginal(id: string) {
    const song = this.store.getSong(id);
    if (!song?.sourceUrl || !song.fileName || !deleteLinkOriginals()) return;
    fs.rmSync(path.join(this.store.songDir(id), song.fileName), { force: true });
    this.store.updateSong(id, { originalDeleted: true });
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
      this.dropLinkOriginal(id);
    } catch (e) {
      if (ctrl.signal.aborted || !this.store.getSong(id)) return;
      this.store.updateSong(id, { status: 'error', error: `Separation failed: ${(e as Error).message}`.slice(0, 500) });
    }
  }
}

/** `/api/songs`: upload audio, follow separation, stream stems. */
export function songsRouter(store: Store, tools: SongTools, queue: SongQueue, links?: LinkTools) {
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
    const [sep, linkImport] = await Promise.all([tools.status(), links ? links.status() : Promise.resolve({ available: false, reason: 'Adding songs from links is unavailable on this server.' })]);
    res.json({ ...sep, linkImport });
  });

  /** `{ url, title?, artist? }`: download the audio of a page with yt-dlp, then separate it. */
  r.post('/songs/from-link', async (req, res) => {
    const status = links ? await links.status() : { available: false, reason: 'Adding songs from links is unavailable on this server.' };
    if (!links || !status.available) {
      res.status(503).json({ error: status.reason ?? 'Adding songs from links is unavailable.' });
      return;
    }
    let url: string;
    try {
      url = await checkLink((req.body as { url?: unknown } | undefined)?.url, (h) => links.resolve(h));
    } catch (e) {
      if (!(e instanceof LinkError)) throw e;
      res.status(400).json({ error: e.message, code: e.code });
      return;
    }
    const song: Song = store.addSong({
      id: crypto.randomUUID(),
      title: str(req.body?.title) || linkPlaceholderTitle(url),
      artist: str(req.body?.artist),
      fileName: '',
      uploadedAt: new Date().toISOString(),
      status: 'queued',
      progress: 0,
      stems: [],
      sourceUrl: url,
    });
    queue.enqueue(song.id);
    res.status(201).json(song);
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
    if (!song || !song.fileName) return notFound(res);
    if (song.originalDeleted) {
      res.status(404).json({ error: 'The downloaded original was deleted after separation; the stems are kept.' });
      return;
    }
    res.sendFile(path.join(store.songDir(song.id), song.fileName), { dotfiles: 'allow' });
  });

  r.delete('/songs/:id', (req, res) => {
    queue.cancel(req.params.id);
    res.status(store.deleteSong(req.params.id) ? 204 : 404).end();
  });

  return r;
}
