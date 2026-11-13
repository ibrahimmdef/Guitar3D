import express, { type Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { GuitarProfile, GuitarSummary, GuitarTextureName } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID, GUITAR_TEXTURE_NAMES } from '@guitar3d/shared';
import type { Store } from './store.js';

export const IMAGE_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

export const BUILTIN_SUMMARY: GuitarSummary = { id: BUILTIN_GUITAR_ID, name: 'Veston (yerleşik)', builtIn: true };

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** Returns a list of problems; empty when the profile looks usable. `partial` skips required checks (PUT merges). */
export function validateProfile(p: unknown, partial = false): string[] {
  const errs: string[] = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['Gövde bir JSON nesnesi olmalı.'];
  const g = p as Partial<GuitarProfile>;
  const need = (ok: boolean, key: string, msg: string) => {
    if ((g as Record<string, unknown>)[key] === undefined) {
      if (!partial) errs.push(`${key} gerekli.`);
    } else if (!ok) errs.push(msg);
  };
  need(typeof g.name === 'string' && g.name.trim().length > 0 && g.name.length <= 120, 'name', 'name 1-120 karakterlik bir metin olmalı.');
  for (const k of ['totalLengthCm', 'scaleLengthCm', 'nutWidthCm', 'endWidthCm', 'stringSpacingNutCm', 'stringSpacingSaddleCm'] as const) {
    need(isNum(g[k]) && (g[k] as number) > 0 && (g[k] as number) < 300, k, `${k} pozitif bir sayı (cm) olmalı.`);
  }
  for (const k of ['fretCount', 'bodyJoinFret'] as const) {
    need(Number.isInteger(g[k]) && (g[k] as number) > 0 && (g[k] as number) <= 36, k, `${k} 1-36 arası tam sayı olmalı.`);
  }
  need(
    !!g.body && Array.isArray(g.body.outline) && g.body.outline.length >= 3 && g.body.outline.length <= 5000 && g.body.outline.every(isPt) &&
      isNum(g.body.depthCm) && !!g.body.soundhole && isNum(g.body.soundhole.x) && isNum(g.body.soundhole.y) && isNum(g.body.soundhole.radiusCm) &&
      !!g.body.bridge && isNum(g.body.bridge.x),
    'body',
    'body: outline [[x,y]…], depthCm, soundhole {x,y,radiusCm} ve bridge {x,…} içermeli.',
  );
  need(
    !!g.headstock && isNum(g.headstock.lengthCm) && Array.isArray(g.headstock.profile) && g.headstock.profile.every(isPt) &&
      Array.isArray(g.headstock.tunersLowE) && Array.isArray(g.headstock.tunersHighE),
    'headstock',
    'headstock: lengthCm, profile [[d,w]…], tunersLowE, tunersHighE içermeli.',
  );
  need(!!g.finish && typeof g.finish === 'object', 'finish', 'finish bir nesne olmalı.');
  if (g.textures !== undefined && (typeof g.textures !== 'object' || g.textures === null)) errs.push('textures bir nesne olmalı.');
  return errs;
}

function summary(p: GuitarProfile): GuitarSummary {
  return {
    id: p.id,
    name: p.name,
    totalLengthCm: p.totalLengthCm,
    scaleLengthCm: p.scaleLengthCm,
    updatedAt: p.updatedAt,
    thumbnail: p.textures?.bodyTop,
  };
}

const isTextureName = (n: string): n is GuitarTextureName => (GUITAR_TEXTURE_NAMES as string[]).includes(n);

/** Static texture URLs shipped with the web app (templates) may be referenced directly. */
const isStaticUrl = (u: unknown): u is string => typeof u === 'string' && /^\/guitar\/[\w./-]+$/.test(u) && !u.includes('..');

/** Keeps only the texture references that point at the app's static files (e.g. a template's fretboard photo). */
export function staticTextures(t: GuitarProfile['textures'] | undefined): GuitarProfile['textures'] {
  const out: GuitarProfile['textures'] = {};
  if (!t || typeof t !== 'object') return out;
  for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) if (isStaticUrl(t[k])) out[k] = t[k];
  if (t.fretboard && isStaticUrl(t.fretboard.url) && Number.isInteger(t.fretboard.toFret)) out.fretboard = { url: t.fretboard.url, toFret: t.fretboard.toFret };
  return out;
}

export function guitarsRouter(store: Store): Router {
  const r = express.Router();

  const findTexture = (id: string, name: string) =>
    Object.values(IMAGE_TYPES)
      .map((ext) => path.join(store.guitarDir(id), name + ext))
      .find((p) => fs.existsSync(p));

  r.get('/guitars', (_req, res) => {
    res.json([BUILTIN_SUMMARY, ...store.listGuitars().map(summary)]);
  });

  r.post('/guitars', (req, res) => {
    const errs = validateProfile(req.body);
    if (errs.length) {
      res.status(400).json({ error: errs.join(' '), details: errs });
      return;
    }
    const now = new Date().toISOString();
    // Server owns id, timestamps and texture URLs; clients upload textures separately (static template URLs are kept).
    const body = req.body as GuitarProfile;
    const profile: GuitarProfile = { ...body, id: crypto.randomUUID(), builtIn: undefined, createdAt: now, updatedAt: now, textures: staticTextures(body.textures) };
    delete profile.builtIn;
    res.status(201).json(store.putGuitar(profile));
  });

  r.get('/guitars/:id', (req, res) => {
    if (req.params.id === BUILTIN_GUITAR_ID) {
      res.json(BUILTIN_SUMMARY);
      return;
    }
    const g = store.getGuitar(req.params.id);
    if (!g) {
      res.status(404).json({ error: 'Gitar bulunamadı.' });
      return;
    }
    res.json(g);
  });

  r.put('/guitars/:id', (req, res) => {
    if (req.params.id === BUILTIN_GUITAR_ID) {
      res.status(403).json({ error: 'Yerleşik gitar değiştirilemez.' });
      return;
    }
    const old = store.getGuitar(req.params.id);
    if (!old) {
      res.status(404).json({ error: 'Gitar bulunamadı.' });
      return;
    }
    const errs = validateProfile(req.body, true);
    if (errs.length) {
      res.status(400).json({ error: errs.join(' '), details: errs });
      return;
    }
    const body = req.body as Partial<GuitarProfile>;
    const next: GuitarProfile = {
      ...old,
      ...body,
      id: old.id,
      createdAt: old.createdAt,
      updatedAt: new Date().toISOString(),
      // Texture URLs only change through the texture endpoints.
      textures: old.textures,
    };
    delete next.builtIn;
    res.json(store.putGuitar(next));
  });

  /** Copy of a stored guitar, texture files included. Body may carry `{ name }`. */
  r.post('/guitars/:id/duplicate', (req, res) => {
    const src = store.getGuitar(req.params.id);
    if (!src) {
      res.status(req.params.id === BUILTIN_GUITAR_ID ? 400 : 404).json({
        error: req.params.id === BUILTIN_GUITAR_ID ? 'Yerleşik gitarı kopyalamak için profilini POST /api/guitars ile gönder.' : 'Gitar bulunamadı.',
      });
      return;
    }
    const reqName = (req.body as { name?: unknown } | undefined)?.name;
    const name = typeof reqName === 'string' && reqName.trim() ? reqName.trim().slice(0, 120) : `${src.name} (kopya)`.slice(0, 120);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const from = store.guitarDir(src.id);
    if (fs.existsSync(from)) fs.cpSync(from, store.guitarDir(id), { recursive: true });
    const rewrite = (u: string) => u.replace(`/api/guitars/${src.id}/`, `/api/guitars/${id}/`);
    const t = src.textures ?? {};
    const textures: GuitarProfile['textures'] = {};
    for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) if (t[k]) textures[k] = rewrite(t[k]!);
    if (t.fretboard) textures.fretboard = { ...t.fretboard, url: rewrite(t.fretboard.url) };
    const copy: GuitarProfile = { ...structuredClone(src), id, name, textures, createdAt: now, updatedAt: now };
    res.status(201).json(store.putGuitar(copy));
  });

  r.delete('/guitars/:id', (req, res) => {
    if (req.params.id === BUILTIN_GUITAR_ID) {
      res.status(403).json({ error: 'Yerleşik gitar silinemez.' });
      return;
    }
    res.status(store.deleteGuitar(req.params.id) ? 204 : 404).end();
  });

  r.get('/guitars/:id/textures/:name', (req, res) => {
    const f = isTextureName(req.params.name) && store.getGuitar(req.params.id) ? findTexture(req.params.id, req.params.name) : undefined;
    if (!f) {
      res.status(404).end();
      return;
    }
    res.sendFile(f);
  });

  r.put('/guitars/:id/textures/:name', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '40mb' }), (req, res) => {
    const { id, name } = req.params;
    if (id === BUILTIN_GUITAR_ID) {
      res.status(403).json({ error: 'Yerleşik gitar değiştirilemez.' });
      return;
    }
    const g = store.getGuitar(id);
    if (!g) {
      res.status(404).json({ error: 'Gitar bulunamadı.' });
      return;
    }
    const ext = IMAGE_TYPES[(req.headers['content-type'] ?? '').split(';')[0].trim()];
    if (!isTextureName(name) || !ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: `Doku adı ${GUITAR_TEXTURE_NAMES.join('|')} olmalı; PNG, JPEG veya WebP gönder.` });
      return;
    }
    let toFret = 0;
    if (name === 'fretboard') {
      toFret = Number(req.query.toFret ?? g.textures?.fretboard?.toFret ?? 12);
      if (!Number.isInteger(toFret) || toFret < 1 || toFret > 36) {
        res.status(400).json({ error: 'toFret 1-36 arası tam sayı olmalı.' });
        return;
      }
    }
    const dir = store.guitarDir(id);
    fs.mkdirSync(dir, { recursive: true });
    for (const e of Object.values(IMAGE_TYPES)) fs.rmSync(path.join(dir, name + e), { force: true });
    fs.writeFileSync(path.join(dir, name + ext), req.body);
    const url = `/api/guitars/${id}/textures/${name}?v=${Date.now().toString(36)}`;
    const textures = { ...g.textures };
    if (name === 'fretboard') textures.fretboard = { url, toFret };
    else textures[name] = url;
    res.json(store.putGuitar({ ...g, textures, updatedAt: new Date().toISOString() }));
  });

  r.delete('/guitars/:id/textures/:name', (req, res) => {
    const { id, name } = req.params;
    const g = id === BUILTIN_GUITAR_ID ? undefined : store.getGuitar(id);
    if (!g || !isTextureName(name)) {
      res.status(404).end();
      return;
    }
    const f = findTexture(id, name);
    if (f) fs.rmSync(f);
    const textures = { ...g.textures };
    delete textures[name];
    res.json(store.putGuitar({ ...g, textures, updatedAt: new Date().toISOString() }));
  });

  r.get('/settings', (_req, res) => {
    res.json(store.getSettings());
  });

  r.put('/settings', (req, res) => {
    const id = (req.body as { activeGuitarId?: unknown })?.activeGuitarId;
    if (typeof id !== 'string' || (id !== BUILTIN_GUITAR_ID && !store.getGuitar(id))) {
      res.status(400).json({ error: 'activeGuitarId mevcut bir gitarın kimliği olmalı.' });
      return;
    }
    res.json(store.putSettings({ activeGuitarId: id }));
  });

  return r;
}
