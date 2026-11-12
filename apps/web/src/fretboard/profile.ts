import { useTexture } from '@react-three/drei';
import type { GuitarProfile } from '@guitar3d/shared';

export const DEFAULT_PROFILE_URL = '/guitar/veston.profile.json';

/** Texture URLs of a profile (fretboard, headstock face, rosette). */
export function profileTextureUrls(p: GuitarProfile) {
  return [p.textures.fretboard?.url, p.textures.headstock, p.textures.rosette].filter((u): u is string => !!u);
}

/** Starts downloading/decoding the textures so the guitar can render in one go. */
export function preloadProfile(p: GuitarProfile) {
  for (const url of profileTextureUrls(p)) useTexture.preload(url);
}

/** Loads the owner's Veston profile (measured by scripts/measure-veston.py) and preloads its textures. */
export async function loadDefaultProfile(): Promise<GuitarProfile> {
  const r = await fetch(DEFAULT_PROFILE_URL);
  if (!r.ok) throw new Error(`Gitar profili yüklenemedi (${r.status})`);
  const p = (await r.json()) as GuitarProfile;
  preloadProfile(p);
  return p;
}
