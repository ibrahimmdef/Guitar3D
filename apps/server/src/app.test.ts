import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { MAX_PASS_HISTORY, Store } from './store.js';

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
    const tex = '\\title "My Own Riff" \\artist "Me"\n\\track "Guitar"\n:4 0.6 2.6 3.6 0.6 |';
    const up = await request(app).post('/api/tabs').send({ alphaTex: tex, format: 'ascii' }).expect(201);
    expect(up.body).toMatchObject({ title: 'My Own Riff', artist: 'Me', format: 'ascii' });
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
    const xml = '<?xml version="1.0"?><score-partwise><work><work-title>Étude &amp; Variation</work-title></work><identification><creator type="composer">Ada</creator></identification></score-partwise>';
    const mx = await request(app).post('/api/tabs').attach('file', Buffer.from(xml), 'etut.musicxml').expect(201);
    expect(mx.body).toMatchObject({ title: 'Étude & Variation', artist: 'Ada', format: 'musicxml' });
    const mxl = await request(app).post('/api/tabs').attach('file', Buffer.from('PK'), 'x.mxl').expect(201);
    expect(mxl.body.format).toBe('mxl');
    const gp = await request(app).post('/api/tabs').field('title', 'Client title').field('artist', 'Client artist').attach('file', Buffer.from('GP'), 'f.gp5').expect(201);
    expect(gp.body).toMatchObject({ title: 'Client title', artist: 'Client artist', format: 'gp5' });
  });

  it('renames, marks played, searches and sorts', async () => {
    const a = (await request(app).post('/api/tabs').send({ alphaTex: ':4 0.6 |', title: 'Café Déjà', artist: 'Anonymous' })).body;
    const b = (await request(app).post('/api/tabs').send({ alphaTex: ':4 0.6 |', title: 'Blues in A' })).body;
    const r = await request(app).patch(`/api/tabs/${a.id}`).send({ title: 'Cafe Deja Melody', artist: 'Folk' }).expect(200);
    expect(r.body).toMatchObject({ title: 'Cafe Deja Melody', artist: 'Folk' });
    await request(app).patch(`/api/tabs/${a.id}`).send({ title: '' }).expect(400);
    await request(app).patch('/api/tabs/nope').send({ title: 'x' }).expect(404);

    const played = await request(app).post(`/api/tabs/${b.id}/played`).expect(200);
    expect(played.body.lastPlayedAt).toBeTruthy();
    await request(app).post('/api/tabs/nope/played').expect(404);

    expect((await request(app).get('/api/tabs?q=blues')).body.map((t: { id: string }) => t.id)).toEqual([b.id]);
    expect((await request(app).get('/api/tabs?q=folk')).body.map((t: { id: string }) => t.id)).toEqual([a.id]);
    expect((await request(app).get('/api/tabs?sort=played')).body[0].id).toBe(b.id);
    expect((await request(app).get('/api/tabs?sort=title')).body.map((t: { title: string }) => t.title)).toEqual(['Blues in A', 'Cafe Deja Melody']);
  });

  it('stores progress', async () => {
    const sections = [{ startBar: 1, endBar: 4, bestCleanSpeed: 0.7, updatedAt: 'now' }];
    await request(app).put('/api/progress/abc').send({ sections }).expect(200);
    const got = await request(app).get('/api/progress/abc');
    expect(got.body.sections).toEqual(sections);
  });

  it('records speed-trainer passes: best clean speed, bpm and history', async () => {
    const post = (body: object, id = 'abc') => request(app).post(`/api/progress/${encodeURIComponent(id)}/passes`).send(body);
    let r = await post({ startBar: 4, endBar: 7, speed: 0.6, clean: true, score: 94, bpm: 120 }).expect(201);
    expect(r.body.sections).toHaveLength(1);
    expect(r.body.sections[0]).toMatchObject({ startBar: 4, endBar: 7, bestCleanSpeed: 0.6, bpm: 120 });
    expect(r.body.sections[0].history[0]).toMatchObject({ speed: 0.6, clean: true, score: 94, mode: 'mic' });
    await post({ startBar: 4, endBar: 7, speed: 0.7, clean: false, score: 71 }).expect(201);
    r = await post({ startBar: 4, endBar: 7, speed: 0.65, clean: true, mode: 'manual' }).expect(201);
    const s = r.body.sections[0];
    expect(s.bestCleanSpeed).toBe(0.65);
    expect(s.bpm).toBe(120);
    expect(s.history.map((h: { speed: number; clean: boolean; mode: string }) => [h.speed, h.clean, h.mode])).toEqual([[0.6, true, 'mic'], [0.7, false, 'mic'], [0.65, true, 'manual']]);
    // a slower clean pass never lowers the best
    r = await post({ startBar: 4, endBar: 7, speed: 0.6, clean: true }).expect(201);
    expect(r.body.sections[0].bestCleanSpeed).toBe(0.65);
    // another section of the same tab, and a lesson key
    r = await post({ startBar: 0, endBar: 1, speed: 0.8, clean: true }).expect(201);
    expect(r.body.sections).toHaveLength(2);
    await post({ startBar: 0, endBar: 0, speed: 1, clean: true }, 'lesson:em-pentatonic').expect(201);
    expect((await request(app).get(`/api/progress/${encodeURIComponent('lesson:em-pentatonic')}`)).body.sections[0].bestCleanSpeed).toBe(1);

    const all = (await request(app).get('/api/progress').expect(200)).body as { tabId: string }[];
    expect(all.map((p) => p.tabId).sort()).toEqual(['abc', 'lesson:em-pentatonic']);

    // a PUT from the old best-speed-only client keeps the history
    await request(app).put('/api/progress/abc').send({ sections: [{ startBar: 4, endBar: 7, bestCleanSpeed: 0.75, updatedAt: 'now' }] }).expect(200);
    const kept = (await request(app).get('/api/progress/abc')).body.sections[0];
    expect(kept.bestCleanSpeed).toBe(0.75);
    expect(kept.history).toHaveLength(4);
  });

  it('validates passes and caps the history', async () => {
    const post = (body: object) => request(app).post('/api/progress/t1/passes').send(body);
    await post({ startBar: 3, endBar: 1, speed: 0.6, clean: true }).expect(400);
    await post({ startBar: -1, endBar: 1, speed: 0.6, clean: true }).expect(400);
    await post({ startBar: 0, endBar: 1, speed: 5, clean: true }).expect(400);
    await post({ startBar: 0, endBar: 1, speed: 0.6, clean: 'yes' }).expect(400);
    await post({ startBar: 0, endBar: 1, speed: 0.6, clean: true, score: 140 }).expect(400);
    await post({ startBar: 0, endBar: 1, speed: 0.6, clean: true, mode: 'robot' }).expect(400);
    for (let i = 0; i < MAX_PASS_HISTORY + 5; i++) await post({ startBar: 0, endBar: 1, speed: 0.5, clean: i % 2 === 0 }).expect(201);
    const s = (await request(app).get('/api/progress/t1')).body.sections[0];
    expect(s.history).toHaveLength(MAX_PASS_HISTORY);
  });

  it('drops progress with its tab', async () => {
    const up = (await request(app).post('/api/tabs').send({ alphaTex: ':4 0.6 |', title: 'x' })).body;
    await request(app).post(`/api/progress/${up.id}/passes`).send({ startBar: 0, endBar: 0, speed: 0.6, clean: true }).expect(201);
    await request(app).delete(`/api/tabs/${up.id}`).expect(204);
    expect((await request(app).get(`/api/progress/${up.id}`)).body.sections).toEqual([]);
  });
});
