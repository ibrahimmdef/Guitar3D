import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { TabProgress } from '@guitar3d/shared';
import { Store } from './store.js';

const ALLOWED = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7', '.xml', '.musicxml'];

export function createApp(store: Store) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.tabsDir,
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/tabs', (_req, res) => {
    res.json(store.listTabs());
  });

  app.post('/api/tabs', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Desteklenen bir Guitar Pro veya MusicXML dosyası yükle.' });
      return;
    }
    const base = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const meta = store.addTab({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      title: (req.body?.title as string) || base,
      artist: (req.body?.artist as string) || '',
      fileName: req.file.filename,
      uploadedAt: new Date().toISOString(),
    });
    res.status(201).json(meta);
  });

  app.get('/api/tabs/:id/file', (req, res) => {
    const tab = store.getTab(req.params.id);
    if (!tab) {
      res.status(404).json({ error: 'Tab bulunamadı.' });
      return;
    }
    res.sendFile(path.resolve(store.tabsDir, tab.fileName));
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

  const guitarDir = path.join(store.dataDir, 'guitar');
  fs.mkdirSync(guitarDir, { recursive: true });
  const TEXTURES = ['fretboard', 'top'];
  const IMAGE_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  const findTexture = (name: string) =>
    Object.values(IMAGE_TYPES).map((ext) => path.join(guitarDir, name + ext)).find((p) => fs.existsSync(p));

  app.get('/api/guitar/assets', (_req, res) => {
    const textures: Record<string, string | null> = {};
    for (const t of TEXTURES) {
      const f = findTexture(t);
      textures[t] = f ? `/api/guitar/textures/${t}?v=${Math.round(fs.statSync(f).mtimeMs)}` : null;
    }
    const glb = path.join(guitarDir, 'body.glb');
    res.json({ textures, bodyModel: fs.existsSync(glb) ? '/api/guitar/model' : null });
  });

  app.get('/api/guitar/textures/:name', (req, res) => {
    const f = TEXTURES.includes(req.params.name) ? findTexture(req.params.name) : undefined;
    if (!f) {
      res.status(404).end();
      return;
    }
    res.sendFile(f);
  });

  app.put('/api/guitar/textures/:name', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '25mb' }), (req, res) => {
    const ext = IMAGE_TYPES[req.headers['content-type'] ?? ''];
    if (!TEXTURES.includes(req.params.name) || !ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'PNG, JPEG veya WebP görsel gönder.' });
      return;
    }
    for (const e of Object.values(IMAGE_TYPES)) fs.rmSync(path.join(guitarDir, req.params.name + e), { force: true });
    fs.writeFileSync(path.join(guitarDir, req.params.name + ext), req.body);
    res.status(204).end();
  });

  app.delete('/api/guitar/textures/:name', (req, res) => {
    const f = TEXTURES.includes(req.params.name) ? findTexture(req.params.name) : undefined;
    if (f) fs.rmSync(f);
    res.status(204).end();
  });

  app.get('/api/guitar/model', (_req, res) => {
    const glb = path.join(guitarDir, 'body.glb');
    if (!fs.existsSync(glb)) {
      res.status(404).end();
      return;
    }
    res.type('model/gltf-binary').sendFile(glb);
  });

  app.get('/api/guitar/spec', (_req, res) => {
    const f = path.join(guitarDir, 'guitar.json');
    res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  });

  return app;
}
