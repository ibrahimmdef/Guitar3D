import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GuitarProfile } from '@guitar3d/shared';
import type * as THREE from 'three';
import { buildGuitar, buildStaticStrings } from './build';
import { TEMPLATE_SPECS } from './templates';

const load = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as GuitarProfile;
const profiles = [load('../../public/guitar/veston.profile.json'), ...TEMPLATE_SPECS.map((s) => load(`../../public/guitar/templates/${s.id}.profile.json`))];

const finite = (g: THREE.BufferGeometry) => Array.from(g.attributes.position.array as Float32Array).every(Number.isFinite);

describe('buildGuitar', () => {
  for (const p of profiles) {
    it(`builds ${p.id} with finite, merged geometry`, () => {
      const geo = buildGuitar(p);
      const parts = Object.entries(geo.parts).filter(([, g]) => g) as [string, THREE.BufferGeometry][];
      // one geometry per material: a handful of draw calls
      expect(parts.length).toBeLessThanOrEqual(17);
      for (const [, g] of parts) expect(finite(g)).toBe(true);
      expect(finite(geo.fretboard)).toBe(true);
      expect(geo.strings).toHaveLength(6);
      const kind = p.kind ?? 'acoustic';
      expect(!!geo.parts.hole).toBe(kind !== 'electric');
      expect(!!geo.parts.pin).toBe(kind === 'acoustic');
      expect(!!geo.parts.inlay).toBe(!p.textures.fretboard && (p.inlay ?? 'dots') !== 'none');
      const s = buildStaticStrings(geo.strings);
      expect(finite(s.plain) && finite(s.wound)).toBe(true);
    });
  }
});
