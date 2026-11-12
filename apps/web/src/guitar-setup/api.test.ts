import { describe, it, expect } from 'vitest';
import { createGuitarsApi } from './api';

function fake(routes: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: 'yok' }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('guitarsApi', () => {
  it('loads the built-in profile from the static file', async () => {
    const { f, calls } = fake({ 'GET /guitar/veston.profile.json': { id: 'x', name: 'Veston' } });
    const p = await createGuitarsApi(f).loadProfile('veston');
    expect(p).toMatchObject({ id: 'veston', builtIn: true, name: 'Veston' });
    expect(calls[0].url).toBe('/guitar/veston.profile.json');
  });

  it('falls back to the built-in profile when the active one is gone', async () => {
    const { f } = fake({ 'GET /api/settings': { activeGuitarId: 'gone' }, 'GET /guitar/veston.profile.json': { name: 'Veston' } });
    expect((await createGuitarsApi(f).loadActiveProfile()).id).toBe('veston');
  });

  it('uploads textures with toFret and surfaces server errors', async () => {
    const { f, calls } = fake({ 'PUT /api/guitars/g1/textures/fretboard?toFret=15': { id: 'g1' } });
    const api = createGuitarsApi(f);
    await api.putTexture('g1', 'fretboard', new Blob(['x'], { type: 'image/jpeg' }), 15);
    expect((calls[0].init!.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
    await expect(api.get('nope')).rejects.toThrow('yok');
  });
});
