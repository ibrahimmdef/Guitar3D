import type { AppSettings, GuitarProfile, GuitarSummary, GuitarTextureName } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID, BUILTIN_GUITAR_PROFILE_URL } from '@guitar3d/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Client for /api/guitars and /api/settings. `f` is injectable for tests. */
export function createGuitarsApi(f: typeof fetch = (...a) => fetch(...a)) {
  const api = {
    list: () => f('/api/guitars').then((r) => json<GuitarSummary[]>(r)),
    get: (id: string) => f(`/api/guitars/${id}`).then((r) => json<GuitarProfile>(r)),
    create: (p: Omit<GuitarProfile, 'id'>) => f('/api/guitars', send('POST', p)).then((r) => json<GuitarProfile>(r)),
    update: (id: string, p: Partial<GuitarProfile>) => f(`/api/guitars/${id}`, send('PUT', p)).then((r) => json<GuitarProfile>(r)),
    remove: (id: string) => f(`/api/guitars/${id}`, { method: 'DELETE' }),
    /** Uploads a texture; returns the profile with the updated texture URL. `toFret` only for 'fretboard'. */
    putTexture: (id: string, name: GuitarTextureName, blob: Blob, toFret?: number) =>
      f(`/api/guitars/${id}/textures/${name}${toFret ? `?toFret=${toFret}` : ''}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }).then((r) =>
        json<GuitarProfile>(r),
      ),
    getSettings: () => f('/api/settings').then((r) => json<AppSettings>(r)),
    setActiveGuitar: (activeGuitarId: string) => f('/api/settings', send('PUT', { activeGuitarId })).then((r) => json<AppSettings>(r)),
    /**
     * Full profile for any id: the built-in one comes from the web app's static files
     * (BUILTIN_GUITAR_PROFILE_URL), the rest from the server.
     */
    loadProfile: async (id: string): Promise<GuitarProfile> => {
      if (id === BUILTIN_GUITAR_ID) {
        const p = await f(BUILTIN_GUITAR_PROFILE_URL).then((r) => json<GuitarProfile>(r));
        return { ...p, id: BUILTIN_GUITAR_ID, builtIn: true };
      }
      return api.get(id);
    },
    /** Profile of the active guitar (falls back to the built-in one if the stored id is gone). */
    loadActiveProfile: async (): Promise<GuitarProfile> => {
      const { activeGuitarId } = await api.getSettings().catch(() => ({ activeGuitarId: BUILTIN_GUITAR_ID }));
      try {
        return await api.loadProfile(activeGuitarId);
      } catch {
        return api.loadProfile(BUILTIN_GUITAR_ID);
      }
    },
  };
  return api;
}

export const guitarsApi = createGuitarsApi();
