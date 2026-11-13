import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { CameraMode, GuitarView } from '@guitar3d/shared';

/**
 * User preferences, persisted in localStorage. When the server grows /api/settings
 * (workstream B), sync can be added here without touching the screens.
 */
export interface Settings {
  defaultSpeed: number;
  countIn: boolean;
  metronome: boolean;
  metronomeVolume: number;
  theme: 'dark' | 'light' | 'system';
  view: GuitarView;
  cameraMode: CameraMode;
  showTabStrip: boolean;
  showPractice: boolean;
  /** General MIDI program of the guitar sound (see audio/sounds.ts). */
  program: number;
  showFretNumbers: boolean;
  /** 3D camera zoom (0.5–2.5). */
  stageZoom: number;
  /** Player layout: guitar neck large, or tab strip large. */
  focus: 'neck' | 'tab';
  /** The user's guitar tuning (music/tunings.ts id): tuner target, scale and note names. */
  tuningId: string;
  /** Tempo ladder: start %, target %, clean passes per step. */
  ladderStart: number;
  ladderTarget: number;
  ladderPasses: number;
  /** Listen-mode accuracy (%) that counts as a clean pass. */
  ladderCleanAccuracy: number;
  /** Accessibility: stronger text and borders. */
  highContrast: boolean;
  /** Accessibility: right/wrong colours safe for red-green colour blindness (Okabe–Ito blue / vermillion). */
  colorBlind: boolean;
  /** Accessibility: larger note labels in the cue strip, chord diagrams, rhythm arrows and the editor. */
  largeMarkers: boolean;
  /** Accessibility: 'system' follows prefers-reduced-motion, 'reduce' always cuts animations. */
  motion: 'system' | 'reduce';
  /** Weekly practice goal in minutes (progress screen). */
  weeklyGoalMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultSpeed: 1,
  countIn: true,
  metronome: false,
  metronomeVolume: 0.7,
  theme: 'dark',
  view: 'player',
  cameraMode: 'follow',
  showTabStrip: true,
  showPractice: false,
  program: 25,
  showFretNumbers: true,
  stageZoom: 1,
  focus: 'neck',
  tuningId: 'standard',
  ladderStart: 0.6,
  ladderTarget: 1,
  ladderPasses: 3,
  ladderCleanAccuracy: 90,
  highContrast: false,
  colorBlind: false,
  largeMarkers: false,
  motion: 'system',
  weeklyGoalMinutes: 60,
};

const KEY = 'guitar3d.settings.v1';
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache!;
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const s = useSyncExternalStore(subscribe, read, read);
  const set = useCallback((p: Partial<Settings>) => updateSettings(p), []);
  return [s, set];
}

/** Applies the theme to <html data-theme>. */
export function useThemeEffect(theme: Settings['theme']) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      root.dataset.theme = t;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Pure: the <html> data attributes for the accessibility settings. */
export function a11yAttributes(s: Pick<Settings, 'highContrast' | 'colorBlind' | 'largeMarkers' | 'motion'>): Record<string, string | undefined> {
  return {
    contrast: s.highContrast ? 'high' : undefined,
    palette: s.colorBlind ? 'cb' : undefined,
    markers: s.largeMarkers ? 'large' : undefined,
    motion: s.motion === 'reduce' ? 'reduce' : undefined,
  };
}

/** Applies the accessibility settings as data attributes on <html> (styles/a11y in p2.css). */
export function useA11yEffect(s: Settings) {
  const { highContrast, colorBlind, largeMarkers, motion } = s;
  useEffect(() => {
    const ds = document.documentElement.dataset;
    for (const [k, v] of Object.entries(a11yAttributes({ highContrast, colorBlind, largeMarkers, motion }))) {
      if (v) ds[k] = v;
      else delete ds[k];
    }
  }, [highContrast, colorBlind, largeMarkers, motion]);
}

/** True when animations should be cut (setting or OS preference). */
export function prefersReducedMotion(s: Pick<Settings, 'motion'>): boolean {
  if (s.motion === 'reduce') return true;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- Recently played (per tab) ---------- */
const RECENT_KEY = 'guitar3d.recent.v1';

export function getRecent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function markPlayed(tabId: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ ...getRecent(), [tabId]: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}
