import { describe, it, expect, beforeEach } from 'vitest';
import type { GuitarProfile } from '@guitar3d/shared';
import { createGuitarsApi, loadTemplates } from './api';
import { db, useMemoryDb } from '../storage/db';
import { __resetActiveGuitar, getActiveGuitar, invalidateGuitar, setActiveGuitar } from './activeGuitar';

/** The memory database with one stored guitar; `settingsFail` makes saving the choice fail. */
async function setup(opts: { settingsFail?: boolean } = {}) {
  useMemoryDb();
  await db().put('guitars', 'g1', { id: 'g1', name: 'One', textures: {} } as unknown as GuitarProfile);
  const statics = (async (url: string) =>
    url === '/guitar/veston.profile.json' ? new Response(JSON.stringify({ name: 'Veston', textures: {} })) : new Response('', { status: 404 })) as unknown as typeof fetch;
  const api = createGuitarsApi(statics);
  if (opts.settingsFail) api.setActiveGuitar = () => Promise.reject(new Error('x'));
  return api;
}

describe('active guitar store', () => {
  beforeEach(() => __resetActiveGuitar());

  it('switches, remembers the choice and reloads after an edit', async () => {
    __resetActiveGuitar(await setup());
    await setActiveGuitar('g1');
    expect(getActiveGuitar()).toMatchObject({ id: 'g1', loading: false, profile: { name: 'One' } });
    expect(await db().get('kv', 'settings')).toEqual({ activeGuitarId: 'g1' });
    await db().put('guitars', 'g1', { id: 'g1', name: 'New', textures: {} });
    invalidateGuitar('g1');
    await new Promise((r) => setTimeout(r, 0));
    expect(getActiveGuitar().profile?.name).toBe('New');
  });

  it('falls back to the built-in guitar when the profile is gone or deleted', async () => {
    __resetActiveGuitar(await setup({ settingsFail: true }));
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
    const t = await loadTemplates(ok(JSON.stringify([{ id: 'parlor', name: 'Parlor', profileUrl: '/guitar/templates/parlor.json' }, { name: 'missing' }])));
    expect(t.map((x) => x.id)).toEqual(['veston', 'parlor']);
  });
  it('falls back gracefully when the index is missing or HTML', async () => {
    expect((await loadTemplates(ok('', 404))).map((x) => x.id)).toEqual(['veston']);
    expect((await loadTemplates(ok('<!doctype html><html></html>'))).map((x) => x.id)).toEqual(['veston']);
  });
});
