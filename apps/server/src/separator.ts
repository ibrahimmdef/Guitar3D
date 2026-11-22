import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STEM_NAMES, type SeparatorStatus, type StemName } from '@guitar3d/shared';

/**
 * Stem separation with Demucs (model htdemucs_6s) in a child process, then ffmpeg compresses each
 * stem to MP3. Everything runs locally; the Python env comes from apps/server/scripts/setup-demucs.sh.
 */

export const DEMUCS_MODEL = 'htdemucs_6s';
/** Stored stem format: CBR MP3 seeks precisely in <audio> and plays everywhere. */
export const STEM_EXT = '.mp3';
const STEM_BITRATE = '128k';
/** Share of the progress bar spent in Demucs; the rest is MP3 encoding. */
const DEMUCS_SHARE = 0.92;

export interface AudioInfo {
  duration: number;
  title?: string;
  artist?: string;
}

export interface SeparateOptions {
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

/** Everything the songs API needs from the outside world (mocked in tests). */
export interface SongTools {
  status(): Promise<SeparatorStatus>;
  /** Reads duration and tags; rejects when the file is not decodable audio. */
  probe(file: string): Promise<AudioInfo>;
  /** Writes `<stem>.mp3` files into `outDir` and resolves with the stems written. */
  separate(input: string, outDir: string, opts: SeparateOptions): Promise<StemName[]>;
}

export const SETUP_HINT_UNIX = 'apps/server/scripts/setup-demucs.sh';
export const SETUP_HINT = `Run once on the server: ${SETUP_HINT_UNIX} (needs uv and ffmpeg).`;

/** Python of the Demucs venv: G3D_DEMUCS_PYTHON, else the default created by the setup script. */
export function demucsPythonPath(env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  if (env.G3D_DEMUCS_PYTHON) return env.G3D_DEMUCS_PYTHON;
  const data = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(data, 'guitar3d', 'demucs-venv', 'bin', 'python');
}

/** Scratch space for separation (G3D_TMP_DIR). Not /tmp: it is often a small tmpfs (RAM). */
export function separationTempDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  if (env.G3D_TMP_DIR) return env.G3D_TMP_DIR;
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'g3d-tmp');
}

/**
 * Demucs prints tqdm bars (`\r`-separated) like ` 45%|████▌     | 23.4/52.0 [00:10<00:12, 2.3seconds/s]`.
 * Returns the last percentage in `chunk` as 0..1, or null when there is none.
 */
export function parseDemucsProgress(chunk: string): number | null {
  let last: number | null = null;
  for (const m of chunk.matchAll(/(\d{1,3})%\|/g)) last = Math.min(100, Number(m[1])) / 100;
  return last;
}

/** Overall progress: Demucs part scaled into [0, DEMUCS_SHARE], then one step per encoded stem. */
export function overallProgress(demucs: number, encoded = 0, total = STEM_NAMES.length) {
  return Math.min(1, DEMUCS_SHARE * demucs + (1 - DEMUCS_SHARE) * (encoded / total));
}

/** Runs a command, collecting output; rejects with the tail of stderr on a non-zero exit. */
function run(cmd: string, args: string[], opts: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; onStderr?: (s: string) => void; onSpawn?: (c: ChildProcess) => void } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new Error('aborted'));
    const child = spawn(cmd, args, { env: opts.env ?? process.env, windowsHide: true });
    opts.onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    const abort = () => child.kill();
    opts.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
    });
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr = (stderr + s).slice(-20_000);
      opts.onStderr?.(s);
    });
    child.on('error', (e) => {
      opts.signal?.removeEventListener('abort', abort);
      reject(e);
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', abort);
      if (opts.signal?.aborted) reject(new Error('aborted'));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(lastLines(stderr) || `${path.basename(cmd)} exited with code ${code}`));
    });
  });
}

/** Last meaningful stderr lines (skips progress bars). */
function lastLines(stderr: string) {
  return stderr
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/\d%\|/.test(l))
    .slice(-3)
    .join(' · ')
    .slice(0, 400);
}

/** Child processes still running; killed when the server process exits. */
const live = new Set<ChildProcess>();
process.once('exit', () => live.forEach((c) => c.kill()));
const track = (c: ChildProcess) => {
  live.add(c);
  c.once('close', () => live.delete(c));
};

export class DemucsTools implements SongTools {
  private cached: { at: number; status: SeparatorStatus } | null = null;

  constructor(
    private readonly python = demucsPythonPath(),
    private readonly tmpRoot = separationTempDir(),
    private readonly ffmpeg = process.env.G3D_FFMPEG || 'ffmpeg',
    private readonly ffprobe = process.env.G3D_FFPROBE || 'ffprobe',
  ) {}

  /** Cached: positive answers for the process lifetime, negative ones for 15 s (setup may be running). */
  async status(): Promise<SeparatorStatus> {
    if (this.cached && (this.cached.status.available || Date.now() - this.cached.at < 15_000)) return this.cached.status;
    const status = await this.check();
    this.cached = { at: Date.now(), status };
    return status;
  }

  private async check(): Promise<SeparatorStatus> {
    try {
      await run(this.ffmpeg, ['-hide_banner', '-version']);
    } catch {
      return { available: false, reason: 'ffmpeg not found.', setupHint: 'Install ffmpeg on the server (e.g. apt install ffmpeg) and put it on PATH.' };
    }
    if (!fs.existsSync(this.python)) {
      return { available: false, reason: 'Stem separation (Demucs) is not installed.', setupHint: SETUP_HINT };
    }
    try {
      await run(this.python, ['-c', 'import importlib.util as u, sys; sys.exit(0 if u.find_spec("demucs") and u.find_spec("torch") else 3)']);
    } catch {
      return { available: false, reason: `Demucs is missing from this Python env: ${this.python}`, setupHint: SETUP_HINT };
    }
    return { available: true };
  }

  async probe(file: string): Promise<AudioInfo> {
    const { stdout } = await run(this.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist,TITLE,ARTIST', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'json', file]);
    const j = JSON.parse(stdout) as { format?: { duration?: string; tags?: Record<string, string> }; streams?: unknown[] };
    const duration = Number(j.format?.duration);
    if (!j.streams?.length || !Number.isFinite(duration) || duration <= 0) throw new Error('No audio stream.');
    const tags = Object.fromEntries(Object.entries(j.format?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()]));
    return { duration, title: tags.title || undefined, artist: tags.artist || undefined };
  }

  async separate(input: string, outDir: string, { onProgress, signal }: SeparateOptions): Promise<StemName[]> {
    fs.mkdirSync(this.tmpRoot, { recursive: true });
    const work = fs.mkdtempSync(path.join(this.tmpRoot, 'sep-'));
    try {
      const threads = String(Math.max(1, Math.min(4, os.cpus().length - 1)));
      // Memory: one job, CPU, short segments (htdemucs max is 7.8 s), no parallel jobs.
      await run(
        this.python,
        ['-m', 'demucs.separate', '-n', DEMUCS_MODEL, '-d', 'cpu', '-j', '0', '--segment', '7', '--overlap', '0.1', '-o', work, '--filename', '{stem}.{ext}', input],
        {
          signal,
          env: { ...process.env, TMPDIR: work, OMP_NUM_THREADS: threads, MKL_NUM_THREADS: threads, PYTHONUNBUFFERED: '1' },
          onSpawn: (c) => {
            track(c);
            try {
              if (c.pid) os.setPriority(c.pid, 10); // keep the UI responsive
            } catch {
              /* not permitted: fine */
            }
          },
          onStderr: (s) => {
            const p = parseDemucsProgress(s);
            if (p != null) onProgress(overallProgress(p));
          },
        },
      );
      const stemDir = path.join(work, DEMUCS_MODEL);
      fs.mkdirSync(outDir, { recursive: true });
      const done: StemName[] = [];
      for (const stem of STEM_NAMES) {
        const wav = path.join(stemDir, `${stem}.wav`);
        if (!fs.existsSync(wav)) continue;
        await run(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', STEM_BITRATE, path.join(outDir, `${stem}${STEM_EXT}`)], { signal, onSpawn: track });
        fs.rmSync(wav, { force: true });
        done.push(stem);
        onProgress(overallProgress(1, done.length));
      }
      if (!done.length) throw new Error('Demucs produced no stems.');
      return done;
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}
