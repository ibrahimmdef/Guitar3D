/** YouTube link parsing and a lazy loader for the IFrame Player API. */

export interface VideoLink {
  /** 11-character YouTube video id. */
  id: string;
  /** Video time (s) at tab time 0. */
  offset: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts watch / youtu.be / embed / shorts / live links or a bare id. `t=` becomes the offset. */
export function parseYouTube(input: string): VideoLink | null {
  const s = input.trim();
  if (ID.test(s)) return { id: s, offset: 0 };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
  }
  if (!id || !ID.test(id)) return null;
  return { id, offset: parseT(u.searchParams.get('t') ?? u.searchParams.get('start') ?? '') };
}

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
export function parseT(t: string): number {
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** Video time (s) for a tab position. `songMs` is the tab time at normal speed. */
export const videoTimeFor = (link: VideoLink, songMs: number) => Math.max(0, link.offset + songMs / 1000);

/** Offset that makes the current video time line up with the current tab position. */
export const alignOffset = (videoSec: number, songMs: number) => Math.round((videoSec - songMs / 1000) * 100) / 100;

/**
 * Video playback rate for a tab speed. The IFrame player accepts any rate in 0.25–2 (not only the
 * 0.25 steps `getAvailablePlaybackRates` lists), so the video can match ladder speeds like 0.65 exactly.
 */
export const videoRate = (speed: number) => Math.round(Math.min(2, Math.max(0.25, speed)) * 100) / 100;

/** YT.PlayerState values used by the sync. */
export const YT_ENDED = 0;
export const YT_BUFFERING = 3;

/**
 * Decides whether the video must be re-seeked to follow the tab.
 *  - paused tab: follow tab moves (seek, bar step) but leave a user scrubbing the video alone;
 *  - playing: a jump of the tab (loop back, seek) seeks at once; small drift is corrected at most
 *    every 1.5 s and never while YouTube is buffering (seeking there restarts the buffering).
 */
export function needsSeek(o: { playing: boolean; prevSongMs: number; songMs: number; videoSec: number; targetSec: number; msSinceFix: number; ytState: number }): boolean {
  const moved = o.songMs - o.prevSongMs;
  if (!o.playing) return Math.abs(moved) > 1;
  if (o.ytState === YT_BUFFERING) return false;
  if (moved < -250 || moved > 1500) return Math.abs(o.videoSec - o.targetSec) > 0.15;
  return o.msSinceFix >= 1500 && Math.abs(o.videoSec - o.targetSec) > 0.35;
}

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const watchUrl = (l: VideoLink) => `https://www.youtube.com/watch?v=${l.id}${l.offset >= 1 ? `&t=${Math.floor(l.offset)}s` : ''}`;

/** Title and channel through YouTube's public oEmbed endpoint (null when offline or unknown). */
export async function fetchVideoInfo(id: string): Promise<{ title: string; author: string } | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string };
    return j.title ? { title: j.title, author: j.author_name ?? '' } : null;
  } catch {
    return null;
  }
}

/** Human message for an IFrame player error code. */
export function ytErrorMessage(code: number) {
  if (code === 2) return 'Bağlantı geçersiz.';
  if (code === 5) return 'Video bu tarayıcıda oynatılamıyor.';
  if (code === 100) return 'Video bulunamadı ya da gizli.';
  if (code === 101 || code === 150 || code === 153) return 'Videonun sahibi başka sitelerde oynatılmasına izin vermiyor.';
  return 'Video oynatılamıyor.';
}

const NOISE = new Set(['official', 'video', 'music', 'audio', 'lyrics', 'lyric', 'hd', '4k', 'remaster', 'remastered', 'live', 'guitar', 'gitar', 'tab', 'tabs', 'lesson', 'ders', 'cover', 'tutorial', 'how', 'to', 'play', 'the', 'a', 'and', 've', 'ile', 'nasıl', 'çalınır', 'akor', 'chords', 'feat', 'ft']);
const words = (s: string) => s.toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9ğüşöçı]+/).filter((w) => w.length > 1 && !NOISE.has(w));

/** 0..1: how well a tab / lesson title matches a video title (shared meaningful words). */
export function titleMatch(video: string, candidate: string): number {
  const v = new Set(words(video));
  const c = words(candidate);
  if (!v.size || !c.length) return 0;
  return c.filter((w) => v.has(w)).length / c.length;
}

/* ---------- IFrame API ---------- */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getDuration(): number;
  setPlaybackRate(r: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: { videoId: string; width?: string; height?: string; playerVars?: Record<string, number | string>; events?: Record<string, (e: { target: YTPlayer; data: number }) => void> }) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('YouTube yüklenemedi.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
