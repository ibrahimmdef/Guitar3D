import type { StemName } from '@guitar3d/shared';
import { clampSpeed, loopJump, syncCorrection, type Loop } from './mixer';

/**
 * Plays the stems of a song in lockstep with one <audio> element per stem.
 * <audio> streams (no full decode in memory) and time-stretches without pitch change
 * (preservesPitch), so 50–100 % speed keeps the key. Elements drift apart slightly over time; every
 * ~200 ms the others are pulled back to the first stem (rate nudge for small drift, seek for large),
 * which keeps them within ~10–30 ms. Muted stems keep playing at volume 0 so they stay in sync.
 */
/** Volume of a muted stem (-80 dB): inaudible, but keeps the element on the real audio clock. */
const SILENT = 1e-4;

export class StemEngine {
  private readonly els = new Map<StemName, HTMLAudioElement>();
  private master: HTMLAudioElement;
  private timer = 0;
  private lastSync = 0;
  private rate = 1;
  private seekToken = 0;
  private loop: Loop = { a: null, b: null };
  playing = false;

  onTime?: (t: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onError?: (message: string) => void;

  constructor(urls: Partial<Record<StemName, string>>) {
    for (const [stem, url] of Object.entries(urls) as [StemName, string][]) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = url;
      el.preservesPitch = true;
      this.els.set(stem, el);
    }
    const first = this.els.values().next().value;
    if (!first) throw new Error('No stems.');
    this.master = first;
    for (const el of this.els.values()) {
      el.addEventListener('ended', () => el === this.master && this.setPlaying(false));
      el.addEventListener('error', () => this.onError?.('Could not load the audio.'), { once: true });
    }
  }

  /** Resolves when every stem can start playing. */
  ready(): Promise<number> {
    return Promise.all(
      [...this.els.values()].map(
        (el) =>
          new Promise<void>((resolve, reject) => {
            if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return resolve();
            el.addEventListener('canplay', () => resolve(), { once: true });
            el.addEventListener('error', () => reject(new Error('Could not load the audio.')), { once: true });
          }),
      ),
    ).then(() => this.duration);
  }

  get duration() {
    return Math.max(0, ...[...this.els.values()].map((e) => (Number.isFinite(e.duration) ? e.duration : 0)));
  }

  get currentTime() {
    return this.master.currentTime;
  }

  play() {
    if (this.playing) return;
    this.setPlaying(true);
    // a coordinated seek to the current position starts every stem at the same moment
    this.seek(this.master.currentTime);
    this.startTicking();
  }

  pause() {
    for (const el of this.els.values()) el.pause();
    this.setPlaying(false);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /**
   * Seeks every stem. While playing, the stems are paused, seeked, and restarted together once all
   * have their data: restarting each one as soon as its own seek ends would leave them ~100 ms apart.
   */
  seek(t: number) {
    const to = Math.min(Math.max(0, t), this.duration || t);
    const els = [...this.els.values()];
    const resume = this.playing;
    const token = ++this.seekToken;
    if (resume) els.forEach((e) => e.pause());
    for (const el of els) el.currentTime = to;
    this.onTime?.(to);
    if (!resume) return;
    void Promise.all(els.map((e) => seeked(e))).then(() => {
      if (token !== this.seekToken || !this.playing) return;
      for (const el of els) {
        el.currentTime = to;
        el.playbackRate = this.rate;
      }
      return Promise.all(els.map((e) => e.play())).catch((e: Error) => {
        this.pause();
        if (e.name !== 'AbortError') this.onError?.('Could not start playback.');
      });
    });
  }

  setSpeed(r: number) {
    this.rate = clampSpeed(r);
    for (const el of this.els.values()) el.playbackRate = this.rate;
  }

  setLoop(loop: Loop) {
    this.loop = loop;
  }

  /**
   * Silent stems get a -80 dB floor instead of 0: Chromium moves a volume-0 element to a wall-clock
   * "null sink" that ignores time-stretching, so it drifts ~100 ms/s from the others at 75 % speed.
   * The sync reference is an audible stem, so what you hear is what the others follow.
   */
  setGains(gains: Partial<Record<StemName, number>>) {
    for (const [stem, el] of this.els) el.volume = Math.max(SILENT, gains[stem] ?? 0);
    const audible = [...this.els].find(([stem]) => (gains[stem] ?? 0) > 0)?.[1];
    if (audible) this.master = audible;
  }

  destroy() {
    clearInterval(this.timer);
    for (const el of this.els.values()) {
      el.pause();
      el.removeAttribute('src');
      el.load(); // releases the network connection / decoder
    }
    this.els.clear();
  }

  private setPlaying(p: boolean) {
    if (this.playing === p) return;
    this.playing = p;
    if (!p) clearInterval(this.timer);
    this.onPlayingChange?.(p);
  }

  /**
   * A timer, not requestAnimationFrame: rAF stops in a background tab, and play-along users often
   * keep the song running while looking at another tab (browsers slow this timer to ~1 Hz there).
   */
  private startTicking() {
    clearInterval(this.timer);
    this.timer = window.setInterval(this.tick, 50);
  }

  private tick = () => {
    if (!this.playing) return;
    const t = this.master.currentTime;
    const jump = loopJump(this.loop, t);
    if (jump != null) return this.seek(jump);
    const now = performance.now();
    if (now - this.lastSync > 200) {
      this.lastSync = now;
      this.resync(t);
    }
    this.onTime?.(t);
  };

  private resync(masterTime: number) {
    if (this.master.seeking || this.master.paused) return;
    for (const el of this.els.values()) {
      if (el === this.master || el.seeking || el.paused) continue;
      const fix = syncCorrection(masterTime, el.currentTime, this.rate);
      if (fix.seek != null) el.currentTime = fix.seek;
      el.playbackRate = fix.rate;
    }
  }
}

/** Resolves when the element has finished seeking and can play (at most 1.5 s). */
function seeked(el: HTMLAudioElement) {
  return new Promise<void>((resolve) => {
    if (!el.seeking && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return resolve();
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener('canplay', check);
      el.removeEventListener('seeked', check);
      resolve();
    };
    const check = () => {
      if (!el.seeking && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) done();
    };
    const timer = setTimeout(done, 1500);
    el.addEventListener('canplay', check);
    el.addEventListener('seeked', check);
  });
}
