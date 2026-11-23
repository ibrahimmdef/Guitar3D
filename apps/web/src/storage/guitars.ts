import type { AppSettings, GuitarProfile, GuitarSummary, GuitarTextureName } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID, GUITAR_TEXTURE_NAMES } from '@guitar3d/shared';
import { db, newId } from './db';

/**
 * The user's own guitars (measurements + photos) and which one is active.
 *
 * Photos ("textures") are stored as image bytes in the `textures` store under `<guitarId>/<name>`.
 * A profile refers to its photos as `local:<guitarId>/<name>?v=<version>`; before a profile goes to
 * the 3D scene, `withTextureUrls` swaps those for blob: URLs the browser can load like any image.
 * Template photos shipped with the app (`/guitar/...`) are plain URLs and stay as they are.
 */

export const BUILTIN_SUMMARY: GuitarSummary = { id: BUILTIN_GUITAR_ID, name: 'Veston (built-in)', builtIn: true };

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOCAL = 'local:';

interface StoredImage {
  type: string;
  data: ArrayBuffer;
}

// ---- validation ---------------------------------------------------------------------------

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** Problems with a profile, empty when it is usable. `partial` checks only the fields given (updates). */
export function validateProfile(p: unknown, partial = false): string[] {
  const errs: string[] = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['The guitar must be an object.'];
  const g = p as Partial<GuitarProfile>;
  const need = (ok: boolean, key: string, msg: string) => {
    if ((g as Record<string, unknown>)[key] === undefined) {
      if (!partial) errs.push(`${key} is required.`);
    } else if (!ok) errs.push(msg);
  };
  need(typeof g.name === 'string' && g.name.trim().length > 0 && g.name.length <= 120, 'name', 'name must be a string of 1-120 characters.');
  for (const k of ['totalLengthCm', 'scaleLengthCm', 'nutWidthCm', 'endWidthCm', 'stringSpacingNutCm', 'stringSpacingSaddleCm'] as const) {
    need(isNum(g[k]) && (g[k] as number) > 0 && (g[k] as number) < 300, k, `${k} must be a positive number (cm).`);
  }
  for (const k of ['fretCount', 'bodyJoinFret'] as const) {
    need(Number.isInteger(g[k]) && (g[k] as number) > 0 && (g[k] as number) <= 36, k, `${k} must be an integer from 1 to 36.`);
  }
  need(
    !!g.body && Array.isArray(g.body.outline) && g.body.outline.length >= 3 && g.body.outline.length <= 5000 && g.body.outline.every(isPt) &&
      isNum(g.body.depthCm) && !!g.body.soundhole && isNum(g.body.soundhole.x) && isNum(g.body.soundhole.y) && isNum(g.body.soundhole.radiusCm) &&
      !!g.body.bridge && isNum(g.body.bridge.x),
    'body',
    'body must contain outline [[x,y]…], depthCm, soundhole {x,y,radiusCm} and bridge {x,…}.',
  );
  need(
    !!g.headstock && isNum(g.headstock.lengthCm) && Array.isArray(g.headstock.profile) && g.headstock.profile.every(isPt) &&
      Array.isArray(g.headstock.tunersLowE) && Array.isArray(g.headstock.tunersHighE),
    'headstock',
    'headstock must contain lengthCm, profile [[d,w]…], tunersLowE, tunersHighE.',
  );
  need(!!g.finish && typeof g.finish === 'object', 'finish', 'finish must be an object.');
  return errs;
}

/** Keeps only the photo references that point at the app's own files (a template's photos). */
function staticTextures(t: GuitarProfile['textures'] | undefined): GuitarProfile['textures'] {
  const isStatic = (u: unknown): u is string => typeof u === 'string' && /^\/guitar\/[\w./-]+$/.test(u) && !u.includes('..');
  const out: GuitarProfile['textures'] = {};
  if (!t || typeof t !== 'object') return out;
  for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) if (isStatic(t[k])) out[k] = t[k];
  if (t.fretboard && isStatic(t.fretboard.url) && Number.isInteger(t.fretboard.toFret)) out.fretboard = { url: t.fretboard.url, toFret: t.fretboard.toFret };
  return out;
}

// ---- photo URLs ---------------------------------------------------------------------------

/** blob: URL per stored photo reference (a new version gets a new URL; the old one is released). */
const urls = new Map<string, string>();

async function urlFor(ref: string): Promise<string | undefined> {
  if (!ref.startsWith(LOCAL)) return ref;
  const cached = urls.get(ref);
  if (cached) return cached;
  const key = ref.slice(LOCAL.length).split('?')[0];
  const img = await db().get<StoredImage>('textures', key);
  if (!img) return undefined;
  for (const [r, u] of urls) {
    if (r.slice(LOCAL.length).split('?')[0] === key) {
      URL.revokeObjectURL(u);
      urls.delete(r);
    }
  }
  const url = URL.createObjectURL(new Blob([img.data], { type: img.type }));
  urls.set(ref, url);
  return url;
}

/** The profile with its stored photos as loadable URLs (for the 3D scene and previews). */
export async function withTextureUrls(p: GuitarProfile): Promise<GuitarProfile> {
  const t = p.textures ?? {};
  const out: GuitarProfile['textures'] = {};
  for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) {
    const u = t[k] && (await urlFor(t[k]!));
    if (u) out[k] = u;
  }
  if (t.fretboard) {
    const u = await urlFor(t.fretboard.url);
    if (u) out.fretboard = { ...t.fretboard, url: u };
  }
  return { ...p, textures: out };
}

// ---- guitars ------------------------------------------------------------------------------

function summary(p: GuitarProfile): GuitarSummary {
  return { id: p.id, name: p.name, totalLengthCm: p.totalLengthCm, scaleLengthCm: p.scaleLengthCm, updatedAt: p.updatedAt, thumbnail: p.textures?.bodyTop };
}

/** The built-in guitar first, then the user's, last changed first. */
export async function listGuitars(): Promise<GuitarSummary[]> {
  const all = await db().all<GuitarProfile>('guitars');
  all.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const rows = await Promise.all(all.map(async (g) => summary(await withTextureUrls(g))));
  return [BUILTIN_SUMMARY, ...rows];
}

/** A stored guitar as saved (photo references not resolved). */
async function stored(id: string): Promise<GuitarProfile> {
  if (id === BUILTIN_GUITAR_ID) throw new Error('The built-in guitar can\'t be changed.');
  const g = await db().get<GuitarProfile>('guitars', id);
  if (!g) throw new Error('Guitar not found.');
  return g;
}

/** A guitar with loadable photo URLs. */
export async function getGuitar(id: string): Promise<GuitarProfile> {
  return withTextureUrls(await stored(id));
}

export async function createGuitar(p: Omit<GuitarProfile, 'id'>): Promise<GuitarProfile> {
  const errs = validateProfile(p);
  if (errs.length) throw new Error(errs.join(' '));
  const now = new Date().toISOString();
  const profile: GuitarProfile = { ...p, id: newId(), createdAt: now, updatedAt: now, textures: staticTextures(p.textures) };
  delete profile.builtIn;
  await db().put('guitars', profile.id, profile);
  return withTextureUrls(profile);
}

/** Changes measurements, name or finish. Photos change only through putTexture. */
export async function updateGuitar(id: string, patch: Partial<GuitarProfile>): Promise<GuitarProfile> {
  const old = await stored(id);
  const errs = validateProfile(patch, true);
  if (errs.length) throw new Error(errs.join(' '));
  const next: GuitarProfile = { ...old, ...patch, id: old.id, createdAt: old.createdAt, updatedAt: new Date().toISOString(), textures: old.textures };
  delete next.builtIn;
  await db().put('guitars', id, next);
  return withTextureUrls(next);
}

/** A copy of a stored guitar, photos included. */
export async function duplicateGuitar(id: string, name?: string): Promise<GuitarProfile> {
  const src = await stored(id);
  const copyId = newId();
  const now = new Date().toISOString();
  const rewrite = (u: string) => (u.startsWith(`${LOCAL}${src.id}/`) ? u.replace(`${LOCAL}${src.id}/`, `${LOCAL}${copyId}/`) : u);
  for (const n of GUITAR_TEXTURE_NAMES) {
    const img = await db().get<StoredImage>('textures', `${src.id}/${n}`);
    if (img) await db().put('textures', `${copyId}/${n}`, img);
  }
  const t = src.textures ?? {};
  const textures: GuitarProfile['textures'] = {};
  for (const k of ['bodyTop', 'headstock', 'bodyBack', 'rosette'] as const) if (t[k]) textures[k] = rewrite(t[k]!);
  if (t.fretboard) textures.fretboard = { ...t.fretboard, url: rewrite(t.fretboard.url) };
  const copy: GuitarProfile = { ...structuredClone(src), id: copyId, name: (name?.trim() || `${src.name} (copy)`).slice(0, 120), textures, createdAt: now, updatedAt: now };
  await db().put('guitars', copyId, copy);
  return withTextureUrls(copy);
}

export async function deleteGuitar(id: string) {
  if (id === BUILTIN_GUITAR_ID) throw new Error('The built-in guitar can\'t be deleted.');
  await db().delete('guitars', id);
  for (const n of GUITAR_TEXTURE_NAMES) await db().delete('textures', `${id}/${n}`);
  if ((await getSettings()).activeGuitarId === id) await db().put('kv', 'settings', { activeGuitarId: BUILTIN_GUITAR_ID });
}

/** Stores a photo (PNG, JPEG or WebP). `toFret`: how far up the neck a fretboard photo reaches. */
export async function putTexture(id: string, name: GuitarTextureName, image: Blob, toFret?: number): Promise<GuitarProfile> {
  const g = await stored(id);
  if (!GUITAR_TEXTURE_NAMES.includes(name) || !IMAGE_TYPES.includes(image.type) || !image.size) throw new Error('Send a PNG, JPEG or WebP photo.');
  let fret = 0;
  if (name === 'fretboard') {
    fret = toFret ?? g.textures?.fretboard?.toFret ?? 12;
    if (!Number.isInteger(fret) || fret < 1 || fret > 36) throw new Error('toFret must be an integer from 1 to 36.');
  }
  await db().put('textures', `${id}/${name}`, { type: image.type, data: await image.arrayBuffer() } satisfies StoredImage);
  const ref = `${LOCAL}${id}/${name}?v=${Date.now().toString(36)}`;
  const textures = { ...g.textures };
  if (name === 'fretboard') textures.fretboard = { url: ref, toFret: fret };
  else textures[name] = ref;
  const next = { ...g, textures, updatedAt: new Date().toISOString() };
  await db().put('guitars', id, next);
  return withTextureUrls(next);
}

// ---- settings -----------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  return { activeGuitarId: BUILTIN_GUITAR_ID, ...(await db().get<AppSettings>('kv', 'settings')) };
}

export async function setActiveGuitar(activeGuitarId: string): Promise<AppSettings> {
  if (activeGuitarId !== BUILTIN_GUITAR_ID && !(await db().get('guitars', activeGuitarId))) throw new Error('That guitar doesn\'t exist.');
  const s = { activeGuitarId };
  await db().put('kv', 'settings', s);
  return s;
}
