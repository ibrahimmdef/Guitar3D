import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GuitarProfile } from '@guitar3d/shared';
import {
  acousticOutline, buildTemplateProfile, closedSpline, headstockProfile, isClockwise, isSimplePolygon, pointInPolygon,
  solidBodyOutline, templateIndexEntry, TEMPLATE_SPECS,
} from './templates';
import { bodyWidthAt, fretboardEndX, fretX, modelledLength, neckJoinX, outlineXRange } from './geometry';

const dir = new URL('../../public/guitar/templates/', import.meta.url);
const readJson = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(name, dir)), 'utf8')) as unknown;

describe('outline generators', () => {
  const spec = TEMPLATE_SPECS[0].body as Parameters<typeof acousticOutline>[0];

  it('makes a closed, simple, clockwise acoustic outline with the requested bouts', () => {
    const o = acousticOutline(spec, -36);
    expect(isClockwise(o)).toBe(true);
    expect(isSimplePolygon(o)).toBe(true);
    const [x0, x1] = outlineXRange(o);
    expect(x1).toBeCloseTo(-36, 1);
    expect(x1 - x0).toBeCloseTo(spec.lengthCm, 0);
    expect(bodyWidthAt(o, -36 - spec.lowerT * spec.lengthCm)).toBeCloseTo(spec.lowerCm, 0);
    expect(bodyWidthAt(o, -36 - spec.waistT * spec.lengthCm)).toBeCloseTo(spec.waistCm, 0);
    // symmetric without a cutaway
    expect(Math.max(...o.map(([, y]) => y))).toBeCloseTo(-Math.min(...o.map(([, y]) => y)), 1);
  });

  it('cuts away the treble side only', () => {
    const o = acousticOutline({ ...spec, cutaway: { heelHalfCm: 3.3, lengthT: 0.2 } }, -36);
    expect(isSimplePolygon(o)).toBe(true);
    const x = -36 - 0.08 * spec.lengthCm;
    const ys = o.filter(([px]) => Math.abs(px - x) < 1.2).map(([, y]) => y);
    expect(-Math.min(...ys)).toBeLessThan(Math.max(...ys) - 3);
  });

  it('solid body: simple, clockwise, horns reach past the neck pocket', () => {
    const o = solidBodyOutline(-39);
    expect(isClockwise(o)).toBe(true);
    expect(isSimplePolygon(o)).toBe(true);
    expect(outlineXRange(o)[1]).toBeGreaterThan(-39 + 3);
    expect(neckJoinX(o)).toBeCloseTo(-39, 0);
  });

  it('closed spline passes through its control points', () => {
    const ctrl: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const s = closedSpline(ctrl, 8);
    for (const c of ctrl) expect(s.some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < 0.02)).toBe(true);
  });

  it('headstock profile flares from the nut', () => {
    const h = headstockProfile(18, 2.2, 3.6, 4);
    expect(h[0]).toEqual([0, 2.2]);
    expect(h[h.length - 1][0]).toBe(18);
    expect(Math.max(...h.map(([, w]) => w))).toBeCloseTo(3.6);
  });
});

describe('templates', () => {
  const index = readJson('index.json') as ReturnType<typeof templateIndexEntry>[];

  it('index lists every template with Turkish names', () => {
    expect(index.map((t) => t.id)).toEqual(TEMPLATE_SPECS.map((s) => s.id));
    for (const t of index) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.profileUrl).toBe(`/guitar/templates/${t.id}.profile.json`);
    }
  });

  for (const spec of TEMPLATE_SPECS) {
    describe(spec.id, () => {
      const p = readJson(`${spec.id}.profile.json`) as GuitarProfile;
      const L = p.scaleLengthCm;

      it('committed JSON matches the generator', () => {
        expect(p).toEqual(JSON.parse(JSON.stringify(buildTemplateProfile(spec))));
      });

      it('has consistent dimensions', () => {
        expect(Math.abs(modelledLength(p) - p.totalLengthCm)).toBeLessThan(0.2);
        expect(p.totalLengthCm).toBeGreaterThan(90);
        expect(p.totalLengthCm).toBeLessThan(110);
        expect(p.stringSpacingNutCm).toBeLessThan(p.nutWidthCm - 0.5);
        expect(p.stringSpacingSaddleCm).toBeGreaterThan(p.stringSpacingNutCm);
        expect(p.endWidthCm).toBeGreaterThan(p.nutWidthCm);
        expect(isClockwise(p.body.outline)).toBe(true);
        expect(isSimplePolygon(p.body.outline)).toBe(true);
        // the neck meets the body at the join fret
        expect(neckJoinX(p.body.outline)).toBeCloseTo(fretX(L, p.bodyJoinFret), 0);
        // the bridge sits on the body, behind the saddle line
        const b = p.body.bridge;
        expect(pointInPolygon([b.x, b.widthCm / 2], p.body.outline)).toBe(true);
        expect(pointInPolygon([b.x, -b.widthCm / 2], p.body.outline)).toBe(true);
        expect(b.x + b.lengthCm / 2).toBeGreaterThan(-L - 0.3);
        // the fretboard ends on the body
        expect(pointInPolygon([fretboardEndX(p), 0], p.body.outline)).toBe(true);
        const h = p.headstock;
        expect([...h.tunersLowE, ...h.tunersHighE].every((d) => d > 2 && d < h.lengthCm - 1)).toBe(true);
      });

      it('soundhole and pickguard fit', () => {
        const sh = p.body.soundhole;
        if (p.kind === 'electric') {
          expect(sh.radiusCm).toBe(0);
          expect(p.electric?.pickups).toBe(2);
          expect(p.fretCount).toBe(22);
          return;
        }
        expect(sh.x + sh.radiusCm).toBeLessThan(fretboardEndX(p));
        expect(sh.x - sh.radiusCm).toBeGreaterThan(p.body.bridge.x + p.body.bridge.lengthCm / 2 + 3);
        expect(bodyWidthAt(p.body.outline, sh.x)).toBeGreaterThan(sh.radiusCm * 2 + 6);
        for (const pt of p.body.pickguard ?? []) expect(pointInPolygon(pt, p.body.outline)).toBe(true);
      });
    });
  }

  it('classical has the classical layout', () => {
    const p = readJson('classical.profile.json') as GuitarProfile;
    expect(p).toMatchObject({ kind: 'classical', strings: 'nylon', nutWidthCm: 5.2, bodyJoinFret: 12, fretCount: 19, scaleLengthCm: 65 });
    expect(p.headstock.slotted).toBe(true);
    expect(p.body.bridgeStyle).toBe('tieblock');
    expect(p.body.pickguard).toBeUndefined();
  });
});
