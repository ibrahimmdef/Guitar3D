import { describe, expect, it } from 'vitest';
import { importer, Settings, type model } from '@coderline/alphatab';
import { readAutoTabInfo } from '@guitar3d/shared';
import { strumFromScore } from './strumScore';
import { chordVoicing, strokeOrder } from '../music/strumVoicing';
import { stepSeconds } from '../audio/strumPractice';
import { strumPosAt } from '../screens/song/SongScreen';

const parse = (tex: string): model.Score => {
  const imp = new importer.AlphaTexImporter();
  imp.initFromString(tex, new Settings());
  return imp.readScore();
};

const G = '(3.1 0.2 0.3 0.4 2.5 3.6)';
const C = '(0.1 1.2 0.3 2.4 3.5)';
/** "D - D U - U D U" with pick strokes, the way the transcriber writes it. */
const strummedBar = (ch: string, name: string) => `${ch}.4{sd ch "${name}"} ${ch}.8{sd} ${ch}.8{su} r.8 ${ch}.8{su} ${ch}.8{sd} ${ch}.8{su}`;

describe('strum pattern from a score', () => {
  it('reads pick strokes, chord names, dead notes and accents written in alphaTex', () => {
    const tex = [
      '\\title "s"',
      '\\tempo 90',
      '.',
      '\\track "Lead"',
      '0.1.1 |',
      '0.1.1 |',
      '0.1.1 |',
      '\\track "Rhythm"',
      `${strummedBar(G, 'G')} |`,
      `${strummedBar(C, 'C')} |`,
      `(3.1{ac} 0.2{ac}).4{sd ch "G"} (3.1{x} 0.2{x}).8{sd} ${G}.8{su} r.8 ${G}.8{su} (3.1{x} 0.2{x}).8{sd} ${G}.8{su} |`,
    ].join('\n');
    const score = parse(tex);
    const beat = score.tracks[1].staves[0].bars[0].voices[0].beats[0];
    expect(beat.pickStroke).toBe(2);
    expect(beat.chord?.name).toBe('G');
    expect(score.tracks[1].staves[0].bars[2].voices[0].beats[1].notes.every((n) => n.isDead)).toBe(true);

    const r = strumFromScore(score)!;
    expect(r.trackIndex).toBe(1);
    const a = r.analysis;
    expect(a.method).toBe('score');
    expect(a.resolution).toBe(8);
    expect(a.bars.map((b) => b.s)).toEqual(['D---D-U---U-D-U-', 'D---D-U---U-D-U-', 'D---X-U---U-X-U-']);
    expect(a.bars.map((b) => b.c[0])).toEqual(['G', 'C', 'G']);
    expect(a.bars[2].a).toEqual([0]);
    expect(a.pattern!.text).toBe('D - D U - U D U');
    expect(a.pattern!.starts).toEqual([0, 1]);
  });

  it('is null for tabs without strokes', () => {
    expect(strumFromScore(parse('\\title "n"\n.\n(0.1 0.2 0.3).4 (0.1 0.2 0.3).4 r.2 |'))).toBeNull();
  });

  it('reads Guitar Pro style brushes too', () => {
    const score = parse(`\\title "b"\n.\n${G}.4{bd} ${G}.4{bu} ${G}.4{bd} ${G}.4{bu} |\n${G}.4{bd} ${G}.4{bu} ${G}.4{bd} ${G}.4{bu} |`);
    const a = strumFromScore(score)!.analysis;
    expect(a.bars[0].s).toBe('D---U---D---U---');
    expect(a.pattern!.text).toBe('D - U - D - U -');
  });

  it('the transcriber header round-trips the analysis', () => {
    expect(readAutoTabInfo('// guitar3d-auto {"v":1,"detected":"","notes":1,"low":[],"strum":{"v":1,"tempo":90,"resolution":8,"bars":[],"pattern":null,"method":"grid","strums":0}}\n')!.strum!.tempo).toBe(90);
  });
});

describe('practice sound and song sync', () => {
  it('voices chord symbols like a guitar', () => {
    expect(chordVoicing('G')).toEqual([43, 47, 50, 55, 59, 62]);
    expect(chordVoicing('Am')![0]).toBe(45);
    expect(chordVoicing('C/E')![0]).toBe(40);
    expect(chordVoicing('nonsense')).toBeNull();
    expect(strokeOrder([40, 45, 50, 55, 59, 64], 'U')).toEqual([64, 59, 55, 50]);
    expect(stepSeconds(60, 8)).toBe(0.5);
    expect(stepSeconds(120, 16)).toBe(0.125);
  });

  it('maps song time to bar and sixteenth', () => {
    const bt = [1, 3, 5];
    expect(strumPosAt(bt, 0.5)).toBeNull();
    expect(strumPosAt(bt, 1)).toEqual({ bar: 0, slot: 0 });
    expect(strumPosAt(bt, 2.5)).toEqual({ bar: 0, slot: 12 });
    expect(strumPosAt(bt, 4.99)).toEqual({ bar: 1, slot: 15 });
    expect(strumPosAt(bt, 5)).toBeNull();
  });
});
