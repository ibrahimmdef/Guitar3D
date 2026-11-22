import { Router, type Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TranscriptionJob } from '@guitar3d/shared';
import type { Store } from './store.js';
import { JobLock } from './jobLock.js';
import { STEM_EXT } from './separator.js';
import type { TranscriberTools } from './transcriber.js';
import { buildAutoTab } from './transcribe/index.js';

/** Recording uploads: what browsers' MediaRecorder makes plus the usual audio files. */
export const RECORDING_EXTS = ['.webm', '.weba', '.ogg', '.oga', '.opus', '.m4a', '.mp4', '.aac', '.wav', '.mp3', '.flac'];
export const MAX_RECORDING_BYTES = 30 * 1024 * 1024;

const uploadIds = new WeakMap<object, string>();
const ACTIVE = new Set(['queued', 'running']);

/** Transcription jobs, one at a time, sharing the heavy-job lock with stem separation. */
export class TranscriptionQueue {
  private pending: string[] = [];
  private running = new Map<string, AbortController>();
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly tools: TranscriberTools,
    private readonly lock = new JobLock(),
  ) {}

  resume() {
    for (const j of [...this.store.listTranscriptions()].reverse()) {
      if (ACTIVE.has(j.status)) {
        this.store.updateTranscription(j.id, { status: 'queued', progress: 0 });
        this.enqueue(j.id);
      }
    }
  }

  enqueue(id: string) {
    if (!this.pending.includes(id) && !this.running.has(id)) this.pending.push(id);
    queueMicrotask(() => this.pump());
  }

  cancel(id: string) {
    this.pending = this.pending.filter((x) => x !== id);
    this.running.get(id)?.abort();
  }

  get busy() {
    return this.pending.length + this.running.size > 0;
  }

  idle() {
    return this.busy ? new Promise<void>((r) => this.idleWaiters.push(r)) : Promise.resolve();
  }

  private pump() {
    while (this.running.size < 1 && this.pending.length) {
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

  /** A song's full mix for beat tracking (undefined for recordings). */
  private beatsInput(job: TranscriptionJob): string | undefined {
    const song = job.source === 'song' && job.songId ? this.store.getSong(job.songId) : undefined;
    const file = song?.fileName ? path.join(this.store.songDir(song.id), song.fileName) : '';
    // link imports may have dropped the original after separation
    return file && fs.existsSync(file) && fs.statSync(file).isFile() ? file : undefined;
  }

  /** The audio to transcribe: the song's separated guitar stem, or the uploaded recording. */
  private input(job: TranscriptionJob): string {
    if (job.source === 'song') {
      const song = job.songId ? this.store.getSong(job.songId) : undefined;
      if (!song) throw new Error('The song was deleted.');
      if (!song.stems.includes('guitar')) throw new Error('The song has no separated guitar track yet.');
      return path.join(this.store.songDir(song.id), 'stems', `guitar${STEM_EXT}`);
    }
    const dir = this.store.recordingDir(job.id);
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.startsWith('recording')) : undefined;
    if (!file) throw new Error('The recording is missing.');
    return path.join(dir, file);
  }

  private async process(id: string, ctrl: AbortController) {
    const fail = (e: unknown) => {
      if (ctrl.signal.aborted || !this.store.getTranscription(id)) return;
      this.store.updateTranscription(id, { status: 'error', error: `Transcription failed: ${(e as Error).message}`.slice(0, 500) });
    };
    const status = await this.tools.status();
    if (!status.available) {
      this.store.updateTranscription(id, { status: 'error', progress: 0, error: status.reason ?? 'Transcription is unavailable.' });
      return;
    }
    let raw;
    const started = Date.now();
    try {
      raw = await this.lock.run(async () => {
        const job = this.store.getTranscription(id);
        if (!job || ctrl.signal.aborted) return null;
        const input = this.input(job);
        this.store.updateTranscription(id, { status: 'running', progress: 0, error: undefined });
        let saved = 0;
        return this.tools.transcribe(input, {
          noBeats: !!job.bpm,
          beatsInput: this.beatsInput(job),
          signal: ctrl.signal,
          onProgress: (p) => {
            if (p - saved >= 0.02 && this.store.getTranscription(id)) {
              saved = p;
              this.store.updateTranscription(id, { progress: Math.round(p * 0.95 * 1000) / 1000 });
            }
          },
        });
      });
    } catch (e) {
      return fail(e);
    }
    const job = this.store.getTranscription(id);
    if (!raw || !job || ctrl.signal.aborted) return;
    try {
      const song = job.songId ? this.store.getSong(job.songId) : undefined;
      const auto = buildAutoTab(raw, { title: `${job.title} (auto)`, artist: song?.artist, bpm: job.bpm, offset: job.offset });
      const tabId = crypto.randomUUID();
      const fileName = `${tabId}.atex`;
      fs.writeFileSync(path.join(this.store.tabsDir, fileName), auto.tex);
      this.store.addTab({
        id: tabId,
        title: `${job.title} (auto)`,
        artist: song?.artist ?? '',
        fileName,
        uploadedAt: new Date().toISOString(),
        format: 'alphatex',
        transcription: {
          jobId: id,
          source: job.source,
          songId: job.songId,
          detected: auto.summary.detected,
          notes: auto.summary.notes,
          lowConfidence: auto.summary.lowConfidence,
        },
      });
      this.store.updateTranscription(id, { status: 'ready', progress: 1, tabId, summary: auto.summary, seconds: Math.round((Date.now() - started) / 100) / 10 });
    } catch (e) {
      fail(e);
    }
  }
}

const num = (v: unknown) => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** `/api/transcriptions`: song guitar stem or microphone recording → auto tab in the library. */
export function transcriptionsRouter(store: Store, tools: TranscriberTools, queue: TranscriptionQueue) {
  const r = Router();
  const notFound = (res: Response) => res.status(404).json({ error: 'Transcription not found.' });
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const dir = store.recordingDir(uploadIds.get(req) ?? crypto.randomUUID());
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => cb(null, `recording${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_RECORDING_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, RECORDING_EXTS.includes(path.extname(file.originalname).toLowerCase())),
  });

  r.get('/transcriptions', (req, res) => {
    const songId = typeof req.query.songId === 'string' ? req.query.songId : '';
    res.json(store.listTranscriptions().filter((j) => !songId || j.songId === songId));
  });

  r.get('/transcriptions/status', async (_req, res) => {
    res.json(await tools.status());
  });

  /** JSON `{ songId }` transcribes a song's guitar stem; multipart `file` (+ title, bpm, offset) a recording. */
  r.post('/transcriptions', (req, res) => {
    if (req.is('application/json')) {
      const songId = str((req.body as { songId?: unknown })?.songId);
      const song = songId ? store.getSong(songId) : undefined;
      if (!song) {
        res.status(404).json({ error: 'Song not found.' });
        return;
      }
      if (song.status !== 'ready' || !song.stems.includes('guitar')) {
        res.status(409).json({ error: 'Separate the song first: the guitar track is not ready.' });
        return;
      }
      const active = store.listTranscriptions().find((j) => j.songId === song.id && ACTIVE.has(j.status));
      if (active) {
        res.json(active);
        return;
      }
      const job = store.addTranscription({ id: crypto.randomUUID(), source: 'song', songId: song.id, title: song.title, createdAt: new Date().toISOString(), status: 'queued', progress: 0 });
      queue.enqueue(job.id);
      res.status(201).json(job);
      return;
    }
    const id = crypto.randomUUID();
    uploadIds.set(req, id);
    upload.single('file')(req, res, (err: unknown) => {
      const cleanup = () => fs.rmSync(store.recordingDir(id), { recursive: true, force: true });
      if (err) {
        cleanup();
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        res.status(tooBig ? 413 : 400).json({ error: tooBig ? `Recording too large (max ${MAX_RECORDING_BYTES / 1024 / 1024} MB).` : 'Upload failed.' });
        return;
      }
      if (!req.file) {
        cleanup();
        res.status(400).json({ error: 'Upload a recording (webm, ogg, m4a, wav, mp3).' });
        return;
      }
      const bpm = num(req.body?.bpm);
      const offset = num(req.body?.offset);
      if (bpm !== undefined && (bpm < 30 || bpm > 300)) {
        cleanup();
        res.status(400).json({ error: 'bpm must be between 30 and 300.' });
        return;
      }
      const job = store.addTranscription({
        id,
        source: 'recording',
        title: str(req.body?.title) || `My playing ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        createdAt: new Date().toISOString(),
        status: 'queued',
        progress: 0,
        ...(bpm ? { bpm, offset: Math.max(0, Math.min(30, offset ?? 0)) } : {}),
      });
      queue.enqueue(id);
      res.status(201).json(job);
    });
  });

  r.get('/transcriptions/:id', (req, res) => {
    const job = store.getTranscription(req.params.id);
    if (!job) return notFound(res);
    res.json(job);
  });

  r.post('/transcriptions/:id/retry', (req, res) => {
    const job = store.getTranscription(req.params.id);
    if (!job) return notFound(res);
    if (job.status !== 'error') {
      res.status(409).json({ error: 'Transcription is already running or done.' });
      return;
    }
    queue.enqueue(job.id);
    res.json(store.updateTranscription(job.id, { status: 'queued', progress: 0, error: undefined }));
  });

  /** Cancels a running job and deletes its recording; the tab it made stays in the library. */
  r.delete('/transcriptions/:id', (req, res) => {
    queue.cancel(req.params.id);
    res.status(store.deleteTranscription(req.params.id) ? 204 : 404).end();
  });

  return r;
}
