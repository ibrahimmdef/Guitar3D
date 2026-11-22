import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LinkImportStatus, SeparatorStatus, StemName } from '@guitar3d/shared';
import { createApp } from './app.js';
import { Store } from './store.js';
import type { SongQueue } from './songs.js';
import type { SeparateOptions, SongTools } from './separator.js';
import { checkLink, isPrivateAddress, LinkError, mapYtDlpError, parseYtDlpProgress, ytDlpCandidates, type DownloadOptions, type DownloadResult, type LinkTools } from './linkImport.js';

class MockSongTools implements SongTools {
  duration = 30;
  gate: Promise<void> = Promise.resolve();
  async status(): Promise<SeparatorStatus> {
    return { available: true };
  }
  async probe(file: string) {
    if (!fs.readFileSync(file, 'utf8').startsWith('AUDIO')) throw new Error('not audio');
    return { duration: this.duration };
  }
  async separate(_input: string, outDir: string, { onProgress }: SeparateOptions): Promise<StemName[]> {
    onProgress(0.5);
    await this.gate;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'guitar.mp3'), 'MP3');
    return ['guitar'];
  }
}

/** Stand-in for yt-dlp: `outcome` picks what the next download does. */
class MockLinks implements LinkTools {
  available = true;
  outcome: 'ok' | 'notaudio' | Error = 'ok';
  gate: Promise<void> = Promise.resolve();
  urls: string[] = [];
  hosts: Record<string, string[]> = { 'www.youtube.com': ['142.250.1.1'], 'archive.org': ['207.241.224.2'], 'evil.example': ['10.0.0.5'], 'mixed.example': ['93.184.216.34', '127.0.0.1'] };
  async status(): Promise<LinkImportStatus> {
    return this.available ? { available: true } : { available: false, reason: 'yt-dlp is not installed on the server.' };
  }
  async resolve(host: string) {
    if (!this.hosts[host]) throw new Error('ENOTFOUND');
    return this.hosts[host];
  }
  async download(url: string, workDir: string, { onProgress }: DownloadOptions): Promise<DownloadResult> {
    this.urls.push(url);
    onProgress(0.4);
    await this.gate;
    if (this.outcome instanceof Error) throw this.outcome;
    const file = path.join(workDir, 'original.m4a');
    fs.writeFileSync(file, this.outcome === 'ok' ? 'AUDIO data' : '<html>');
    return { file, title: 'Free Song', artist: 'Some Uploader', duration: 30 };
  }
}

let dir: string;
let songTools: MockSongTools;
let links: MockLinks;
let app: ReturnType<typeof createApp>;
const queue = () => app.locals.songQueue as SongQueue;
const get = async (id: string) => (await request(app).get(`/api/songs/${id}`)).body;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g3d-links-'));
  process.env.G3D_TMP_DIR = path.join(dir, 'tmp');
  songTools = new MockSongTools();
  links = new MockLinks();
  app = createApp(new Store(dir), { songTools, linkTools: links });
});

afterEach(() => {
  delete process.env.G3D_TMP_DIR;
  delete process.env.G3D_DELETE_LINK_ORIGINALS;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/songs/from-link', () => {
  it('downloads, validates, separates and drops the original (status flow)', async () => {
    let release!: () => void;
    links.gate = new Promise((r) => (release = r));
    const res = await request(app).post('/api/songs/from-link').send({ url: 'https://www.youtube.com/watch?v=abc#t=3' }).expect(201);
    expect(res.body).toMatchObject({ status: 'queued', sourceUrl: 'https://www.youtube.com/watch?v=abc', title: 'Song from youtube.com', fileName: '' });
    await new Promise((r) => setTimeout(r, 20));
    expect(await get(res.body.id)).toMatchObject({ status: 'downloading', progress: 0.4 });
    release();
    await queue().idle();
    const s = await get(res.body.id);
    expect(s).toMatchObject({ status: 'ready', title: 'Free Song', artist: 'Some Uploader', duration: 30, fileName: 'original.m4a', stems: ['guitar'], originalDeleted: true });
    expect(fs.existsSync(path.join(dir, 'songs', s.id, 'original.m4a'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'songs', s.id, 'stems', 'guitar.mp3'))).toBe(true);
    await request(app).get(`/api/songs/${s.id}/original`).expect(404);
    await request(app).get(`/api/songs/${s.id}/stems/guitar`).expect(200);
    // the work dir is cleaned up
    expect(fs.readdirSync(process.env.G3D_TMP_DIR!)).toEqual([]);
  });

  it('keeps the original when retention is off and keeps a title the user typed', async () => {
    process.env.G3D_DELETE_LINK_ORIGINALS = '0';
    const res = await request(app).post('/api/songs/from-link').send({ url: 'archive.org/details/x', title: 'My title' }).expect(201);
    expect(res.body.sourceUrl).toBe('https://archive.org/details/x');
    await queue().idle();
    const s = await get(res.body.id);
    expect(s).toMatchObject({ status: 'ready', title: 'My title', artist: 'Some Uploader' });
    expect(s.originalDeleted).toBeUndefined();
    await request(app).get(`/api/songs/${s.id}/original`).expect(200);
  });

  it('rejects bad and private links before anything is queued', async () => {
    const bad = async (url: unknown, re: RegExp) => expect((await request(app).post('/api/songs/from-link').send({ url }).expect(400)).body.error).toMatch(re);
    await bad('', /Paste a link/);
    await bad(42, /Paste a link/);
    await bad('file:///etc/passwd', /Only http/);
    await bad('ftp://archive.org/x', /Only http/);
    await bad('javascript:alert(1)', /Only http/);
    await bad('https://user:pw@archive.org/x', /user name/);
    await bad('http://127.0.0.1:3001/api/songs', /private/);
    await bad('http://localhost/x', /private/);
    await bad('http://[::1]/x', /private/);
    await bad('http://169.254.169.254/latest/meta-data', /private/);
    await bad('http://192.168.1.10/a.mp3', /private/);
    await bad('http://intranet/a', /private/);
    await bad('https://evil.example/a', /private/);
    await bad('https://mixed.example/a', /private/);
    await bad('https://nowhere.example/a', /Could not find/);
    expect(links.urls).toEqual([]);
    expect((await request(app).get('/api/songs')).body).toEqual([]);
  });

  it('maps download failures onto the card and retries', async () => {
    links.outcome = mapYtDlpError("ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser", 600);
    const res = await request(app).post('/api/songs/from-link').send({ url: 'https://www.youtube.com/watch?v=abc' }).expect(201);
    await queue().idle();
    expect(await get(res.body.id)).toMatchObject({ status: 'error', error: 'This site blocked the download. Upload the audio file instead.' });
    expect(fs.readdirSync(process.env.G3D_TMP_DIR!)).toEqual([]);

    links.outcome = 'ok';
    expect((await request(app).post(`/api/songs/${res.body.id}/retry`).expect(200)).body.status).toBe('queued');
    await queue().idle();
    expect((await get(res.body.id)).status).toBe('ready');
    expect(links.urls).toHaveLength(2);
  });

  it('validates the downloaded file like an upload', async () => {
    links.outcome = 'notaudio';
    const a = (await request(app).post('/api/songs/from-link').send({ url: 'https://archive.org/a' })).body;
    await queue().idle();
    expect((await get(a.id)).error).toMatch(/not valid audio/);

    links.outcome = 'ok';
    songTools.duration = 700;
    const b = (await request(app).post('/api/songs/from-link').send({ url: 'https://archive.org/b' })).body;
    await queue().idle();
    expect((await get(b.id)).error).toMatch(/too long/);
    expect(fs.existsSync(path.join(dir, 'songs', b.id, 'original.m4a'))).toBe(false);

    links.outcome = new Error('boom');
    const c = (await request(app).post('/api/songs/from-link').send({ url: 'https://archive.org/c' })).body;
    await queue().idle();
    expect((await get(c.id)).error).toBe('Download failed: boom');
  });

  it('reports availability and refuses when yt-dlp is missing', async () => {
    expect((await request(app).get('/api/songs/separator')).body).toMatchObject({ available: true, linkImport: { available: true } });
    links.available = false;
    expect((await request(app).get('/api/songs/separator')).body.linkImport).toMatchObject({ available: false, reason: expect.stringMatching(/yt-dlp/) });
    expect((await request(app).post('/api/songs/from-link').send({ url: 'https://archive.org/x' }).expect(503)).body.error).toMatch(/yt-dlp/);
  });

  it('deleting a downloading song cancels it', async () => {
    let release!: () => void;
    links.gate = new Promise((r) => (release = r));
    const a = (await request(app).post('/api/songs/from-link').send({ url: 'https://archive.org/a' })).body;
    await new Promise((r) => setTimeout(r, 20));
    await request(app).delete(`/api/songs/${a.id}`).expect(204);
    release();
    await queue().idle();
    expect((await request(app).get('/api/songs')).body).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'songs', a.id))).toBe(false);
  });
});

describe('link helpers', () => {
  it('parses yt-dlp progress lines', () => {
    expect(parseYtDlpProgress('[download]   0.0% of    3.10MiB at  Unknown B/s ETA Unknown')).toBe(0);
    expect(parseYtDlpProgress('[download]  42.3% of    3.10MiB at    1.20MiB/s ETA 00:02\n[download]  57.9% of ~  3.10MiB at 1.2MiB/s ETA 00:01 (frag 3/9)')).toBeCloseTo(0.579);
    expect(parseYtDlpProgress('[download] 100% of    3.10MiB in 00:00:02 at 1.43MiB/s')).toBe(1);
    expect(parseYtDlpProgress('[download] Destination: /x/original.webm')).toBeNull();
    expect(parseYtDlpProgress('[ExtractAudio] Destination: original.m4a 50%')).toBeNull();
  });

  it('maps yt-dlp messages to clear errors', () => {
    const code = (o: string) => mapYtDlpError(o, 600).code;
    expect(code('ERROR: Unsupported URL: https://example.com/')).toBe('unsupported');
    expect(code('[youtube] abc: Ve does not pass filter (duration <=? 600), skipping ..')).toBe('too_long');
    expect(mapYtDlpError('does not pass filter', 600).message).toBe('Song too long (max 10 min).');
    expect(code('[download] File is larger than max-filesize (90000000 bytes > 52428800 bytes). Aborting.')).toBe('too_big');
    expect(code("ERROR: [youtube] x: Sign in to confirm you’re not a bot.")).toBe('blocked');
    expect(code('ERROR: [Instagram] x: Requested content is not available, rate-limit reached or login required')).toBe('blocked');
    expect(code('ERROR: [youtube] x: Private video. Sign in if you have access')).toBe('unavailable');
    expect(code('ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader')).toBe('unavailable');
    expect(mapYtDlpError('ERROR: something odd happened', 600).message).toBe('Download failed: something odd happened');
    expect(mapYtDlpError('', 600)).toBeInstanceOf(LinkError);
  });

  it('classifies private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:a00:1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '207.241.224.2', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('normalises links and finds the yt-dlp binary', async () => {
    const resolve = async () => ['8.8.8.8'];
    expect(await checkLink(' youtu.be/abc ', resolve)).toBe('https://youtu.be/abc');
    await expect(checkLink('http://0x7f000001/', resolve)).rejects.toThrow(/private/);
    expect(ytDlpCandidates({ G3D_YTDLP: '/opt/yt-dlp' })).toEqual(['/opt/yt-dlp']);
    expect(ytDlpCandidates({}, '/home/u')).toEqual(['yt-dlp', '/home/u/.local/share/guitar3d/demucs-venv/bin/yt-dlp']);
  });
});
