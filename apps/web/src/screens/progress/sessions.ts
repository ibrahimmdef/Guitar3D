import type { NewPracticeSession, PracticeSession } from '@guitar3d/shared';

/** Client for `GET/POST /api/sessions`. */
export async function listSessions(since?: Date): Promise<PracticeSession[]> {
  const q = since ? `?since=${encodeURIComponent(since.toISOString())}` : '';
  const r = await fetch(`/api/sessions${q}`);
  if (!r.ok) throw new Error(`Seanslar alınamadı (HTTP ${r.status}).`);
  return r.json();
}

/** Posts a session; with `beacon` it uses sendBeacon so it survives closing the tab. */
export function saveSession(s: NewPracticeSession, beacon = false): Promise<void> {
  const body = JSON.stringify(s);
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/sessions', new Blob([body], { type: 'application/json' }));
    return Promise.resolve();
  }
  return fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .then(() => undefined)
    .catch(() => undefined);
}
