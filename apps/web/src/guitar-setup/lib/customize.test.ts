import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GuitarProfile } from '@guitar3d/shared';
import { customizeProfile, proportionalScale, sizeProblem, SIZE_PRESETS } from './customize';
import { fretAt } from './geometry';

const veston = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../public/guitar/veston.profile.json'), 'utf8')) as GuitarProfile;
const joinFret = (p: Omit<GuitarProfile, 'id'>) => fretAt(p.scaleLengthCm, -Math.max(...p.body.outline.map((q) => q[0])));

describe('customizeProfile', () => {
  it('offers 36"–42" presets', () => {
    expect(SIZE_PRESETS.map((p) => p.inches)).toEqual([36, 37, 38, 39, 40, 41, 42]);
    expect(SIZE_PRESETS.at(-1)!.cm).toBeCloseTo(106.7, 1);
  });

  it('keeps the template when nothing changes', () => {
    const p = customizeProfile(veston, {});
    expect(p.totalLengthCm).toBeCloseTo(veston.totalLengthCm, 1);
    expect(p.body.outline).toEqual(veston.body.outline);
    expect(p.textures).toEqual(veston.textures);
    expect('id' in p).toBe(false);
  });

  it('shrinks to 36" proportionally, keeping bridge on the saddle and the neck joint', () => {
    const scale = proportionalScale(veston, 91.4);
    const p = customizeProfile(veston, { totalLengthCm: 91.4, name: ' Seyahat ', finish: { top: '#c08040', gloss: 0.9 } });
    expect(p.name).toBe('Seyahat');
    expect(p.scaleLengthCm).toBeCloseTo(scale, 1);
    expect(p.totalLengthCm).toBeCloseTo(91.4, 1);
    expect(p.body.bridge.x - -p.scaleLengthCm).toBeCloseTo(veston.body.bridge.x - -veston.scaleLengthCm, 0);
    expect(joinFret(p)).toBeCloseTo(joinFret(veston), 1);
    expect(p.body.soundhole.radiusCm).toBeLessThan(veston.body.soundhole.radiusCm);
    expect(p.finish).toMatchObject({ top: '#c08040', gloss: 0.9, sides: veston.finish.sides });
  });

  it('lets the headstock absorb an independent scale length', () => {
    const p = customizeProfile(veston, { totalLengthCm: 104.1, scaleLengthCm: 65 });
    expect(p.scaleLengthCm).toBe(65);
    expect(p.totalLengthCm).toBeCloseTo(104.1, 1);
    expect(p.headstock.lengthCm).toBeGreaterThan(10);
    expect(p.headstock.profile.at(-1)![0]).toBeCloseTo(p.headstock.lengthCm, 1);
  });

  it('validates sizes in Turkish', () => {
    expect(sizeProblem(104, 64.8)).toBeNull();
    expect(sizeProblem(20, 64.8)).toMatch(/Toplam boy/);
    expect(sizeProblem(104, 90)).toMatch(/Tel boyu/);
    expect(sizeProblem(80, 60)).toMatch(/çok uzun/);
  });
});
