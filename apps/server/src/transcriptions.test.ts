import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SeparatorStatus, StemName, TranscriberStatus } from '@guitar3d/shared';
import { readAutoTabInfo } from '@guitar3d/shared';
import { createApp } from './app.js';
import { Store } from './store.js';
import type { SongQueue } from './songs.js';
import type { SeparateOptions, SongTools } from './separator.js';
import type { TranscribeOptions, TranscriberTools } from './transcriber.js';
import type { TranscriptionQueue } from './transcriptions.js';
import type { RawTranscription } from './transcribe/index.js';

class MockSongTools implements SongTools {
  async status(): Promise<SeparatorStatus> {
    return { available: true };
  }
  async probe() {
    return { duration: 30 };
  }
  async separate(_input: string, outDir: string, { onProgress }: SeparateOptions): Promise<StemName[]> {
    fs.mkdirSync(outDir, { recursive: true });
    for (const s of ['guitar', 'drums'] as const) fs.writeFileSync(path.join(outDir, `${s}.mp3`), `MP3-${s}`);
    onProgress(1);
    return ['guitar', 'drums'];
  }
}

/** Stand-in for the Python runner: an E minor riff and a chord, at 120 BPM. */
class MockTranscriber implements TranscriberTools {
  available = true;
  fail = false;
  calls: { input: string; noBeats?: boolean }[] = [];
  gate: Promise<void> = Promise.resolve();
  async status(): Promise<TranscriberStatus> {
    return this.available ? { available: true } : { available: false, reason: 'Basic Pitch is not installed.', setupHint: 'setup-demucs.sh' };
  }
  async transcribe(input: string, { noBeats, onProgress, signal }: TranscribeOptions): Promise<RawTranscription> {
    this.calls.push({ input, noBeats });
    onProgress(0.5);
    await this.gate;
    if (signal.aborted) throw new Error('aborted');
    if (this.fail) throw new Error('onnx exploded');
    const n = (start: number, pitch: number, conf = 0.8, len = 0.2) => ({ start, end: start + len, pitch, conf });
    return {
      duration: 6,
      tempo: noBeats ? undefined : 120,
      beats: noBeats ? undefined : Array.from({ length: 10 }, (_, i) => i * 0.5),
      cents: 0,
      notes: [n(0, 40), n(0.5, 43), n(1, 45, 0.2), n(1.5, 47), n(2, 40, 0.8, 1.5), n(2, 47, 0.8, 1.5), n(2, 52, 0.8, 1.5)],
    };
  }
}

const wav = Buffer.from('RIFF....WAVEfmt ');
let dir: string;
let tr: MockTranscriber;
let app: ReturnType<typeof createApp>;
const tq = () => app.locals.transcriptionQueue as TranscriptionQueue;
const sq = () => app.locals.songQueue as SongQueue;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-tr-'));
  tr = new MockTranscriber();
  app = createApp(new Store(dir), { songTools: new MockSongTools(), transcriberTools: tr });
});

async function readySong() {
  const up = await request(app).post('/api/songs').field('artist', 'Band').attach('file', wav, 'Riff.wav').expect(201);
  await sq().idle();
  return up.body.id as string;
}

describe('transcriptions api', () => {
  it('transcribes a song guitar stem into a library tab', async () => {
    const songId = await readySong();
    let release!: () => void;
    tr.gate = new Promise((r) => (release = r));
    const job = (await request(app).post('/api/transcriptions').send({ songId }).expect(201)).body;
    expect(job).toMatchObject({ source: 'song', songId, title: 'Riff', status: 'queued' });
    // asking again while it runs returns the same job
    expect((await request(app).post('/api/transcriptions').send({ songId }).expect(200)).body.id).toBe(job.id);
    await new Promise((r) => setTimeout(r, 20));
    expect((await request(app).get(`/api/transcriptions/${job.id}`)).body).toMatchObject({ status: 'running', progress: 0.475 });
    release();
    await tq().idle();

    const done = (await request(app).get(`/api/transcriptions/${job.id}`).expect(200)).body;
    expect(done).toMatchObject({ status: 'ready', progress: 1, summary: { tuningId: 'standard', tempo: 120, tracks: ['Lead / riff', 'Rhythm'], lowConfidence: 1 } });
    expect(tr.calls[0].input).toBe(path.join(dir, 'songs', songId, 'stems', 'guitar.mp3'));
    expect(tr.calls[0].noBeats).toBe(false);

    const tabs = (await request(app).get('/api/tabs')).body;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: done.tabId, title: 'Riff (auto)', artist: 'Band', format: 'alphatex', transcription: { jobId: job.id, source: 'song', songId, lowConfidence: 1 } });
    const tex = (await request(app).get(`/api/tabs/${done.tabId}/file`).expect(200)).text;
    expect(readAutoTabInfo(tex)?.low).toHaveLength(1);
    expect(tex).toContain('\\track "Rhythm"');

    expect((await request(app).get(`/api/transcriptions?songId=${songId}`)).body).toHaveLength(1);
    expect((await request(app).get('/api/transcriptions?songId=nope')).body).toHaveLength(0);
  });

  it('rejects unknown or unseparated songs', async () => {
    await request(app).post('/api/transcriptions').send({ songId: 'nope' }).expect(404);
    const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-tr3-')));
    store.addSong({ id: 's1', title: 'x', artist: '', fileName: 'original.wav', uploadedAt: new Date().toISOString(), status: 'error', progress: 0, stems: [] });
    const app2 = createApp(store, { songTools: new MockSongTools(), transcriberTools: tr });
    expect((await request(app2).post('/api/transcriptions').send({ songId: 's1' }).expect(409)).body.error).toMatch(/Separate the song first/);
  });

  it('transcribes an uploaded recording with a fixed tempo and keeps it private', async () => {
    const res = await request(app).post('/api/transcriptions').field('title', 'Take 1').field('bpm', '120').field('offset', '0').attach('file', Buffer.from('webm'), 'take.webm').expect(201);
    expect(res.body).toMatchObject({ source: 'recording', title: 'Take 1', bpm: 120, offset: 0 });
    expect(fs.existsSync(path.join(dir, 'recordings', res.body.id, 'recording.webm'))).toBe(true);
    await tq().idle();
    const done = (await request(app).get(`/api/transcriptions/${res.body.id}`)).body;
    expect(done.status).toBe('ready');
    expect(tr.calls[0].noBeats).toBe(true);
    expect((await request(app).get(`/api/tabs`)).body[0].title).toBe('Take 1 (auto)');
    // recordings are not in backups
    const backup = (await request(app).get('/api/backup')).body;
    expect(Object.keys(backup.files).some((f) => f.startsWith('recordings/'))).toBe(false);
    expect(backup.db.transcriptions).toBeUndefined();
    // deleting the job removes the recording, the tab stays
    await request(app).delete(`/api/transcriptions/${res.body.id}`).expect(204);
    expect(fs.existsSync(path.join(dir, 'recordings', res.body.id))).toBe(false);
    expect((await request(app).get('/api/tabs')).body).toHaveLength(1);
  });

  it('validates recording uploads', async () => {
    await request(app).post('/api/transcriptions').attach('file', Buffer.from('x'), 'notes.txt').expect(400);
    await request(app).post('/api/transcriptions').field('bpm', '5').attach('file', Buffer.from('x'), 'a.webm').expect(400);
    expect(fs.existsSync(path.join(dir, 'recordings')) ? fs.readdirSync(path.join(dir, 'recordings')) : []).toEqual([]);
    expect((await request(app).get('/api/transcriptions')).body).toHaveLength(0);
  });

  it('reports a missing transcriber, failures, and retries', async () => {
    tr.available = false;
    expect((await request(app).get('/api/transcriptions/status')).body).toMatchObject({ available: false });
    const up = (await request(app).post('/api/transcriptions').attach('file', wav, 'a.wav').expect(201)).body;
    await tq().idle();
    expect((await request(app).get(`/api/transcriptions/${up.id}`)).body).toMatchObject({ status: 'error', error: 'Basic Pitch is not installed.' });
    tr.available = true;
    tr.fail = true;
    await request(app).post(`/api/transcriptions/${up.id}/retry`).expect(200);
    await tq().idle();
    expect((await request(app).get(`/api/transcriptions/${up.id}`)).body.error).toMatch(/onnx exploded/);
    tr.fail = false;
    await request(app).post(`/api/transcriptions/${up.id}/retry`).expect(200);
    await tq().idle();
    expect((await request(app).get(`/api/transcriptions/${up.id}`)).body.status).toBe('ready');
    await request(app).post(`/api/transcriptions/${up.id}/retry`).expect(409);
    await request(app).get('/api/transcriptions/nope').expect(404);
  });

  it('never runs a transcription while a separation is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const songTools = new MockSongTools();
    const sep = songTools.separate.bind(songTools);
    songTools.separate = async (...a) => {
      order.push('sep:start');
      await gate;
      order.push('sep:end');
      return sep(...a);
    };
    const orig = tr.transcribe.bind(tr);
    tr.transcribe = async (...a) => {
      order.push('tr:start');
      return orig(...a);
    };
    app = createApp(new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-tr2-'))), { songTools, transcriberTools: tr });
    await request(app).post('/api/songs').attach('file', wav, 'a.wav').expect(201);
    await new Promise((r) => setTimeout(r, 20));
    await request(app).post('/api/transcriptions').attach('file', wav, 'b.wav').expect(201);
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(['sep:start']);
    release();
    await sq().idle();
    await tq().idle();
    expect(order).toEqual(['sep:start', 'sep:end', 'tr:start']);
  });
});
