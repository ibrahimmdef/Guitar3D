import { useEffect, useRef } from 'react';

export interface Shortcut {
  keys: string[];
  label: string;
}

/** Shown in the shortcut sheet and the settings screen. */
export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Çalma',
    items: [
      { keys: ['Space'], label: 'Çal / duraklat' },
      { keys: ['←', '→'], label: 'Önceki / sonraki ölçü' },
      { keys: ['Home'], label: 'Başa dön' },
      { keys: ['L'], label: 'Bu ölçüyü döngüye al / döngüyü kapat' },
      { keys: ['M'], label: 'Metronom aç / kapat' },
      { keys: ['-', '+'], label: 'Hızı %5 azalt / artır' },
    ],
  },
  {
    group: 'Görünüm',
    items: [
      { keys: ['1'], label: 'Kamera: takip' },
      { keys: ['2'], label: 'Kamera: genel' },
      { keys: ['3'], label: 'Kamera: sap' },
      { keys: ['4'], label: 'Kamera: serbest' },
      { keys: ['V'], label: 'Oyuncu / seyirci görünümü' },
      { keys: ['T'], label: 'Tab şeridini göster / gizle' },
      { keys: ['P'], label: 'Pratik panelini aç / kapat' },
      { keys: ['?'], label: 'Kısayolları göster' },
    ],
  },
];

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
