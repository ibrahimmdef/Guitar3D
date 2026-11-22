import crypto from 'node:crypto';
import { Router } from 'express';
import type { BarNote } from '@guitar3d/shared';
import type { Store } from './store.js';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isKey = (v: string) => /^(lesson:)?[\w.-]{1,120}$/.test(v);

/** Bar notes of a tab: `GET /notes?tabKey=`, `POST /notes`, `DELETE /notes/:id`. */
export function notesRouter(store: Store) {
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
      res.status(400).json({ error: 'tabKey, bar (0 or more) and text are required.' });
      return;
    }
    const note: BarNote = { id: crypto.randomUUID(), tabKey, bar, text, createdAt: new Date().toISOString() };
    res.status(201).json(store.addNote(note));
  });
  r.delete('/notes/:id', (req, res) => {
    res.status(store.deleteNote(req.params.id) ? 204 : 404).end();
  });
  return r;
}
