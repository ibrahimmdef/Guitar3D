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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-backup-'));
  app = createApp(new Store(dir));
});

describe('backup api', () => {
  it('exports and restores tabs, files, sessions and notes into an empty server', async () => {
    const tab = await request(app).post('/api/tabs').send({ alphaTex: '\\title "Yedek"\n:4 0.6 |' }).expect(201);
    await request(app).post('/api/sessions').send({ kind: 'tab', refId: tab.body.id, title: 'Yedek', startedAt: '2026-11-10T10:00:00.000Z', seconds: 60 }).expect(201);
    await request(app).post('/api/notes').send({ tabKey: tab.body.id, bar: 0, text: 'not' }).expect(201);
    const backup = (await request(app).get('/api/backup').expect(200)).body;
    expect(Object.keys(backup.files)).toEqual([`tabs/${tab.body.fileName}`]);

    const other = createApp(new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-restore-'))));
    await request(other).post('/api/backup').send(backup).expect(200);
    expect((await request(other).get('/api/tabs')).body).toHaveLength(1);
    expect((await request(other).get('/api/sessions')).body).toHaveLength(1);
    expect((await request(other).get(`/api/notes?tabKey=${tab.body.id}`)).body).toHaveLength(1);
    const file = await request(other).get(`/api/tabs/${tab.body.id}/file`).expect(200);
    expect(file.text).toContain('Yedek');
  });

  it('rejects malformed backups and unsafe paths', async () => {
    await request(app).post('/api/backup').send({ version: 2 }).expect(400);
    await request(app).post('/api/backup').send({ version: 1, db: {}, files: { '../evil': 'eA==' } }).expect(400);
  });

  it('keeps server snapshots with the client local data', async () => {
    const made = await request(app).post('/api/backups').send({ local: { 'guitar3d.settings.v1': '{"theme":"light"}' } }).expect(201);
    const list = (await request(app).get('/api/backups').expect(200)).body;
    expect(list[0].name).toBe(made.body.name);
    const snap = await request(app).get(`/api/backups/${made.body.name}`).expect(200);
    expect(snap.body.local['guitar3d.settings.v1']).toBe('{"theme":"light"}');
    expect(snap.body.server.version).toBe(1);
    await request(app).get('/api/backups/..%2Fdb.json').expect(404);
  });
});
