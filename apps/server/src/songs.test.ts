import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SeparatorStatus, StemName } from '@guitar3d/shared';
import { createApp } from './app.js';
import { Store } from './store.js';
import { SongQueue } from './songs.js';
import type { SeparateOptions, SongTools } from './separator.js';

/** In-memory stand-in for Demucs + ffmpeg. `gate` lets a test hold a job in 'separating'. */
class MockTools implements SongTools {
  available = true;
  fail = false;
  calls: string[] = [];
  gate: Promise<void> = Promise.resolve();
  async status(): Promise<SeparatorStatus> {
    return this.available ? { available: true } : { available: false, reason: 'Demucs is not installed.', setupHint: 'setup-demucs.sh' };
  }
  async probe(file: string) {
    const head = fs.readFileSync(file, 'utf8').slice(0, 4);
    if (head !== 'RIFF' && head !== 'ID3!') throw new Error('not audio');
    return { duration: 12.5, title: head === 'ID3!' ? 'Tag Title' : undefined, artist: head === 'ID3!' ? 'Tag Artist' : undefined };
  }
  async separate(input: string, outDir: string, { onProgress, signal }: SeparateOptions): Promise<StemName[]> {
    this.calls.push(input);
    onProgress(0.5);
    await this.gate;
    if (signal.aborted) throw new Error('aborted');
    if (this.fail) throw new Error('model crashed');
    fs.mkdirSync(outDir, { recursive: true });
    const stems: StemName[] = ['guitar', 'vocals', 'bass', 'drums', 'piano', 'other'];
    for (const s of stems) fs.writeFileSync(path.join(outDir, `${s}.mp3`), `MP3-${s}`);
    onProgress(1);
    return stems;
  }
}

const wav = Buffer.from('RIFF....WAVEfmt ');
let dir: string;
let tools: MockTools;
let app: ReturnType<typeof createApp>;
const queue = () => app.locals.songQueue as SongQueue;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-songs-'));
  tools = new MockTools();
  app = createApp(new Store(dir), { songTools: tools });
});

describe('songs api', () => {
  it('uploads audio, separates it in the queue and serves stems', async () => {
    const up = await request(app).post('/api/songs').attach('file', wav, 'My_Song.wav').expect(201);
    expect(up.body).toMatchObject({ title: 'My Song', artist: '', status: 'queued', duration: 12.5, stems: [] });
    expect(fs.existsSync(path.join(dir, 'songs', up.body.id, 'original.wav'))).toBe(true);

    await queue().idle();
    const s = (await request(app).get(`/api/songs/${up.body.id}`).expect(200)).body;
    expect(s).toMatchObject({ status: 'ready', progress: 1 });
    expect(s.stems).toContain('guitar');
    expect(typeof s.separationSeconds).toBe('number');

    const stem = await request(app).get(`/api/songs/${s.id}/stems/guitar`).buffer(true).expect(200);
    expect(stem.headers['content-type']).toMatch(/audio\/mpeg/);
    await request(app).get(`/api/songs/${s.id}/stems/banjo`).expect(404);
    await request(app).get(`/api/songs/${s.id}/original`).expect(200);
    expect((await request(app).get('/api/songs')).body).toHaveLength(1);
  });

  it('uses tags for title/artist and lets the client override', async () => {
    const tagged = await request(app).post('/api/songs').attach('file', Buffer.from('ID3!xx'), 'x.mp3').expect(201);
    expect(tagged.body).toMatchObject({ title: 'Tag Title', artist: 'Tag Artist' });
    const own = await request(app).post('/api/songs').field('title', 'Mine').attach('file', wav, 'y.flac').expect(201);
    expect(own.body.title).toBe('Mine');
    const renamed = await request(app).patch(`/api/songs/${own.body.id}`).send({ artist: 'Band' }).expect(200);
    expect(renamed.body.artist).toBe('Band');
    await request(app).patch(`/api/songs/${own.body.id}`).send({ title: ' ' }).expect(400);
    await queue().idle();
  });

  it('rejects other file types, undecodable audio and oversized uploads', async () => {
    await request(app).post('/api/songs').attach('file', wav, 'a.txt').expect(400);
    await request(app).post('/api/songs').attach('file', Buffer.from('nope'), 'a.mp3').expect(400);
    await request(app).post('/api/songs').expect(400);
    process.env.G3D_MAX_SONG_SECONDS = '10'; // the mock reports 12.5 s
    try {
      expect((await request(app).post('/api/songs').attach('file', wav, 'long.wav').expect(400)).body.error).toMatch(/too long/);
    } finally {
      delete process.env.G3D_MAX_SONG_SECONDS;
    }
    const big = Buffer.alloc(50 * 1024 * 1024 + 10);
    big.write('RIFF');
    await request(app).post('/api/songs').attach('file', big, 'big.wav').expect(413);
    expect((await request(app).get('/api/songs')).body).toHaveLength(0);
    // nothing left behind in the songs dir
    expect(fs.readdirSync(path.join(dir, 'songs'))).toEqual([]);
  });

  it('reports a missing separator and retries after it is installed', async () => {
    tools.available = false;
    expect((await request(app).get('/api/songs/separator')).body).toMatchObject({ available: false, reason: expect.stringMatching(/not installed/) });
    const up = await request(app).post('/api/songs').attach('file', wav, 's.wav').expect(201);
    await queue().idle();
    const s = (await request(app).get(`/api/songs/${up.body.id}`)).body;
    expect(s).toMatchObject({ status: 'error', error: 'Demucs is not installed.' });
    expect(tools.calls).toHaveLength(0);

    tools.available = true;
    expect((await request(app).post(`/api/songs/${s.id}/retry`).expect(200)).body.status).toBe('queued');
    await queue().idle();
    expect((await request(app).get(`/api/songs/${s.id}`)).body.status).toBe('ready');
    await request(app).post(`/api/songs/${s.id}/retry`).expect(409);
  });

  it('marks a failed separation as error', async () => {
    tools.fail = true;
    const up = await request(app).post('/api/songs').attach('file', wav, 's.wav').expect(201);
    await queue().idle();
    const s = (await request(app).get(`/api/songs/${up.body.id}`)).body;
    expect(s.status).toBe('error');
    expect(s.error).toMatch(/model crashed/);
  });

  it('runs one job at a time and deleting cancels and removes files', async () => {
    let release!: () => void;
    tools.gate = new Promise((r) => (release = r));
    const a = (await request(app).post('/api/songs').attach('file', wav, 'a.wav')).body;
    const b = (await request(app).post('/api/songs').attach('file', wav, 'b.wav')).body;
    await new Promise((r) => setTimeout(r, 20));
    expect((await request(app).get(`/api/songs/${a.id}`)).body).toMatchObject({ status: 'separating', progress: 0.5 });
    expect((await request(app).get(`/api/songs/${b.id}`)).body.status).toBe('queued');
    expect(tools.calls).toHaveLength(1);

    await request(app).delete(`/api/songs/${a.id}`).expect(204);
    expect(fs.existsSync(path.join(dir, 'songs', a.id))).toBe(false);
    release();
    await queue().idle();
    expect((await request(app).get(`/api/songs/${b.id}`)).body.status).toBe('ready');
    expect((await request(app).get('/api/songs')).body.map((s: { id: string }) => s.id)).toEqual([b.id]);
    await request(app).delete(`/api/songs/${a.id}`).expect(404);
    await request(app).get(`/api/songs/${a.id}`).expect(404);
  });

  it('resumes unfinished jobs after a restart and keeps songs out of backups', async () => {
    let release!: () => void;
    tools.gate = new Promise((r) => (release = r));
    const a = (await request(app).post('/api/songs').attach('file', wav, 'a.wav')).body;
    await new Promise((r) => setTimeout(r, 20));
    // "restart": a new app over the same data dir picks the job up again
    const tools2 = new MockTools();
    const app2 = createApp(new Store(dir), { songTools: tools2 });
    await (app2.locals.songQueue as SongQueue).idle();
    expect((await request(app2).get(`/api/songs/${a.id}`)).body.status).toBe('ready');
    release();
    await queue().idle();

    const backup = (await request(app2).get('/api/backup')).body;
    expect(backup.db.songs).toBeUndefined();
    expect(Object.keys(backup.files).some((f) => f.startsWith('songs/'))).toBe(false);
    await request(app2).post('/api/backup').send(backup).expect(200);
    expect((await request(app2).get('/api/songs')).body).toHaveLength(1);
  });
});
