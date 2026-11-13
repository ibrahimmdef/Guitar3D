import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerBackup, Store } from './store.js';

/** Server snapshots kept in data/backups. */
export const MAX_SNAPSHOTS = 10;

/**
 * Minimal "cloud" sync without accounts:
 * - `GET /backup` downloads all server data, `POST /backup` replaces it (restore).
 * - `POST /backups` stores a snapshot on the server: all server data plus the client's local data
 *   sent as `{ local }`; `GET /backups` lists them, `GET /backups/:name` returns one.
 * Mounted before the global JSON parser because backups can be large.
 */
export function backupRouter(store: Store) {
  const r = Router();
  const big = express.json({ limit: '300mb' });
  const dir = path.join(store.dataDir, 'backups');
  const nameOk = (n: string) => /^[\w-]+\.json$/.test(n);

  r.get('/backup', (_req, res) => {
    res.json(store.exportAll());
  });
  r.post('/backup', big, (req, res) => {
    try {
      store.importAll(req.body as ServerBackup);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.get('/backups', (_req, res) => {
    if (!fs.existsSync(dir)) {
      res.json([]);
      return;
    }
    const list = fs.readdirSync(dir).filter(nameOk).sort().reverse()
      .map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size, createdAt: fs.statSync(path.join(dir, name)).mtime.toISOString() }));
    res.json(list);
  });
  r.post('/backups', big, (req, res) => {
    const local = (req.body as { local?: unknown })?.local ?? {};
    fs.mkdirSync(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ format: 'guitar3d-backup', server: store.exportAll(), local }));
    const all = fs.readdirSync(dir).filter(nameOk).sort();
    for (const old of all.slice(0, Math.max(0, all.length - MAX_SNAPSHOTS))) fs.rmSync(path.join(dir, old), { force: true });
    res.status(201).json({ name });
  });
  r.get('/backups/:name', (req, res) => {
    const file = path.join(dir, req.params.name);
    if (!nameOk(req.params.name) || !fs.existsSync(file)) {
      res.status(404).json({ error: 'Yedek bulunamadı.' });
      return;
    }
    res.type('application/json').send(fs.readFileSync(file));
  });
  return r;
}
