import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { TabFormat, TabMeta, TabProgress } from '@guitar3d/shared';
import { Store } from './store.js';
import { guitarsRouter } from './guitars.js';
import { sessionsRouter } from './sessions.js';
import { teacherRouter } from './teacher.js';
import { backupRouter } from './backup.js';
import { extractTabInfo } from './tabInfo.js';

/** Upload extension → stored format. Text formats (.atex/.tex) hold alphaTex. */
export const TAB_FORMATS: Record<string, TabFormat> = {
  '.gp': 'gp', '.gp3': 'gp3', '.gp4': 'gp4', '.gp5': 'gp5', '.gpx': 'gpx', '.gp7': 'gp7',
  '.xml': 'musicxml', '.musicxml': 'musicxml', '.mxl': 'mxl', '.atex': 'alphatex', '.tex': 'alphatex',
};
const ALLOWED = Object.keys(TAB_FORMATS);
const SORTS: Record<string, (a: TabMeta, b: TabMeta) => number> = {
  recent: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  played: (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || b.uploadedAt.localeCompare(a.uploadedAt),
  title: (a, b) => a.title.localeCompare(b.title, 'tr'),
};
const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function createApp(store: Store) {
  const app = express();
  app.use('/api', backupRouter(store));
  app.use(express.json({ limit: '5mb' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.tabsDir,
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${storedExt(file.originalname)}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** ?q= searches title/artist (case and accent insensitive); ?sort=recent|played|title. */
  app.get('/api/tabs', (req, res) => {
    let tabs = store.listTabs();
    const q = typeof req.query.q === 'string' ? fold(req.query.q.trim()) : '';
    if (q) tabs = tabs.filter((t) => fold(`${t.title} ${t.artist}`).includes(q));
    const sort = SORTS[String(req.query.sort ?? 'recent')] ?? SORTS.recent;
    res.json([...tabs].sort(sort));
  });

  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  /**
   * Multipart upload (`file` + optional `title`, `artist`, `format`) of a Guitar Pro / MusicXML / alphaTex file,
   * or JSON `{ alphaTex, title?, artist?, format?: 'alphatex' | 'ascii' }` for text tabs (stored as .atex).
   */
  app.post('/api/tabs', (req, res, next) => (req.is('application/json') ? next() : upload.single('file')(req, res, next)), (req, res) => {
    if (req.is('application/json')) {
      const body = req.body as { alphaTex?: unknown; title?: unknown; artist?: unknown; format?: unknown };
      if (typeof body?.alphaTex !== 'string' || !body.alphaTex.trim() || body.alphaTex.length > 2_000_000) {
        res.status(400).json({ error: 'alphaTex metni gerekli.' });
        return;
      }
      const id = crypto.randomUUID();
      const fileName = `${id}.atex`;
      fs.writeFileSync(path.join(store.tabsDir, fileName), body.alphaTex);
      const info = extractTabInfo(Buffer.from(body.alphaTex), 'alphatex');
      const meta = store.addTab({
        id,
        title: str(body.title) || info.title || 'Adsız tab',
        artist: str(body.artist) || info.artist || '',
        fileName,
        uploadedAt: new Date().toISOString(),
        format: body.format === 'ascii' ? 'ascii' : 'alphatex',
      });
      res.status(201).json(meta);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Desteklenen bir Guitar Pro, MusicXML veya alphaTex dosyası yükle.' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const format: TabFormat = req.body?.format === 'ascii' ? 'ascii' : TAB_FORMATS[ext];
    const base = path.basename(req.file.originalname, path.extname(req.file.originalname));
    let info: { title?: string; artist?: string } = {};
    try {
      info = extractTabInfo(fs.readFileSync(req.file.path), TAB_FORMATS[ext]);
    } catch {
      // metadata is best effort
    }
    const meta = store.addTab({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      title: str(req.body?.title) || info.title || base,
      artist: str(req.body?.artist) || info.artist || '',
      fileName: req.file.filename,
      uploadedAt: new Date().toISOString(),
      format,
    });
    res.status(201).json(meta);
  });

  /** Rename: `{ title?, artist? }`. */
  app.patch('/api/tabs/:id', (req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; artist?: unknown };
    const patch: { title?: string; artist?: string } = {};
    if (body.title !== undefined) {
      if (!str(body.title)) {
        res.status(400).json({ error: 'title boş olamaz.' });
        return;
      }
      patch.title = str(body.title);
    }
    if (body.artist !== undefined) patch.artist = str(body.artist);
    const tab = store.updateTab(req.params.id, patch);
    if (!tab) {
      res.status(404).json({ error: 'Tab bulunamadı.' });
      return;
    }
    res.json(tab);
  });

  /** Marks the tab as played now (drives "son çalınanlar"). */
  app.post('/api/tabs/:id/played', (req, res) => {
    const tab = store.updateTab(req.params.id, { lastPlayedAt: new Date().toISOString() });
    if (!tab) {
      res.status(404).json({ error: 'Tab bulunamadı.' });
      return;
    }
    res.json(tab);
  });

  app.get('/api/tabs/:id/file', (req, res) => {
    const tab = store.getTab(req.params.id);
    if (!tab) {
      res.status(404).json({ error: 'Tab bulunamadı.' });
      return;
    }
    const file = path.resolve(store.tabsDir, tab.fileName);
    if (tab.fileName.endsWith('.atex')) res.type('text/plain; charset=utf-8');
    res.sendFile(file);
  });

  app.delete('/api/tabs/:id', (req, res) => {
    res.status(store.deleteTab(req.params.id) ? 204 : 404).end();
  });

  app.get('/api/progress/:tabId', (req, res) => {
    res.json(store.getProgress(req.params.tabId));
  });

  app.put('/api/progress/:tabId', (req, res) => {
    const body = req.body as Partial<TabProgress>;
    if (!Array.isArray(body?.sections)) {
      res.status(400).json({ error: 'sections dizisi gerekli.' });
      return;
    }
    res.json(store.putProgress({ tabId: req.params.tabId, sections: body.sections }));
  });

  app.use('/api', guitarsRouter(store));
  app.use('/api', sessionsRouter(store));
  app.use('/api', teacherRouter(store));

  return app;
}

/** Stored extension: .tex is normalised to .atex so the file endpoint can serve it as text. */
function storedExt(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ext === '.tex' ? '.atex' : ext;
}
