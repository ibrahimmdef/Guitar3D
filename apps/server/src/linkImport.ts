import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { LinkImportStatus } from '@guitar3d/shared';
import { demucsPythonPath, run, separationTempDir, track } from './separator.js';

/**
 * "Add a song from a link": yt-dlp downloads the audio of a page (YouTube, SoundCloud, Vimeo,
 * Instagram, Internet Archive…), audio only, then the song goes through the usual pipeline.
 */

export const LINK_MAX_BYTES = 50 * 1024 * 1024;
/** Whole download (incl. the ffmpeg extraction), G3D_LINK_TIMEOUT_SECONDS, default 120 s. */
export const linkTimeoutMs = () => (Number(process.env.G3D_LINK_TIMEOUT_SECONDS) || 120) * 1000;

/** G3D_LINK_IMPORT=off (or 0/false/no) turns the feature off for a deployment. */
export const linkImportEnabled = (env: NodeJS.ProcessEnv = process.env) => !/^(off|0|false|no)$/i.test(env.G3D_LINK_IMPORT?.trim() ?? '');

/** G3D_DELETE_LINK_ORIGINALS: delete the downloaded original once the stems exist (default on). */
export const deleteLinkOriginals = (env: NodeJS.ProcessEnv = process.env) => !/^(off|0|false|no)$/i.test(env.G3D_DELETE_LINK_ORIGINALS?.trim() ?? '');

export type LinkErrorCode = 'invalid' | 'private' | 'disabled' | 'unsupported' | 'too_long' | 'too_big' | 'blocked' | 'unavailable' | 'timeout' | 'failed';

/** A failure with a message meant for the user. */
export class LinkError extends Error {
  constructor(
    readonly code: LinkErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DownloadOptions {
  signal: AbortSignal;
  /** Download progress 0..1. */
  onProgress: (fraction: number) => void;
  maxSeconds: number;
}

export interface DownloadResult {
  /** Absolute path of the downloaded audio (inside the work dir passed in). */
  file: string;
  title?: string;
  artist?: string;
  duration?: number;
}

/** Everything link import needs from the outside world (mocked in tests). */
export interface LinkTools {
  status(): Promise<LinkImportStatus>;
  /** All addresses `host` resolves to (SSRF guard). */
  resolve(host: string): Promise<string[]>;
  /** Downloads the audio of `url` into `workDir`; rejects with a `LinkError`. */
  download(url: string, workDir: string, opts: DownloadOptions): Promise<DownloadResult>;
}

// ---- URL validation / SSRF guard -------------------------------------------------------------

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1);
  const zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || // this-net, private, loopback, multicast + reserved
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local (cloud metadata)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF / 192.0.0.0/24 and TEST-NET-1 (192.0.2.x)
      (a === 198 && (b === 18 || b === 19)) // benchmarking
    );
  }
  if (!net.isIPv6(addr)) return true; // not an IP at all: refuse
  // IPv4-mapped / -compatible (::ffff:10.0.0.1, ::ffff:a00:1)
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return isPrivateAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  if (addr === '::' || addr === '::1') return true;
  const first = parseInt(addr.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && parseInt(addr.split(':')[1] || '0', 16) === 0xdb8 || // documentation
    first === 0x64 // 64:ff9b::/96 NAT64 can reach IPv4 private ranges
  );
}

/**
 * Checks a pasted link: http(s) only, no credentials, and the host must resolve to public
 * addresses only. Returns the normalised URL or throws a `LinkError`.
 */
export async function checkLink(raw: unknown, resolve: (host: string) => Promise<string[]>): Promise<string> {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new LinkError('invalid', 'Paste a link to a song or video.');
  if (text.length > 2000) throw new LinkError('invalid', 'That link is too long.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new LinkError('invalid', 'That does not look like a link (https://…).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LinkError('invalid', 'Only http(s) links are supported.');
  if (url.username || url.password) throw new LinkError('invalid', 'Links with a user name or password are not supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new LinkError('private', 'Links to local or private addresses are not allowed.');
  }
  let addrs: string[];
  if (net.isIP(host)) addrs = [host];
  else {
    if (!host.includes('.')) throw new LinkError('private', 'Links to local or private addresses are not allowed.');
    try {
      addrs = await resolve(host);
    } catch {
      throw new LinkError('invalid', `Could not find the site “${host}”. Check the link.`);
    }
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new LinkError('private', 'Links to local or private addresses are not allowed.');
  url.hash = '';
  return url.toString();
}

// ---- yt-dlp output -----------------------------------------------------------------------------

/**
 * yt-dlp prints `[download]  42.3% of   3.10MiB at  1.20MiB/s ETA 00:02` (one per line with
 * --newline). Returns the last percentage in `chunk` as 0..1, or null.
 */
export function parseYtDlpProgress(chunk: string): number | null {
  let last: number | null = null;
  for (const m of chunk.matchAll(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/g)) last = Math.min(100, Number(m[1])) / 100;
  return last;
}

/** Maps yt-dlp's output (stdout + stderr) of a failed or empty download to a user-facing error. */
export function mapYtDlpError(output: string, maxSeconds: number): LinkError {
  const o = output;
  if (/does not pass filter/i.test(o)) {
    return new LinkError('too_long', `Song too long (max ${Math.round(maxSeconds / 60)} min).`);
  }
  if (/larger than max-filesize|File is larger than/i.test(o)) {
    return new LinkError('too_big', `The audio is too large (max ${LINK_MAX_BYTES / 1024 / 1024} MB).`);
  }
  if (/Unsupported URL|is not a valid URL|no suitable extractor/i.test(o)) {
    return new LinkError('unsupported', 'This site is not supported. Upload the audio file instead.');
  }
  if (/not a bot|Sign in to confirm|confirm your age|login required|log in|logged-in|cookies|HTTP Error 403|HTTP Error 429|Too Many Requests|rate.?limit|blocked|captcha|geo.?restrict|not available in your country/i.test(o)) {
    return new LinkError('blocked', 'This site blocked the download. Upload the audio file instead.');
  }
  if (/Private video|video unavailable|is unavailable|has been removed|HTTP Error 404/i.test(o)) {
    return new LinkError('unavailable', 'This video or track is unavailable (removed or private).');
  }
  if (/Requested format is not available|no (audio|video) formats|There's no video/i.test(o)) {
    return new LinkError('unsupported', 'No audio found at this link.');
  }
  const last = o
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => /^ERROR:/.test(l))
    .pop();
  return new LinkError('failed', `Download failed${last ? `: ${last.replace(/^ERROR:\s*/, '').slice(0, 300)}` : '.'}`);
}

// ---- real implementation -----------------------------------------------------------------------

export const LINK_SETUP_HINT = 'Run apps/server/scripts/setup-demucs.sh (installs yt-dlp into the Demucs venv) or put yt-dlp on PATH / set G3D_YTDLP.';

/** Candidate yt-dlp binaries: G3D_YTDLP, else `yt-dlp` on PATH, else the Demucs venv. */
export function ytDlpCandidates(env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  if (env.G3D_YTDLP) return [env.G3D_YTDLP];
  return ['yt-dlp', path.join(path.dirname(demucsPythonPath(env, home)), 'yt-dlp')];
}

export class YtDlpTools implements LinkTools {
  private cached: { at: number; status: LinkImportStatus; bin?: string } | null = null;

  constructor(
    private readonly candidates = ytDlpCandidates(),
    private readonly ffmpeg = process.env.G3D_FFMPEG,
  ) {}

  async status(): Promise<LinkImportStatus> {
    return (await this.check()).status;
  }

  private async check() {
    if (!linkImportEnabled()) return { at: Date.now(), status: { available: false, reason: 'Adding songs from links is turned off on this server.' } };
    if (this.cached && (this.cached.status.available || Date.now() - this.cached.at < 15_000)) return this.cached;
    let found: string | undefined;
    for (const bin of this.candidates) {
      try {
        await run(bin, ['--version']);
        found = bin;
        break;
      } catch {
        /* try the next one */
      }
    }
    this.cached = found
      ? { at: Date.now(), status: { available: true }, bin: found }
      : { at: Date.now(), status: { available: false, reason: 'yt-dlp is not installed on the server.', setupHint: LINK_SETUP_HINT } };
    return this.cached;
  }

  async resolve(host: string) {
    const all = await dns.promises.lookup(host, { all: true, verbatim: true });
    return all.map((a) => a.address);
  }

  async download(url: string, workDir: string, { signal, onProgress, maxSeconds }: DownloadOptions): Promise<DownloadResult> {
    const { status, bin } = await this.check();
    if (!status.available || !bin) throw new LinkError('disabled', status.reason ?? 'Adding songs from links is unavailable.');
    const timeout = AbortSignal.timeout(linkTimeoutMs());
    const both = AbortSignal.any([signal, timeout]);
    const metaFile = path.join(workDir, 'meta.json');
    const cacheDir = path.join(separationTempDir(), 'yt-dlp-cache');
    const args = [
      '--ignore-config', // no user config (could add cookies or exec hooks)
      '--no-cookies',
      '--no-playlist',
      '--playlist-items', '1',
      '--newline',
      '--color', 'never',
      '--no-mtime',
      '--socket-timeout', '20',
      '--retries', '2',
      '--cache-dir', cacheDir,
      // YouTube needs a JS runtime for its player challenges; Node runs this server anyway.
      '--js-runtimes', `node:${process.execPath}`,
      '-f', 'bestaudio/best',
      '--max-filesize', `${LINK_MAX_BYTES / 1024 / 1024}M`,
      '--match-filters', `duration <=? ${Math.floor(maxSeconds)}`,
      '-x', '--audio-format', 'm4a',
      '-P', workDir,
      '-P', `temp:${path.join(workDir, 'part')}`,
      '-o', 'original.%(ext)s',
      '--print-to-file', 'after_move:%(.{title,track,artist,uploader,channel,creator,duration})j', metaFile,
      ...(this.ffmpeg ? ['--ffmpeg-location', this.ffmpeg] : []),
      '--', url,
    ];
    let output = '';
    const collect = (s: string) => {
      output = (output + s).slice(-40_000);
      const p = parseYtDlpProgress(s);
      if (p != null) onProgress(p);
    };
    try {
      await run(bin, args, { signal: both, onStdout: collect, onStderr: collect, onSpawn: track, env: { ...process.env, TMPDIR: workDir } });
    } catch (e) {
      if (signal.aborted) throw e;
      if (timeout.aborted) throw new LinkError('timeout', `The download took too long (limit ${Math.round(linkTimeoutMs() / 1000)} s). Upload the audio file instead.`);
      throw mapYtDlpError(`${output}\n${(e as Error).message}`, maxSeconds);
    }
    const file = fs.readdirSync(workDir).find((f) => f.startsWith('original.') && !f.endsWith('.part'));
    if (!file) throw mapYtDlpError(output, maxSeconds);
    let meta: Record<string, unknown> = {};
    try {
      const lines = fs.readFileSync(metaFile, 'utf8').trim().split('\n');
      meta = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    } catch {
      /* metadata is best effort */
    }
    const s = (v: unknown) => (typeof v === 'string' && v.trim() && v !== 'NA' ? v.trim() : undefined);
    return {
      file: path.join(workDir, file),
      title: s(meta.track) ?? s(meta.title),
      artist: s(meta.artist) ?? s(meta.creator) ?? s(meta.uploader) ?? s(meta.channel),
      duration: typeof meta.duration === 'number' ? meta.duration : undefined,
    };
  }
}
