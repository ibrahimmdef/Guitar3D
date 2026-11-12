import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GuitarProfile } from '@guitar3d/shared';
import { createApp } from './app.js';
import { Store } from './store.js';
import { validateProfile } from './guitars.js';

let app: ReturnType<typeof createApp>;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-guitars-'));
  app = createApp(new Store(dir));
});

export function sampleProfile(over: Partial<GuitarProfile> = {}): Omit<GuitarProfile, 'id'> & { id?: string } {
  return {
    name: 'Test dreadnought',
    totalLengthCm: 104.1,
    scaleLengthCm: 64.8,
    fretCount: 20,
    bodyJoinFret: 14,
    nutWidthCm: 4.3,
    endWidthCm: 5.6,
    stringSpacingNutCm: 3.6,
    stringSpacingSaddleCm: 5.4,
    body: {
      outline: [[-30, 0], [-40, 20], [-90, 0], [-40, -20]],
      depthCm: 11,
      soundhole: { x: -46, y: 0, radiusCm: 5 },
      bridge: { x: -65.4, widthCm: 15, lengthCm: 3 },
    },
    headstock: { lengthCm: 18, profile: [[0, 2.2], [18, 3.6]], tunersLowE: [4, 8, 12], tunersHighE: [4, 8, 12], angleDeg: 14 },
    finish: {
      top: '#111111', sides: '#111111', back: '#111111', neck: '#222222', headstock: '#111111', fretboard: '#2a1a10',
      binding: '#eeeeee', pickguard: null, bridge: '#1a1a1a', hardware: 'chrome', gloss: 0.3,
    },
    textures: {},
    ...over,
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('guitars api', () => {
  it('lists the built-in Veston stub first', async () => {
    const res = await request(app).get('/api/guitars').expect(200);
    expect(res.body).toEqual([{ id: 'veston', name: 'Veston (yerleşik)', builtIn: true }]);
    const one = await request(app).get('/api/guitars/veston').expect(200);
    expect(one.body.builtIn).toBe(true);
  });

  it('creates, reads, updates and deletes a profile', async () => {
    const created = await request(app).post('/api/guitars').send(sampleProfile({ id: 'ignored' } as never)).expect(201);
    const id = created.body.id as string;
    expect(id).not.toBe('ignored');
    expect(created.body.createdAt).toBeTruthy();
    expect(created.body.textures).toEqual({});

    const list = await request(app).get('/api/guitars').expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[1]).toMatchObject({ id, name: 'Test dreadnought', totalLengthCm: 104.1 });

    const got = await request(app).get(`/api/guitars/${id}`).expect(200);
    expect(got.body.body.outline).toHaveLength(4);

    const upd = await request(app).put(`/api/guitars/${id}`).send({ name: 'Renamed', textures: { bodyTop: 'http://evil' } }).expect(200);
    expect(upd.body.name).toBe('Renamed');
    expect(upd.body.scaleLengthCm).toBe(64.8);
    expect(upd.body.textures).toEqual({});

    await request(app).delete(`/api/guitars/${id}`).expect(204);
    await request(app).get(`/api/guitars/${id}`).expect(404);
    await request(app).delete(`/api/guitars/${id}`).expect(404);
  });

  it('validates profiles', async () => {
    const bad = await request(app).post('/api/guitars').send({ name: '' }).expect(400);
    expect(bad.body.details.length).toBeGreaterThan(3);
    const created = await request(app).post('/api/guitars').send(sampleProfile()).expect(201);
    await request(app).put(`/api/guitars/${created.body.id}`).send({ scaleLengthCm: -3 }).expect(400);
    expect(validateProfile(sampleProfile())).toEqual([]);
    expect(validateProfile([])).toHaveLength(1);
  });

  it('refuses to modify the built-in profile', async () => {
    await request(app).put('/api/guitars/veston').send({ name: 'x' }).expect(403);
    await request(app).delete('/api/guitars/veston').expect(403);
    await request(app).put('/api/guitars/veston/textures/bodyTop').set('Content-Type', 'image/png').send(PNG).expect(403);
  });

  it('stores textures and points the profile at them', async () => {
    const { body: g } = await request(app).post('/api/guitars').send(sampleProfile()).expect(201);
    const top = await request(app).put(`/api/guitars/${g.id}/textures/bodyTop`).set('Content-Type', 'image/png').send(PNG).expect(200);
    expect(top.body.textures.bodyTop).toMatch(new RegExp(`^/api/guitars/${g.id}/textures/bodyTop\\?v=`));

    const fb = await request(app).put(`/api/guitars/${g.id}/textures/fretboard?toFret=15`).set('Content-Type', 'image/jpeg').send(PNG).expect(200);
    expect(fb.body.textures.fretboard).toMatchObject({ toFret: 15 });
    expect(fb.body.textures.fretboard.url).toMatch(/textures\/fretboard\?v=/);
    expect(fb.body.textures.bodyTop).toBe(top.body.textures.bodyTop);

    const file = await request(app).get(`/api/guitars/${g.id}/textures/fretboard`).buffer(true).expect(200);
    expect(file.headers['content-type']).toMatch(/jpeg/);

    // Replacing with another type removes the old file.
    await request(app).put(`/api/guitars/${g.id}/textures/fretboard`).set('Content-Type', 'image/webp').send(PNG).expect(200);
    expect(fs.readdirSync(path.join(dir, 'guitars', g.id)).sort()).toEqual(['bodyTop.png', 'fretboard.webp']);
    const listed = await request(app).get('/api/guitars');
    expect(listed.body[1].thumbnail).toBe(top.body.textures.bodyTop);

    const del = await request(app).delete(`/api/guitars/${g.id}/textures/bodyTop`).expect(200);
    expect(del.body.textures.bodyTop).toBeUndefined();
    await request(app).get(`/api/guitars/${g.id}/textures/bodyTop`).expect(404);

    await request(app).delete(`/api/guitars/${g.id}`).expect(204);
    expect(fs.existsSync(path.join(dir, 'guitars', g.id))).toBe(false);
  });

  it('rejects bad texture uploads', async () => {
    const { body: g } = await request(app).post('/api/guitars').send(sampleProfile()).expect(201);
    await request(app).put(`/api/guitars/${g.id}/textures/evil`).set('Content-Type', 'image/png').send(PNG).expect(400);
    await request(app).put(`/api/guitars/${g.id}/textures/bodyTop`).set('Content-Type', 'text/plain').send('x').expect(400);
    await request(app).put(`/api/guitars/${g.id}/textures/fretboard?toFret=99`).set('Content-Type', 'image/png').send(PNG).expect(400);
    await request(app).put('/api/guitars/nope/textures/bodyTop').set('Content-Type', 'image/png').send(PNG).expect(404);
    await request(app).get(`/api/guitars/${g.id}/textures/headstock`).expect(404);
  });
});

describe('settings api', () => {
  it('defaults to the built-in guitar and switches the active guitar', async () => {
    expect((await request(app).get('/api/settings').expect(200)).body).toEqual({ activeGuitarId: 'veston' });
    await request(app).put('/api/settings').send({ activeGuitarId: 'missing' }).expect(400);
    const { body: g } = await request(app).post('/api/guitars').send(sampleProfile()).expect(201);
    expect((await request(app).put('/api/settings').send({ activeGuitarId: g.id }).expect(200)).body.activeGuitarId).toBe(g.id);

    // Survives a restart.
    const again = createApp(new Store(dir));
    expect((await request(again).get('/api/settings')).body.activeGuitarId).toBe(g.id);

    // Deleting the active guitar falls back to the built-in one.
    await request(app).delete(`/api/guitars/${g.id}`).expect(204);
    expect((await request(app).get('/api/settings')).body.activeGuitarId).toBe('veston');
  });

  it('loads an old db.json without guitars or settings', async () => {
    fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ tabs: [], progress: {} }));
    const old = createApp(new Store(dir));
    expect((await request(old).get('/api/settings')).body.activeGuitarId).toBe('veston');
    expect((await request(old).get('/api/guitars')).body).toHaveLength(1);
  });
});
