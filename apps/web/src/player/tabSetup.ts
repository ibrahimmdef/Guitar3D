import { useCallback, useState } from 'react';
import { clampCapo } from '../music/tunings';

export const TAB_SETUP_KEY = 'guitar3d.tabSetup.v1';

/**
 * Per-tab guitar setup chosen in the player: capo fret and tuning override. Stored in localStorage
 * under the tab id (lessons as `lesson:<id>`). Missing fields mean "as the tab file says".
 */
export interface TabSetup {
  capo?: number;
  /** music/tunings.ts id; empty = the tab's own tuning. */
  tuningId?: string;
}

const KEY = TAB_SETUP_KEY;

export function mergeSetup(all: Record<string, TabSetup>, key: string, patch: TabSetup): Record<string, TabSetup> {
  const next: TabSetup = { ...all[key], ...patch };
  if (next.capo != null) next.capo = clampCapo(next.capo);
  if (!next.tuningId) delete next.tuningId;
  if (next.capo == null) delete next.capo;
  // Drop the video links stored by the removed YouTube feature.
  delete (next as { video?: unknown }).video;
  const out = { ...all };
  if (Object.keys(next).length) out[key] = next;
  else delete out[key];
  return out;
}

function readAll(): Record<string, TabSetup> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function useTabSetup(key: string): [TabSetup, (patch: TabSetup) => void] {
  const [setup, setSetup] = useState<TabSetup>(() => readAll()[key] ?? {});
  const update = useCallback((patch: TabSetup) => {
    const all = mergeSetup(readAll(), key, patch);
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable: keep in memory */
    }
    setSetup(all[key] ?? {});
  }, [key]);
  return [setup, update];
}
