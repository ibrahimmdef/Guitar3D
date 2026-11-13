import crypto from 'node:crypto';
import { Router } from 'express';
import type { NewPracticeSession, PracticeSession, SessionKind } from '@guitar3d/shared';
import type { Store } from './store.js';

const KINDS: SessionKind[] = ['tab', 'lesson', 'routine', 'chords', 'scales'];
/** One session can last at most 12 hours. */
const MAX_SECONDS = 12 * 3600;

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

/** Validates a POST body; returns the session or an error message. */
export function parseSession(body: unknown): NewPracticeSession | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!KINDS.includes(b.kind as SessionKind)) return `kind şunlardan biri olmalı: ${KINDS.join(', ')}.`;
  if (!isIso(b.startedAt)) return 'startedAt ISO tarih olmalı.';
  const seconds = num(b.seconds, 0, MAX_SECONDS);
  if (seconds == null || seconds < 1) return 'seconds en az 1 olmalı.';
  const endedAt = isIso(b.endedAt) ? b.endedAt : new Date(Date.parse(b.startedAt) + seconds * 1000).toISOString();
  const out: NewPracticeSession = {
    kind: b.kind as SessionKind,
    title: typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : 'Pratik',
    startedAt: new Date(b.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    seconds: Math.round(seconds),
  };
  if (typeof b.refId === 'string' && b.refId.trim()) out.refId = b.refId.trim().slice(0, 200);
  const speed = num(b.bestCleanSpeed, 0.1, 2);
  if (speed != null) out.bestCleanSpeed = Math.round(speed * 100) / 100;
  const acc = num(b.accuracy, 0, 100);
  if (acc != null) out.accuracy = Math.round(acc);
  return out;
}

/**
 * `GET /api/sessions` (newest first; `?since=<ISO>` and `?refId=` filter, `?limit=` caps) and
 * `POST /api/sessions` (body: NewPracticeSession, returns the stored session with its id).
 */
export function sessionsRouter(store: Store) {
  const r = Router();
  r.get('/sessions', (req, res) => {
    let list = store.listSessions();
    const since = req.query.since;
    if (isIso(since)) {
      const t = Date.parse(since);
      list = list.filter((s) => Date.parse(s.endedAt) >= t);
    }
    if (typeof req.query.refId === 'string' && req.query.refId) list = list.filter((s) => s.refId === req.query.refId);
    const limit = Number(req.query.limit);
    if (Number.isInteger(limit) && limit > 0) list = list.slice(0, limit);
    res.json(list);
  });
  r.post('/sessions', (req, res) => {
    const parsed = parseSession(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }
    const session: PracticeSession = { id: crypto.randomUUID(), ...parsed };
    res.status(201).json(store.addSession(session));
  });
  return r;
}
