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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-notes-'));
  app = createApp(new Store(dir));
});

describe('bar notes api', () => {
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
});
