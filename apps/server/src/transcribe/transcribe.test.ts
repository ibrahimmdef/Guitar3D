import { describe, expect, it } from 'vitest';
import { AUTO_TEX_TAG, fingerPitches, readAutoTabInfo } from '@guitar3d/shared';
import { chooseDownbeat, fixedGrid, quantize, toBars, trackedGrid, type QNote, type RawNote } from './grid.js';
import { detectTuning, lowestPlayed, suggestCapo, TUNING_DEFS, tuningLabel } from './tuning.js';
import { alignedValue, buildAlphaTex, groupEvents, placeEvents, renderTrack, restTokens, splitLeadRhythm, texPitch } from './tab.js';
import { buildAutoTab } from './index.js';
import { cleanNotes } from './clean.js';

const STD = TUNING_DEFS[0].midi;
const note = (start: number, pitch: number, len = 0.2, conf = 0.8): RawNote => ({ start, end: start + len, pitch, conf });
const q = (slot: number, pitch: number, len = 2, conf = 0.8): QNote => ({ slot, len, pitch, conf });

describe('beat grid and quantisation', () => {
  it('snaps onsets to the nearest sixteenth on a fixed tempo', () => {
    const g = fixedGrid(120, 1); // a beat every 0.5 s from t = 1 s
    const out = quantize([note(1.0, 60), note(1.13, 62), note(1.49, 64, 0.5), note(1.74, 65)], g);
    expect(out.map((n) => n.slot)).toEqual([0, 1, 4, 6]);
    expect(out[2].len).toBe(4); // 0.5 s = one beat = four sixteenths
    expect(g.tempo).toBe(120);
  });

  it('follows tracked beats that drift and extrapolates outside them', () => {
    const g = trackedGrid([1, 1.5, 2.1, 2.6], 999);
    expect(g.toBeat(1.8)).toBeCloseTo(1.5, 5); // halfway between the 2nd and 3rd beat
    expect(g.toBeat(0.5)).toBeCloseTo(-1, 5);
    expect(g.toBeat(3.1)).toBeCloseTo(4, 5);
    expect(g.tempo).toBe(120);
    expect(trackedGrid([], 90).tempo).toBe(90);
  });

  it('merges the same pitch starting in the same slot', () => {
    const out = quantize([note(0, 60, 0.1, 0.3), note(0.02, 60, 0.6, 0.9)], fixedGrid(120));
    expect(out).toEqual([{ slot: 0, len: 5, pitch: 60, conf: 0.9 }]);
  });

  it('finds the downbeat from strong low notes and moves slots to bar lines', () => {
    // bass notes on grid beats 1 and 5 (phase 1), melody notes everywhere
    const notes = [q(4, 40), q(8, 64), q(12, 65), q(20, 40), q(24, 67), q(6, 66), q(14, 62)];
    expect(chooseDownbeat(notes)).toBe(1);
    const barred = toBars(notes, 1);
    expect(Math.min(...barred.map((n) => n.slot))).toBe(0);
    expect(barred.find((n) => n.pitch === 40)!.slot % 16).toBe(0);
  });

  it('with a count-in keeps beat 0 as the downbeat and drops what came before', () => {
    const barred = toBars([q(-8, 60), q(-1, 62), q(3, 64), q(20, 65)], 0, true);
    expect(barred.map((n) => [n.slot, n.pitch])).toEqual([[0, 62], [3, 64], [20, 65]]);
  });
});

describe('cleanNotes', () => {
  it('drops the overtone ghost of a single note but keeps octaves inside chords', () => {
    const ghost = cleanNotes([note(0, 40, 0.4, 0.7), note(0.01, 52, 0.3, 0.5), note(1, 45, 0.4, 0.7)]);
    expect(ghost.map((n) => n.pitch)).toEqual([40, 45]);
    // a real octave double stop played louder on top stays
    expect(cleanNotes([note(0, 40, 0.4, 0.5), note(0, 52, 0.4, 0.8)])).toHaveLength(2);
    // E5 power chord: E2 B2 E3 all stay
    expect(cleanNotes([note(0, 40, 0.4, 0.8), note(0.01, 47, 0.4, 0.6), note(0.02, 52, 0.4, 0.5)])).toHaveLength(3);
  });

  it('drops short weak blips under a strong ringing note', () => {
    const out = cleanNotes([note(0, 45, 1, 0.8), note(0.03, 75, 0.08, 0.3), note(0.5, 76, 0.08, 0.3)]);
    expect(out.map((n) => n.pitch)).toEqual([45, 76]);
  });
});

describe('tuning and capo', () => {
  const run = (ps: number[]) => ps.map((p) => ({ pitch: p, conf: 0.9 }));

  it('ignores a single stray low note', () => {
    expect(lowestPlayed(run([30, 45, 45, 52]))).toBe(45);
    expect(lowestPlayed([...run([40, 40, 47]), { pitch: 35, conf: 0.1 }, { pitch: 35, conf: 0.1 }])).toBe(40);
  });

  it('detects half step down, drop D and standard from the lowest note', () => {
    const riff = (low: number) => [low, low, low + 7, low + 12, low + 10, low + 7, low];
    expect(detectTuning(run(riff(40)), riff(40).map((p) => [p])).id).toBe('standard');
    expect(detectTuning(run(riff(39)), riff(39).map((p) => [p])).id).toBe('half-down');
    // D power chords on the low strings: one-finger shapes in drop D
    const drop = [[38, 45, 50], [38, 45, 50], [43, 50, 55], [41, 48, 53]];
    expect(detectTuning(run(drop.flat()), drop).id).toBe('drop-d');
    expect(tuningLabel(TUNING_DEFS[1])).toBe('Eb standard (½ step down)');
    expect(tuningLabel(TUNING_DEFS[0], -32, 2)).toBe('E standard · about 32 cents flat · capo 2');
  });

  it('suggests a capo only when it makes the part clearly easier', () => {
    // open-position E minor pentatonic: no capo
    const open = [40, 43, 45, 47, 50, 52, 55, 57].map((p) => [p]);
    expect(suggestCapo(run(open.flat()), open, STD)).toBe(0);
    // F major barre-ish chords (F, Bb, C) → capo 1 turns them into open E, A, B shapes
    const barre = [
      [41, 48, 53, 57, 60, 65], [46, 53, 58, 62, 65], [48, 55, 60, 64, 67],
      [41, 48, 53, 57, 60, 65], [46, 53, 58, 62, 65], [48, 55, 60, 64, 67],
    ];
    expect(suggestCapo(run(barre.flat()), barre, STD)).toBeGreaterThan(0);
    // a note on the open low E rules any capo out
    expect(suggestCapo(run([...barre.flat(), 40, 40]), [...barre, [40], [40]], STD)).toBe(0);
  });
});

describe('fret assignment', () => {
  it('keeps a scale run in one position instead of jumping', () => {
    // A minor pentatonic box at the 5th fret
    const line = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69].map((p) => [p]);
    const r = fingerPitches(line, STD);
    const frets = r.beats.map((b) => b[0]!.fret).filter((f) => f > 0);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
    r.beats.forEach((b, i) => expect(STD[b[0]!.string - 1] + b[0]!.fret).toBe(line[i][0]));
  });

  it('plays chords on separate strings inside a five-fret box', () => {
    const r = fingerPitches([[48, 52, 55, 60, 64], [43, 47, 50, 55, 59, 67]], STD);
    for (const b of r.beats) {
      expect(b.every(Boolean)).toBe(true);
      expect(new Set(b.map((p) => p!.string)).size).toBe(b.length);
      const fr = b.map((p) => p!.fret).filter((f) => f > 0);
      expect(Math.max(...fr) - Math.min(...fr)).toBeLessThanOrEqual(4);
    }
    // the C chord lands on the open C shape (3rd fret on the A string)
    expect(r.beats[0][0]).toMatchObject({ string: 5, fret: 3 });
  });

  it('drops notes that do not fit on the neck', () => {
    const r = fingerPitches([[30], [52, 53, 54, 55, 56, 57, 58]], STD);
    expect(r.beats[0]).toEqual([null]);
    expect(r.beats[1].filter(Boolean).length).toBeLessThanOrEqual(6);
  });
});

describe('lead / rhythm split', () => {
  it('sends 3+ simultaneous notes to rhythm and the rest to lead', () => {
    const events = groupEvents([q(0, 40), q(0, 47), q(0, 52), q(4, 64), q(6, 62), q(6, 67), q(8, 60), q(8, 60)]);
    expect(events.map((e) => e.notes.length)).toEqual([3, 1, 2, 1]);
    const { lead, rhythm } = splitLeadRhythm(events);
    expect(rhythm.map((e) => e.slot)).toEqual([0]);
    expect(lead.map((e) => e.slot)).toEqual([4, 6, 8]);
  });
});

describe('alphaTex output', () => {
  it('writes aligned note values and rests', () => {
    expect(alignedValue(0, 3)).toBe(2);
    expect(alignedValue(4, 16)).toBe(4);
    expect(alignedValue(8, 8)).toBe(8);
    expect(restTokens(1, 15)).toEqual(['r.16', 'r.8', 'r.4', 'r.2']);
    expect(texPitch(64)).toBe('e4');
    expect(texPitch(39)).toBe('d#2');
  });

  it('renders bars, chords and low-confidence positions', () => {
    const placed = placeEvents(groupEvents([q(0, 45, 4), q(4, 48, 4, 0.2), q(8, 52, 8), q(16, 40, 16), q(16, 47, 16), q(16, 52, 16)]), STD).events;
    const r = renderTrack(placed, 2);
    expect(r.bars).toHaveLength(2);
    expect(r.bars[0]).toBe('0.5.4 3.5.4 2.4.2');
    expect(r.bars[1]).toMatch(/^\(\d+\.\d \d+\.\d \d+\.\d\)\.1$/);
    expect(r.low).toEqual([[0, 1, 5]]);
    expect(r.notes).toBe(6);
  });

  it('builds a two-track tab with an info header the player can read', () => {
    const lead = placeEvents(groupEvents([q(0, 64, 4, 0.3), q(4, 67, 4)]), STD).events;
    const rhythm = placeEvents(groupEvents([q(0, 40, 16), q(0, 47, 16), q(0, 52, 16)]), STD).events;
    const { tex, info } = buildAlphaTex({
      title: 'Song "X" (auto)', tempo: 96, tuning: STD, capo: 2, detected: 'E standard · capo 2',
      parts: [{ name: 'Lead / riff', events: lead }, { name: 'Rhythm', events: rhythm }],
    });
    expect(tex.startsWith(AUTO_TEX_TAG)).toBe(true);
    expect(readAutoTabInfo(tex)).toEqual(info);
    expect(info.low).toEqual([[0, 0, 0, lead[0].notes[0].string]]);
    expect(tex).toContain('\\title "Song \\"X\\" (auto)"');
    expect(tex).toContain('\\track "Lead / riff"');
    expect(tex).toContain('\\track "Rhythm"');
    expect(tex).toContain('\\staff {score tabs}');
    expect(tex).toContain('\\tuning (e4 b3 g3 d3 a2 e2)');
    expect(tex).toContain('\\capo 2');
    expect(readAutoTabInfo('\\title "x"')).toBeNull();
  });
});

describe('buildAutoTab', () => {
  it('turns raw notes into a tab with summary (fixed tempo recording)', () => {
    // count-in of 4 beats at 100 BPM (2.4 s), then an Eb-tuned riff: Eb2 Eb2 Bb2 Eb3 + a chord
    const spb = 0.6;
    const t0 = 2.4;
    const raw = {
      duration: 10,
      notes: [
        note(t0, 39, 0.25), note(t0 + spb, 39, 0.25), note(t0 + 2 * spb, 46, 0.25, 0.25), note(t0 + 3 * spb, 51, 0.25),
        note(t0 + 4 * spb, 39, 1.2), note(t0 + 4 * spb, 46, 1.2), note(t0 + 4 * spb, 51, 1.2),
        note(0.5, 70, 0.1), // noise during the count-in
      ],
      cents: -3,
    };
    const auto = buildAutoTab(raw, { title: 'Riff (auto)', bpm: 100, offset: t0 });
    expect(auto.summary).toMatchObject({ tuningId: 'half-down', detected: 'Eb standard (½ step down)', capo: 0, tempo: 100, bars: 2, notes: 7, lowConfidence: 1, tracks: ['Lead / riff', 'Rhythm'] });
    expect(auto.tex).toContain('\\tuning (d#4 a#3 f#3 c#3 g#2 d#2)');
    // in Eb tuning the riff is played like in E: open low string twice, then the power-chord shape
    expect(auto.tex).toContain('0.6.8 r.8 0.6.8 r.8 2.5.8 r.8 2.4.8 r.8 |');
    expect(auto.tex).toContain('(2.4 2.5 0.6).2 r.2 |');
    expect(auto.info.low).toEqual([[0, 0, 4, 5]]);
  });

  it('uses tracked beats when no tempo is given and rejects silence', () => {
    const beats = Array.from({ length: 16 }, (_, i) => 0.3 + i * 0.5);
    const raw = { duration: 8, beats, tempo: 120, notes: beats.slice(0, 8).map((b, i) => note(b + 0.01, [40, 43, 45, 47][i % 4])) };
    const auto = buildAutoTab(raw, { title: 'x' });
    expect(auto.summary.tempo).toBe(120);
    expect(auto.summary.tracks).toEqual(['Lead / riff']);
    expect(auto.summary.notes).toBe(8);
    expect(() => buildAutoTab({ duration: 3, notes: [] }, { title: 'x' })).toThrow(/No guitar notes/);
  });
});
