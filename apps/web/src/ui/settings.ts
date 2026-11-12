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
