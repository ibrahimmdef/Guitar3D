import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-'));
  app = createApp(new Store(dir));
});

describe('tabs api', () => {
  it('uploads, lists, downloads and deletes a tab', async () => {
    const up = await request(app).post('/api/tabs').attach('file', Buffer.from('GPDATA'), 'Song.gp5');
    expect(up.status).toBe(201);
    expect(up.body.title).toBe('Song');

    const list = await request(app).get('/api/tabs');
    expect(list.body).toHaveLength(1);

    const file = await request(app).get(`/api/tabs/${up.body.id}/file`).buffer(true);
    expect(file.status).toBe(200);

    expect((await request(app).delete(`/api/tabs/${up.body.id}`)).status).toBe(204);
    expect((await request(app).get('/api/tabs')).body).toHaveLength(0);
  });

  it('rejects unsupported files', async () => {
    const res = await request(app).post('/api/tabs').attach('file', Buffer.from('x'), 'notes.txt');
    expect(res.status).toBe(400);
  });

  it('stores progress', async () => {
    const sections = [{ startBar: 1, endBar: 4, bestCleanSpeed: 0.7, updatedAt: 'now' }];
    await request(app).put('/api/progress/abc').send({ sections }).expect(200);
    const got = await request(app).get('/api/progress/abc');
    expect(got.body.sections).toEqual(sections);
  });
});

describe('guitar assets api', () => {
  it('stores and serves a fretboard texture', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await request(app).put('/api/guitar/textures/fretboard').set('Content-Type', 'image/png').send(png).expect(204);
    const assets = await request(app).get('/api/guitar/assets');
    expect(assets.body.textures.fretboard).toMatch(/^\/api\/guitar\/textures\/fretboard\?v=/);
    expect(assets.body.textures.top).toBeNull();
    const got = await request(app).get('/api/guitar/textures/fretboard').buffer(true);
    expect(got.status).toBe(200);
  });

  it('rejects unknown texture names and non-images', async () => {
    await request(app).put('/api/guitar/textures/evil').set('Content-Type', 'image/png').send(Buffer.from('x')).expect(400);
    await request(app).put('/api/guitar/textures/top').set('Content-Type', 'text/plain').send('x').expect(400);
  });
});
