import { describe, expect, it } from 'vitest';
import {
  addBar, barFill, clearFret, deleteBar, deleteBeat, insertBeat, newDoc, parseAlphaTex, parseTexPitch, pasteBar, setDuration, setFret, stepLeft, stepRight,
  toAlphaTex, type EdDoc,
} from './tabEditor';

function riff(): EdDoc {
  let d = newDoc('Deneme "riff"');
  d = { ...d, tempo: 104, bars: [{ beats: [{ duration: 8, notes: [{ string: 6, fret: 0 }] }, { duration: 8, notes: [{ string: 6, fret: 3 }] }, { duration: 4, notes: [] }, { duration: 2, notes: [{ string: 3, fret: 0 }, { string: 2, fret: 1 }, { string: 4, fret: 2 }] }] }] };
  return addBar(d, 0, { beats: [{ duration: 1, notes: [{ string: 1, fret: 12 }] }] });
}

describe('alphaTex round trip', () => {
  it('writes the editor model as alphaTex', () => {
    const tex = toAlphaTex(riff());
    expect(tex).toContain('\\title "Deneme riff"');
    expect(tex).toContain('\\tempo 104');
    expect(tex).toContain('\\tuning e4 b3 g3 d3 a2 e2');
    expect(tex).toContain('\\ts 4 4 0.6.8 3.6.8 r.4 (1.2 0.3 2.4).2 |');
    expect(tex).toContain('12.1.1 |');
  });
  it('reads back exactly what it wrote', () => {
    const d = riff();
    const back = parseAlphaTex(toAlphaTex(d));
    expect(back.tempo).toBe(d.tempo);
    expect(back.beatsPerBar).toBe(4);
    expect(back.tuning).toEqual(d.tuning);
    expect(back.bars).toEqual(d.bars.map((b) => ({ beats: b.beats.map((x) => ({ ...x, notes: [...x.notes].sort((p, q) => p.string - q.string) })) })));
    expect(toAlphaTex(back)).toBe(toAlphaTex(d).replace('Deneme "riff"', 'Deneme riff'));
  });
  it('reads hand-written alphaTex with :duration, effects and drop D', () => {
    const d = parseAlphaTex('\\title "El yazısı"\n\\tempo 70\n.\n\\tuning e4 b3 g3 d3 a2 d2\n:8 0.6 2.5{h} 3.5 r | :4 (0.1 0.2) 5.3.16 r\n');
    expect(d.title).toBe('El yazısı');
    expect(d.tuning[5]).toBe(38);
    expect(d.bars).toHaveLength(2);
    expect(d.bars[0].beats.map((b) => b.duration)).toEqual([8, 8, 8, 8]);
    expect(d.bars[1].beats[0]).toEqual({ duration: 4, notes: [{ fret: 0, string: 1 }, { fret: 0, string: 2 }] });
    expect(d.bars[1].beats[1]).toEqual({ duration: 16, notes: [{ fret: 5, string: 3 }] });
    expect(d.bars[1].beats[2]).toEqual({ duration: 16, notes: [] });
  });
  it('rejects text without notes and parses pitches', () => {
    expect(() => parseAlphaTex('\\title "boş"\n.\n')).toThrow();
    expect(parseTexPitch('c#4')).toBe(61);
    expect(parseTexPitch('bb3')).toBe(58);
    expect(parseTexPitch('x')).toBeNull();
  });
});

describe('editing', () => {
  it('sets, replaces and clears frets per string', () => {
    let d = newDoc();
    const c = { bar: 0, beat: 0, string: 2 };
    d = setFret(d, c, 3);
    d = setFret(d, { ...c, string: 5 }, 0);
    d = setFret(d, c, 5);
    expect(d.bars[0].beats[0].notes).toEqual([{ string: 2, fret: 5 }, { string: 5, fret: 0 }]);
    d = clearFret(d, c);
    expect(d.bars[0].beats[0].notes).toEqual([{ string: 5, fret: 0 }]);
  });
  it('grows bars as the cursor moves right and tracks bar fill', () => {
    let d = newDoc();
    let c = { bar: 0, beat: 0, string: 1 };
    for (let i = 0; i < 4; i++) ({ doc: d, cursor: c } = stepRight(d, c, true));
    expect(d.bars).toHaveLength(2);
    expect(c).toEqual({ bar: 1, beat: 0, string: 1 });
    expect(barFill(d, d.bars[0])).toBe('full');
    expect(barFill(d, d.bars[1])).toBe('short');
    expect(stepLeft(d, c)).toEqual({ bar: 0, beat: 3, string: 1 });
    d = setDuration(d, { bar: 0, beat: 0 }, 2);
    expect(barFill(d, d.bars[0])).toBe('over');
  });
  it('inserts and deletes beats and bars, copies bars', () => {
    let d = setFret(newDoc(), { bar: 0, beat: 0, string: 1 }, 7);
    d = insertBeat(d, { bar: 0, beat: 0 });
    expect(d.bars[0].beats).toHaveLength(2);
    d = deleteBeat(d, { bar: 0, beat: 1 });
    expect(d.bars[0].beats).toHaveLength(1);
    d = addBar(d);
    d = pasteBar(d, 1, d.bars[0]);
    expect(d.bars[1]).toEqual(d.bars[0]);
    expect(d.bars[1]).not.toBe(d.bars[0]);
    d = deleteBar(d, 0);
    expect(d.bars).toHaveLength(1);
    expect(deleteBar(d, 0).bars).toHaveLength(1);
  });
});
