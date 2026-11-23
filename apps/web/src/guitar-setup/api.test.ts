import { beforeEach, describe, expect, it } from 'vitest';
import type { GuitarProfile } from '@guitar3d/shared';
import { createGuitarsApi } from './api';
import { db, useMemoryDb } from '../storage/db';

/** Static files of the app (the built-in profile). */
const statics = (files: Record<string, unknown>) =>
  (async (url: string) => (url in files ? new Response(JSON.stringify(files[url])) : new Response('{"error":"missing"}', { status: 404 }))) as unknown as typeof fetch;

describe('guitarsApi', () => {
  beforeEach(() => void useMemoryDb());

  it('loads the built-in profile from the static file', async () => {
    const p = await createGuitarsApi(statics({ '/guitar/veston.profile.json': { id: 'x', name: 'Veston' } })).loadProfile('veston');
    expect(p).toMatchObject({ id: 'veston', builtIn: true, name: 'Veston' });
  });

  it('falls back to the built-in profile when the active one is gone', async () => {
    await db().put('kv', 'settings', { activeGuitarId: 'gone' });
    const api = createGuitarsApi(statics({ '/guitar/veston.profile.json': { name: 'Veston' } }));
    expect((await api.loadActiveProfile()).id).toBe('veston');
  });

  it('reports a guitar that does not exist', async () => {
    await expect(createGuitarsApi().get('nope')).rejects.toThrow('Guitar not found.');
  });

  it('lists the built-in guitar first', async () => {
    await db().put('guitars', 'g1', { id: 'g1', name: 'Mine', textures: {} } as unknown as GuitarProfile);
    expect((await createGuitarsApi().list()).map((g) => g.id)).toEqual(['veston', 'g1']);
  });
});
