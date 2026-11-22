import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TranscriberStatus } from '@guitar3d/shared';
import { demucsPythonPath, run, separationTempDir, track } from './separator.js';
import type { RawTranscription } from './transcribe/index.js';

/**
 * Note transcription with Spotify Basic Pitch (ONNX backend, no TensorFlow) plus librosa beat
 * tracking and tuning estimation, in a child process (scripts/transcribe.py). The Python env is the
 * one made by scripts/setup-demucs.sh.
 */

export interface TranscribeOptions {
  /** Skip beat tracking (the caller knows the tempo). */
  noBeats?: boolean;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

/** Everything the transcription queue needs from the outside world (mocked in tests). */
export interface TranscriberTools {
  status(): Promise<TranscriberStatus>;
  transcribe(input: string, opts: TranscribeOptions): Promise<RawTranscription>;
}

const SETUP_HINT = 'Run once on the server: apps/server/scripts/setup-demucs.sh (installs Demucs and Basic Pitch; needs uv and ffmpeg).';
export const TRANSCRIBE_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/transcribe.py');

/** `PROGRESS 0.42` lines on stderr → the last value, or null. */
export function parseTranscribeProgress(chunk: string): number | null {
  let last: number | null = null;
  for (const m of chunk.matchAll(/PROGRESS (\d*\.?\d+)/g)) last = Math.min(1, Math.max(0, Number(m[1])));
  return last;
}

export class BasicPitchTools implements TranscriberTools {
  private cached: { at: number; status: TranscriberStatus } | null = null;

  constructor(
    private readonly python = demucsPythonPath(),
    private readonly tmpRoot = separationTempDir(),
    private readonly ffmpeg = process.env.G3D_FFMPEG || 'ffmpeg',
    private readonly script = TRANSCRIBE_SCRIPT,
  ) {}

  async status(): Promise<TranscriberStatus> {
    if (this.cached && (this.cached.status.available || Date.now() - this.cached.at < 15_000)) return this.cached.status;
    const status = await this.check();
    this.cached = { at: Date.now(), status };
    return status;
  }

  private async check(): Promise<TranscriberStatus> {
    try {
      await run(this.ffmpeg, ['-hide_banner', '-version']);
    } catch {
      return { available: false, reason: 'ffmpeg not found.', setupHint: 'Install ffmpeg on the server and put it on PATH.' };
    }
    if (!fs.existsSync(this.python)) return { available: false, reason: 'Transcription (Basic Pitch) is not installed.', setupHint: SETUP_HINT };
    try {
      await run(this.python, ['-c', 'import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ("basic_pitch", "onnxruntime", "librosa")) else 3)']);
    } catch {
      return { available: false, reason: `Basic Pitch is missing from this Python env: ${this.python}`, setupHint: SETUP_HINT };
    }
    return { available: true };
  }

  async transcribe(input: string, { noBeats, onProgress, signal }: TranscribeOptions): Promise<RawTranscription> {
    fs.mkdirSync(this.tmpRoot, { recursive: true });
    const work = fs.mkdtempSync(path.join(this.tmpRoot, 'tr-'));
    try {
      // Decode anything (mp3, webm/opus from the browser…) to the model's mono 22.05 kHz WAV first.
      const wav = path.join(work, 'input.wav');
      await run(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', wav], { signal, onSpawn: track });
      onProgress(0.05);
      const out = path.join(work, 'notes.json');
      const threads = String(Math.max(1, Math.min(4, os.cpus().length - 1)));
      await run(this.python, [this.script, wav, '--out', out, ...(noBeats ? ['--no-beats'] : [])], {
        signal,
        env: { ...process.env, TMPDIR: work, OMP_NUM_THREADS: threads, NUMBA_CACHE_DIR: path.join(this.tmpRoot, 'numba-cache'), PYTHONUNBUFFERED: '1' },
        onSpawn: (c) => {
          track(c);
          try {
            if (c.pid) os.setPriority(c.pid, 10);
          } catch {
            /* not permitted: fine */
          }
        },
        onStderr: (s) => {
          const p = parseTranscribeProgress(s);
          if (p != null) onProgress(0.05 + 0.9 * p);
        },
      });
      return JSON.parse(fs.readFileSync(out, 'utf8')) as RawTranscription;
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}
