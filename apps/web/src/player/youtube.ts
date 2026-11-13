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

/** YouTube supports these rates; pick the nearest. */
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const nearestRate = (r: number) => RATES.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 1);

/* ---------- IFrame API ---------- */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
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
