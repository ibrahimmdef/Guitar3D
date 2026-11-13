import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-sessions-'));
  app = createApp(new Store(dir));
});

describe('sessions api', () => {
  it('stores sessions, lists newest first and persists them in data/', async () => {
    const a = await request(app).post('/api/sessions').send({ kind: 'tab', refId: 't1', title: 'Riff', startedAt: '2026-11-10T10:00:00.000Z', seconds: 600, bestCleanSpeed: 0.85, accuracy: 92.4 }).expect(201);
    expect(a.body).toMatchObject({ kind: 'tab', refId: 't1', seconds: 600, bestCleanSpeed: 0.85, accuracy: 92, endedAt: '2026-11-10T10:10:00.000Z' });
    expect(a.body.id).toBeTruthy();
    await request(app).post('/api/sessions').send({ kind: 'routine', title: '10 dk', startedAt: '2026-11-12T08:00:00.000Z', endedAt: '2026-11-12T08:10:00.000Z', seconds: 590 }).expect(201);

    const list = await request(app).get('/api/sessions').expect(200);
    expect(list.body.map((s: { kind: string }) => s.kind)).toEqual(['routine', 'tab']);

    const since = await request(app).get('/api/sessions').query({ since: '2026-11-11T00:00:00.000Z' });
    expect(since.body).toHaveLength(1);
    expect((await request(app).get('/api/sessions').query({ refId: 't1' })).body).toHaveLength(1);
    expect((await request(app).get('/api/sessions').query({ limit: 1 })).body).toHaveLength(1);

    // A fresh store over the same directory sees them.
    const again = createApp(new Store(dir));
    expect((await request(again).get('/api/sessions')).body).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).sessions).toHaveLength(2);
  });

  it('validates the body', async () => {
    await request(app).post('/api/sessions').send({ kind: 'nap', startedAt: '2026-11-10T10:00:00Z', seconds: 60 }).expect(400);
    await request(app).post('/api/sessions').send({ kind: 'tab', startedAt: 'yesterday', seconds: 60 }).expect(400);
    await request(app).post('/api/sessions').send({ kind: 'tab', startedAt: '2026-11-10T10:00:00Z', seconds: 0 }).expect(400);
    const clamped = await request(app).post('/api/sessions').send({ kind: 'scales', startedAt: '2026-11-10T10:00:00Z', seconds: 999999, accuracy: 140, title: '  ' }).expect(201);
    expect(clamped.body).toMatchObject({ seconds: 43200, accuracy: 100, title: 'Pratik' });
  });
});
