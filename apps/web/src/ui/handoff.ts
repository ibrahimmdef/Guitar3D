/** One-shot values passed between screens (e.g. the course opening the rhythm screen on a pattern). */
const PREFIX = 'guitar3d.handoff.';

export function setHandoff(key: string, value: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Reads a handoff value and clears it shortly after (so StrictMode's double render still sees it). */
export function takeHandoff<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    setTimeout(() => sessionStorage.removeItem(PREFIX + key), 0);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
