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

  it('stores alphaTex sent as JSON and extracts title/artist', async () => {
    const tex = '\\title "Kendi Riffim" \\artist "Ben"\n\\track "Gitar"\n:4 0.6 2.6 3.6 0.6 |';
    const up = await request(app).post('/api/tabs').send({ alphaTex: tex, format: 'ascii' }).expect(201);
    expect(up.body).toMatchObject({ title: 'Kendi Riffim', artist: 'Ben', format: 'ascii' });
    expect(up.body.fileName).toMatch(/\.atex$/);
    const file = await request(app).get(`/api/tabs/${up.body.id}/file`).expect(200);
    expect(file.headers['content-type']).toMatch(/text\/plain/);
    expect(file.text).toBe(tex);
    await request(app).post('/api/tabs').send({ alphaTex: '  ' }).expect(400);
  });

  it('accepts .atex/.tex/.mxl/MusicXML uploads with format + metadata', async () => {
    const tex = await request(app).post('/api/tabs').attach('file', Buffer.from('\\title Riff\n:4 0.6 |'), 'a.tex').expect(201);
    expect(tex.body).toMatchObject({ title: 'Riff', format: 'alphatex' });
    expect(tex.body.fileName).toMatch(/\.atex$/);
    const xml = '<?xml version="1.0"?><score-partwise><work><work-title>Etüt &amp; Varyasyon</work-title></work><identification><creator type="composer">Ada</creator></identification></score-partwise>';
    const mx = await request(app).post('/api/tabs').attach('file', Buffer.from(xml), 'etut.musicxml').expect(201);
    expect(mx.body).toMatchObject({ title: 'Etüt & Varyasyon', artist: 'Ada', format: 'musicxml' });
    const mxl = await request(app).post('/api/tabs').attach('file', Buffer.from('PK'), 'x.mxl').expect(201);
    expect(mxl.body.format).toBe('mxl');
    const gp = await request(app).post('/api/tabs').field('title', 'Client title').field('artist', 'Client artist').attach('file', Buffer.from('GP'), 'f.gp5').expect(201);
    expect(gp.body).toMatchObject({ title: 'Client title', artist: 'Client artist', format: 'gp5' });
  });

  it('renames, marks played, searches and sorts', async () => {
    const a = (await request(app).post('/api/tabs').send({ alphaTex: ':4 0.6 |', title: 'Çiçek Dağı', artist: 'Anonim' })).body;
    const b = (await request(app).post('/api/tabs').send({ alphaTex: ':4 0.6 |', title: 'Blues in A' })).body;
    const r = await request(app).patch(`/api/tabs/${a.id}`).send({ title: 'Cicek Dagi Ezgisi', artist: 'Halk' }).expect(200);
    expect(r.body).toMatchObject({ title: 'Cicek Dagi Ezgisi', artist: 'Halk' });
    await request(app).patch(`/api/tabs/${a.id}`).send({ title: '' }).expect(400);
    await request(app).patch('/api/tabs/nope').send({ title: 'x' }).expect(404);

    const played = await request(app).post(`/api/tabs/${b.id}/played`).expect(200);
    expect(played.body.lastPlayedAt).toBeTruthy();
    await request(app).post('/api/tabs/nope/played').expect(404);

    expect((await request(app).get('/api/tabs?q=blues')).body.map((t: { id: string }) => t.id)).toEqual([b.id]);
    expect((await request(app).get('/api/tabs?q=halk')).body.map((t: { id: string }) => t.id)).toEqual([a.id]);
    expect((await request(app).get('/api/tabs?sort=played')).body[0].id).toBe(b.id);
    expect((await request(app).get('/api/tabs?sort=title')).body.map((t: { title: string }) => t.title)).toEqual(['Blues in A', 'Cicek Dagi Ezgisi']);
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
