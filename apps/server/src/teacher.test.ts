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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-teacher-'));
  app = createApp(new Store(dir));
});

describe('teacher api', () => {
  it('adds, filters and deletes bar notes', async () => {
    const a = await request(app).post('/api/notes').send({ tabKey: 'lesson:twinkle', bar: 3, text: 'Bileği gevşet' }).expect(201);
    await request(app).post('/api/notes').send({ tabKey: 'tab1', bar: 0, text: 'x' }).expect(201);
    const list = await request(app).get('/api/notes?tabKey=lesson:twinkle').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ bar: 3, text: 'Bileği gevşet' });
    await request(app).delete(`/api/notes/${a.body.id}`).expect(204);
    await request(app).delete(`/api/notes/${a.body.id}`).expect(404);
    await request(app).post('/api/notes').send({ tabKey: 'tab1', bar: -1, text: 'x' }).expect(400);
  });

  it('stores assignments sorted by due date and persists them', async () => {
    await request(app).post('/api/assignments').send({ tabKey: 'tab1', title: 'Riff', targetSpeed: 0.9, due: '2026-12-01', note: 'Temiz' }).expect(201);
    await request(app).post('/api/assignments').send({ tabKey: 'lesson:twinkle', title: 'Twinkle', targetSpeed: 1, due: '2026-11-20' }).expect(201);
    await request(app).post('/api/assignments').send({ tabKey: 'tab1', title: 'x', targetSpeed: 3, due: '2026-12-01' }).expect(400);
    const list = await request(app).get('/api/assignments').expect(200);
    expect(list.body.map((a: { title: string }) => a.title)).toEqual(['Twinkle', 'Riff']);
    const reloaded = createApp(new Store(dir));
    expect((await request(reloaded).get('/api/assignments')).body).toHaveLength(2);
  });
});
