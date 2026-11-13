import { describe, it, expect, beforeEach } from 'vitest';
import type { GuitarProfile } from '@guitar3d/shared';
import { createGuitarsApi, loadTemplates } from './api';
import { __resetActiveGuitar, getActiveGuitar, invalidateGuitar, setActiveGuitar } from './activeGuitar';

function server(opts: { settingsFail?: boolean } = {}) {
  const puts: string[] = [];
  const profiles: Record<string, Partial<GuitarProfile>> = { g1: { id: 'g1', name: 'Bir', textures: {} } };
  const f = (async (url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET';
    if (url === '/api/settings' && m === 'PUT') {
      if (opts.settingsFail) return new Response('{"error":"x"}', { status: 500 });
      puts.push(JSON.parse(String(init!.body)).activeGuitarId);
      return new Response(init!.body, { status: 200 });
    }
    if (url === '/api/settings') return new Response(JSON.stringify({ activeGuitarId: 'veston' }));
    if (url === '/guitar/veston.profile.json') return new Response(JSON.stringify({ name: 'Veston', textures: {} }));
    const id = url.split('/').pop()!;
    if (profiles[id]) return new Response(JSON.stringify(profiles[id]));
    return new Response('{"error":"yok"}', { status: 404 });
  }) as unknown as typeof fetch;
  return { api: createGuitarsApi(f), puts, profiles };
}

describe('active guitar store', () => {
  beforeEach(() => __resetActiveGuitar());

  it('switches, persists on the server and reloads after an edit', async () => {
    const s = server();
    __resetActiveGuitar(s.api);
    await setActiveGuitar('g1');
    expect(getActiveGuitar()).toMatchObject({ id: 'g1', loading: false, profile: { name: 'Bir' } });
    expect(s.puts).toEqual(['g1']);
    s.profiles.g1 = { ...s.profiles.g1, name: 'Yeni' };
    invalidateGuitar('g1');
    await new Promise((r) => setTimeout(r, 0));
    expect(getActiveGuitar().profile?.name).toBe('Yeni');
  });

  it('falls back to the built-in guitar when the profile is gone or deleted', async () => {
    const s = server({ settingsFail: true });
    __resetActiveGuitar(s.api);
    await setActiveGuitar('missing');
    expect(getActiveGuitar()).toMatchObject({ id: 'veston', profile: { name: 'Veston' } });
    await setActiveGuitar('g1');
    invalidateGuitar('g1', true);
    await new Promise((r) => setTimeout(r, 0));
    expect(getActiveGuitar().id).toBe('veston');
  });
});

describe('templates', () => {
  const ok = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  it('lists the built-in template plus valid index entries', async () => {
    const t = await loadTemplates(ok(JSON.stringify([{ id: 'parlor', name: 'Parlor', profileUrl: '/guitar/templates/parlor.json' }, { name: 'eksik' }])));
    expect(t.map((x) => x.id)).toEqual(['veston', 'parlor']);
  });
  it('falls back gracefully when the index is missing or HTML', async () => {
    expect((await loadTemplates(ok('', 404))).map((x) => x.id)).toEqual(['veston']);
    expect((await loadTemplates(ok('<!doctype html><html></html>'))).map((x) => x.id)).toEqual(['veston']);
  });
});
