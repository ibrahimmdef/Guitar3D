import { useEffect, useRef } from 'react';

export interface Shortcut {
  keys: string[];
  label: string;
}

/** Shown in the shortcut sheet and the settings screen. */
export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Playback',
    items: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['←', '→'], label: 'Previous / next bar' },
      { keys: ['Home'], label: 'Back to start' },
      { keys: ['L'], label: 'Loop this bar / clear loop' },
      { keys: ['M'], label: 'Metronome on / off' },
      { keys: ['-', '+'], label: 'Speed down / up 5%' },
      { keys: ['S'], label: 'Next section' },
    ],
  },
  {
    group: 'View',
    items: [
      { keys: ['1'], label: 'Camera: follow' },
      { keys: ['2'], label: 'Camera: overview' },
      { keys: ['3'], label: 'Camera: neck' },
      { keys: ['4'], label: 'Camera: free' },
      { keys: ['V'], label: 'Player / audience view' },
      { keys: ['T'], label: 'Show / hide tab strip' },
      { keys: ['N'], label: 'Focus: neck / tab' },
      { keys: ['Shift -', 'Shift +'], label: 'Zoom out / in' },
      { keys: ['F'], label: 'Fullscreen' },
      { keys: ['P'], label: 'Open / close practice panel' },
      { keys: ['?'], label: 'Show shortcuts' },
    ],
  },
];

/**
 * Zoom step for Shift + "-" / Shift + "+" (layout independent enough: on US keyboards these
 * arrive as "_" and "+" on the Minus/Equal keys; numpad keys work too). 0 when not a zoom key.
 * Plain "+" typed with Shift on other layouts (e.g. Turkish Shift+4) stays a speed key.
 */
export function zoomDelta(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): -1 | 0 | 1 {
  if (!e.shiftKey) return 0;
  if (e.key === '_' || e.code === 'NumpadSubtract') return -1;
  if (e.code === 'NumpadAdd' || (e.code === 'Equal' && e.key === '+')) return 1;
  return 0;
}

/**
 * Name of a key event as used in hotkey maps: "Space", lower-case letters, or KeyboardEvent.key
 * for everything else. Returns null for chords with Ctrl/Cmd/Alt (left to the browser).
 */
export function hotkeyName(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space';
  return e.key.length === 1 ? e.key.toLocaleLowerCase('en') : e.key;
}

export function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit'].includes(type);
  }
  return false;
}

/**
 * Global key handler. `map` keys are KeyboardEvent.key values (case-insensitive for letters),
 * plus "Space". Ignored while typing in a field, with modifier keys, or when a modal is open.
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const key = hotkeyName(e);
      const fn = key ? ref.current[key] : undefined;
      if (!fn || !key) return;
      // Let buttons/switches keep Space/Enter activation when they have focus.
      if (key === 'Space' && (e.target as HTMLElement)?.closest?.('button, [role="slider"], [role="switch"]')) {
        (e.target as HTMLElement).blur?.();
      }
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}
