import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Strategy = { kind: string; cache: string; fallback?: string } | null;
const g = globalThis as unknown as { G3D_SW: { strategyFor: (m: string, href: string, origin: string, mode?: string) => Strategy; PRECACHE: string[]; CACHES: Record<string, string> } };
// the worker's strategy file is a classic script that sets self.G3D_SW
new Function(readFileSync(fileURLToPath(new URL('../../public/sw-strategy.js', import.meta.url)), 'utf8'))();
const sw = g.G3D_SW;
const O = 'https://g3d.local';
const at = (p: string, mode = 'cors', method = 'GET') => sw.strategyFor(method, O + p, O, mode);

describe('service worker strategies', () => {
  it('serves pages network-first with the app shell as offline fallback', () => {
    expect(at('/#/rhythm', 'navigate')).toMatchObject({ kind: 'network-first', fallback: '/index.html' });
  });
  it('caches bundles, sound font, fonts and guitar textures', () => {
    expect(at('/assets/index-abc123.js')?.kind).toBe('cache-first');
    expect(at('/soundfont/sonivox.sf2')?.kind).toBe('cache-first');
    expect(at('/font/Bravura.woff2')?.kind).toBe('cache-first');
    expect(at('/guitar/fretboard.jpg')?.cache).toBe(sw.CACHES.media);
    expect(sw.strategyFor('GET', 'https://fonts.gstatic.com/s/inter/x.woff2', O)?.kind).toBe('cache-first');
    expect(sw.strategyFor('GET', 'https://fonts.googleapis.com/css2?family=Inter', O)?.kind).toBe('stale');
  });
  it('keeps API reads for offline but never touches writes or foreign hosts', () => {
    expect(at('/api/tabs')?.kind).toBe('network-first');
    expect(at('/api/tabs', 'cors', 'POST')).toBeNull();
    expect(at('/api/backup')).toBeNull();
    expect(at('/api/backups/x.json')).toBeNull();
    expect(sw.strategyFor('GET', 'https://example.com/x.js', O)).toBeNull();
  });
  it('precaches the essentials', () => {
    for (const p of ['/index.html', '/soundfont/sonivox.sf2', '/guitar/veston.profile.json']) expect(sw.PRECACHE).toContain(p);
  });
});

describe('web app manifest', () => {
  it('is installable', () => {
    const m = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/manifest.webmanifest', import.meta.url)), 'utf8'));
    expect(m.display).toBe('standalone');
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });
});
