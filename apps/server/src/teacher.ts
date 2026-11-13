import crypto from 'node:crypto';
import { Router } from 'express';
import type { Assignment, BarNote } from '@guitar3d/shared';
import type { Store } from './store.js';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isKey = (v: string) => /^(lesson:)?[\w.-]{1,120}$/.test(v);

/**
 * Teacher mode (no accounts): bar notes `GET /notes?tabKey=`, `POST /notes`, `DELETE /notes/:id`
 * and assignments `GET /assignments`, `POST /assignments`, `DELETE /assignments/:id`.
 */
export function teacherRouter(store: Store) {
  const r = Router();

  r.get('/notes', (req, res) => {
    res.json(store.listNotes(typeof req.query.tabKey === 'string' ? req.query.tabKey : undefined));
  });
  r.post('/notes', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const tabKey = str(b.tabKey, 130);
    const text = str(b.text, 1000);
    const bar = typeof b.bar === 'number' && Number.isInteger(b.bar) && b.bar >= 0 && b.bar < 10000 ? b.bar : -1;
    if (!isKey(tabKey) || !text || bar < 0) {
      res.status(400).json({ error: 'tabKey, bar (0 veya üstü) ve text gerekli.' });
      return;
    }
    const note: BarNote = { id: crypto.randomUUID(), tabKey, bar, text, createdAt: new Date().toISOString() };
    res.status(201).json(store.addNote(note));
  });
  r.delete('/notes/:id', (req, res) => {
    res.status(store.deleteNote(req.params.id) ? 204 : 404).end();
  });

  r.get('/assignments', (_req, res) => {
    res.json(store.listAssignments());
  });
  r.post('/assignments', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const tabKey = str(b.tabKey, 130);
    const title = str(b.title, 200);
    const due = str(b.due, 10);
    const speed = typeof b.targetSpeed === 'number' ? b.targetSpeed : NaN;
    if (!isKey(tabKey) || !title || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !(speed >= 0.25 && speed <= 1.5)) {
      res.status(400).json({ error: 'tabKey, title, due (YYYY-AA-GG) ve targetSpeed (0.25–1.5) gerekli.' });
      return;
    }
    const a: Assignment = { id: crypto.randomUUID(), tabKey, title, targetSpeed: Math.round(speed * 100) / 100, due, createdAt: new Date().toISOString() };
    const note = str(b.note, 1000);
    if (note) a.note = note;
    res.status(201).json(store.addAssignment(a));
  });
  r.delete('/assignments/:id', (req, res) => {
    res.status(store.deleteAssignment(req.params.id) ? 204 : 404).end();
  });
  return r;
}
