import type { AppSettings, GuitarProfile, GuitarSummary, GuitarTextureName } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID, BUILTIN_GUITAR_PROFILE_URL } from '@guitar3d/shared';
import * as store from '../storage/guitars';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * The user's guitars (storage/guitars.ts, in this browser) plus the built-in one, whose profile is a
 * static file of the app. `f` loads static files and is injectable for tests.
 */
export function createGuitarsApi(f: typeof fetch = (...a) => fetch(...a)) {
  const api = {
    list: () => store.listGuitars(),
    get: (id: string) => store.getGuitar(id),
    create: (p: Omit<GuitarProfile, 'id'>) => store.createGuitar(p),
    update: (id: string, p: Partial<GuitarProfile>) => store.updateGuitar(id, p),
    rename: (id: string, name: string) => api.update(id, { name }),
    remove: (id: string) => store.deleteGuitar(id),
    /** Copy of a stored guitar, photos included. */
    duplicate: (id: string, name?: string) => store.duplicateGuitar(id, name),
    /** Stores a photo; returns the profile with the new photo. `toFret` only for 'fretboard'. */
    putTexture: (id: string, name: GuitarTextureName, blob: Blob, toFret?: number) => store.putTexture(id, name, blob, toFret),
    getSettings: (): Promise<AppSettings> => store.getSettings(),
    setActiveGuitar: (activeGuitarId: string) => store.setActiveGuitar(activeGuitarId),
    /** Full profile for any id: the built-in one from the app's static files, the rest from storage. */
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

export type GuitarsApi = ReturnType<typeof createGuitarsApi>;

/** Row of /guitar/templates/index.json. */
export interface GuitarTemplate {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  profileUrl: string;
}

export const TEMPLATES_INDEX_URL = '/guitar/templates/index.json';

export const BUILTIN_TEMPLATE: GuitarTemplate = {
  id: BUILTIN_GUITAR_ID,
  name: 'Veston dreadnought',
  description: '42″ black dreadnought, measured from photos.',
  kind: 'Dreadnought',
  profileUrl: BUILTIN_GUITAR_PROFILE_URL,
};

/**
 * Templates shipped with the web app: the built-in Veston plus whatever index.json lists. A missing
 * or malformed index (the dev server answers unknown paths with index.html) just yields Veston.
 */
export async function loadTemplates(f: typeof fetch = (...a) => fetch(...a)): Promise<GuitarTemplate[]> {
  try {
    const r = await f(TEMPLATES_INDEX_URL);
    if (!r.ok) return [BUILTIN_TEMPLATE];
    const list = JSON.parse(await r.text()) as unknown;
    if (!Array.isArray(list)) return [BUILTIN_TEMPLATE];
    const ok = list.filter(
      (t): t is GuitarTemplate => !!t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.profileUrl === 'string' && t.id !== BUILTIN_GUITAR_ID,
    );
    return [BUILTIN_TEMPLATE, ...ok];
  } catch {
    return [BUILTIN_TEMPLATE];
  }
}

export async function loadTemplateProfile(t: GuitarTemplate, f: typeof fetch = (...a) => fetch(...a)): Promise<GuitarProfile> {
  const r = await f(t.profileUrl);
  if (!r.ok) throw new Error(`Couldn't load the template (HTTP ${r.status}).`);
  try {
    return { ...(JSON.parse(await r.text()) as GuitarProfile), id: t.id };
  } catch {
    throw new Error('Couldn\'t read the template file.');
  }
}

export const guitarsApi = createGuitarsApi();
