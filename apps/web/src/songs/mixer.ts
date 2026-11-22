import type { StemName } from '@guitar3d/shared';

/** Per-stem mixer channel. `volume` 0..1. */
export interface Channel {
  volume: number;
  muted: boolean;
  solo: boolean;
}

export type Mix = Partial<Record<StemName, Channel>>;

export const STEM_LABEL: Record<StemName, string> = {
  guitar: 'Guitar',
  vocals: 'Vocals',
  bass: 'Bass',
  drums: 'Drums',
  piano: 'Piano',
  other: 'Other',
};

export const DEFAULT_CHANNEL: Channel = { volume: 1, muted: false, solo: false };

export const initialMix = (stems: readonly StemName[]): Mix => Object.fromEntries(stems.map((s) => [s, { ...DEFAULT_CHANNEL }]));

/**
 * Audible gain per stem: when any stem is soloed only soloed stems sound (solo beats mute, like a
 * console); otherwise every non-muted stem plays at its volume.
 */
export function effectiveGains(mix: Mix): Partial<Record<StemName, number>> {
  const entries = Object.entries(mix) as [StemName, Channel][];
  const anySolo = entries.some(([, c]) => c.solo);
  return Object.fromEntries(entries.map(([s, c]) => [s, clamp01(anySolo ? (c.solo ? c.volume : 0) : c.muted ? 0 : c.volume)]));
}

export type PresetId = 'playalong' | 'guitar-only' | 'all';

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'playalong', label: 'Play along', hint: 'Original guitar off, the band plays: you play the guitar.' },
  { id: 'guitar-only', label: 'Guitar only', hint: 'Just the guitar part: listen and learn it.' },
  { id: 'all', label: 'All', hint: 'The full original mix.' },
];

/** Applies a preset; volumes are kept so the user's balance survives switching. */
export function applyPreset(mix: Mix, preset: PresetId): Mix {
  const out: Mix = {};
  for (const [s, c] of Object.entries(mix) as [StemName, Channel][]) {
    const isGuitar = s === 'guitar';
    out[s] = {
      volume: c.volume,
      muted: preset === 'playalong' ? isGuitar : false,
      solo: preset === 'guitar-only' ? isGuitar : false,
    };
  }
  return out;
}

/** The preset the mix currently matches, if any (highlights the preset button). */
export function activePreset(mix: Mix): PresetId | null {
  for (const p of PRESETS) {
    const want = applyPreset(mix, p.id);
    if ((Object.keys(mix) as StemName[]).every((s) => want[s]!.muted === mix[s]!.muted && want[s]!.solo === mix[s]!.solo)) return p.id;
  }
  return null;
}

export const toggleMute = (mix: Mix, s: StemName): Mix => (mix[s] ? { ...mix, [s]: { ...mix[s], muted: !mix[s].muted } } : mix);
export const toggleSolo = (mix: Mix, s: StemName): Mix => (mix[s] ? { ...mix, [s]: { ...mix[s], solo: !mix[s].solo } } : mix);
export const setVolume = (mix: Mix, s: StemName, v: number): Mix => (mix[s] ? { ...mix, [s]: { ...mix[s], volume: clamp01(v) } } : mix);

function clamp01(v: number) {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

// ---- transport helpers ------------------------------------------------------------------

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 1;

export const clampSpeed = (r: number) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(r * 100) / 100));

export interface Loop {
  a: number | null;
  b: number | null;
}

/** Sets A or B; a B before A (or A after B) swaps them so the loop is always a ≤ b. */
export function setLoopPoint(loop: Loop, which: 'a' | 'b', t: number): Loop {
  const next = { ...loop, [which]: t };
  if (next.a != null && next.b != null && next.b < next.a) return { a: next.b, b: next.a };
  return next;
}

/** Where playback should jump when the loop end is reached, or null to keep going. Loops shorter than 0.2 s are ignored. */
export function loopJump(loop: Loop, t: number): number | null {
  if (loop.a == null || loop.b == null || loop.b - loop.a < 0.2) return null;
  return t >= loop.b ? loop.a : null;
}

/**
 * Drift correction for stems played by separate <audio> elements: small drift is absorbed by a
 * slightly faster/slower rate (inaudible with preservesPitch), larger drift by a seek.
 * Returns the rate to use and an optional seek target.
 */
export function syncCorrection(masterTime: number, time: number, rate: number, opts = { tolerance: 0.012, hard: 0.08, nudge: 0.06 }): { rate: number; seek?: number } {
  const drift = time - masterTime; // > 0: this stem is ahead
  if (Math.abs(drift) >= opts.hard) return { rate, seek: masterTime };
  if (Math.abs(drift) <= opts.tolerance) return { rate };
  // proportional nudge, capped
  const k = Math.min(opts.nudge, Math.abs(drift));
  return { rate: rate * (drift > 0 ? 1 - k : 1 + k) };
}

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
