import { describe, expect, it } from 'vitest';
import { analyzeTabImage, binarize, cleanToken, fixZeros, groupSystems, layoutToAscii, zeroLike, type Bitmap } from './tabImage';

/** Paper with drawing helpers; "digits" are solid blocks (recognition is not under test here). */
function sheet(w: number, h: number) {
  const bm: Bitmap = { width: w, height: h, data: new Uint8Array(w * h) };
  const rect = (x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bm.data[y * w + x] = v;
  };
  return { bm, rect };
}

const ROWS = [40, 64, 88, 112, 136, 160]; // spacing 24

/** One rendered-style system: six lines, bars at the given x, a glyph (8×14 block with a gap in the line) per note. */
function rendered(notes: { x: number; row: number }[], bars: number[]) {
  const { bm, rect } = sheet(800, 220);
  for (const y of ROWS) rect(20, y, 780, y + 1);
  for (const x of bars) rect(x, ROWS[0], x + 1, ROWS[5] + 1);
  for (const n of notes) {
    const y = ROWS[n.row];
    rect(n.x - 3, y - 8, n.x + 10, y + 9, 0); // gap behind the number
    rect(n.x, y - 7, n.x + 7, y + 7);
  }
  return bm;
}

describe('groupSystems', () => {
  it('takes six evenly spaced rows and skips stray ones', () => {
    expect(groupSystems([5, 40, 64, 88, 112, 136, 160]).map((s) => s.rows[0])).toEqual([40]);
    expect(groupSystems([40, 64, 88, 112, 136, 190])).toEqual([]);
  });
});

describe('analyzeTabImage', () => {
  it('finds the system, bar lines and one token per note, chords not glued together', () => {
    const chord = [0, 1, 2, 3, 4].map((row) => ({ x: 100, row }));
    const bm = rendered([...chord, { x: 200, row: 5 }, { x: 450, row: 2 }], [60, 400, 760]);
    const { systems } = analyzeTabImage(bm);
    expect(systems).toHaveLength(1);
    const s = systems[0];
    expect(Math.round(s.spacing)).toBe(24);
    expect(s.bars.map((b) => Math.floor(b))).toEqual([60, 400, 760]);
    expect(s.tokens).toHaveLength(7);
    expect(s.tokens.filter((t) => t.x0 === 100).map((t) => t.row).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('ignores a coloured-cursor-like tall stroke through a note as a bar', () => {
    const bm = rendered([{ x: 100, row: 0 }, { x: 300, row: 1 }], [60, 760]);
    const { rect } = { rect: (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bm.data[y * bm.width + x] = 1; } };
    rect(303, ROWS[0] - 10, 304, ROWS[5] + 10); // cursor through the second note
    const s = analyzeTabImage(bm).systems[0];
    expect(s.bars.map((b) => Math.floor(b))).toEqual([60, 760]);
  });

  it('drops string labels left of the first bar line', () => {
    const bm = rendered([{ x: 30, row: 0 }, { x: 30, row: 1 }, { x: 150, row: 3 }], [50, 760]);
    const s = analyzeTabImage(bm).systems[0];
    expect(s.tokens.map((t) => t.row)).toEqual([3]);
  });
});

describe('binarize', () => {
  it('inverts dark screenshots so the bright digits are ink', () => {
    const grey = new Uint8Array(100).fill(20);
    grey[55] = 230;
    const bm = binarize(grey, 10, 10);
    expect(bm.data[55]).toBe(1);
    expect(bm.data[0]).toBe(0);
  });
});

describe('layoutToAscii', () => {
  it('writes chords in one column, keeps spacing and bar lines', () => {
    const chord = [0, 1, 2].map((row) => ({ x: 100, row }));
    const bm = rendered([...chord, { x: 250, row: 4 }, { x: 450, row: 5 }], [60, 400, 760]);
    const { systems } = analyzeTabImage(bm);
    const order = systems[0].tokens.map((t) => `${t.row}`);
    const texts = order.map((r) => ({ '0': '0', '1': '1', '2': '0', '4': '3', '5': '12' })[r]!);
    const lines = layoutToAscii(systems, texts).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => l.split('|').length === 4)).toBe(true); // label| bar | bar |
    const col = (l: string, ch: string) => l.indexOf(ch, 2);
    expect(col(lines[0], '0')).toBe(col(lines[1], '1'));
    expect(col(lines[2], '0')).toBe(col(lines[0], '0'));
    expect(col(lines[4], '3')).toBeGreaterThan(col(lines[0], '0') + 2);
    expect(lines[5].split('|')[2]).toContain('12');
  });

  it('cleans OCR tokens', () => {
    expect(cleanToken('1O')).toBe('10');
    expect(cleanToken('5h7 ')).toBe('5h7');
    expect(cleanToken('(3)')).toBe('3');
  });
});


/** Draws glyph shapes on a bitmap: ring = zero, ring with a dot / slash, a 6-like and an 8-like glyph. */
function glyphSheet() {
  const { bm, rect } = sheet(200, 40);
  const ring = (x: number, y: number, w: number, h: number) => {
    rect(x, y, x + w - 1, y + 2);
    rect(x, y + h - 3, x + w - 1, y + h - 1);
    rect(x, y, x + 2, y + h - 1);
    rect(x + w - 3, y, x + w - 1, y + h - 1);
  };
  ring(10, 5, 12, 20); // 0 at x 10..21
  ring(40, 5, 12, 20);
  rect(45, 13, 46, 16); // dotted 0 (dot inside)
  ring(70, 5, 12, 20);
  rect(70, 13, 81, 14); // stacked holes: 8
  ring(100, 14, 12, 11);
  rect(100, 5, 102, 14); // 6: stem on the left, hole low
  ring(130, 5, 12, 20);
  for (let i = 0; i < 14; i++) rect(134 + Math.floor(i / 4), 8 + i, 135 + Math.floor(i / 4), 8 + i); // slashed 0
  rect(160, 5, 162, 24); // "1"
  ring(170, 5, 12, 20); // "0" → token "10"
  return bm;
}

describe('zero check by shape', () => {
  const bm = glyphSheet();
  const box = (x0: number, x1: number) => ({ x0, x1, y0: 5, y1: 24 });
  it('recognises plain, dotted and slashed zeros but not 6 or 8', () => {
    expect(zeroLike(bm, box(10, 21))).toBe(true);
    expect(zeroLike(bm, box(40, 51))).toBe(true);
    expect(zeroLike(bm, box(130, 141))).toBe(true);
    expect(zeroLike(bm, box(70, 81))).toBe(false);
    expect(zeroLike(bm, box(100, 111))).toBe(false);
  });
  it('fixes misread zeros in tokens, leaves other digits alone', () => {
    expect(fixZeros(bm, box(40, 51), '9')).toBe('0');
    expect(fixZeros(bm, box(40, 51), '')).toBe('0');
    expect(fixZeros(bm, box(160, 181), '16')).toBe('10');
    expect(fixZeros(bm, box(70, 81), '8')).toBe('8');
    expect(fixZeros(bm, box(100, 111), '6')).toBe('6');
  });
});

describe('pull-off letter', () => {
  it('turns a low middle glyph between digits into p', async () => {
    const { fixPullOff } = await import('./tabImage');
    const { bm, rect } = sheet(80, 40);
    rect(5, 5, 14, 24); // digit
    rect(20, 12, 28, 30); // p: starts low, descends
    rect(34, 5, 43, 24); // digit
    expect(fixPullOff(bm, { x0: 5, x1: 43, y0: 5, y1: 30 }, '795')).toBe('7p5');
    rect(20, 5, 28, 24); // same height as the digits → keep
    expect(fixPullOff(bm, { x0: 5, x1: 43, y0: 5, y1: 30 }, '7h5')).toBe('7h5');
  });
});
