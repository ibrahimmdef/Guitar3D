import { importer, LogLevel, Settings } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { DEMO_TEX } from '../demoTab';
import { listBuiltinLessons, loadBuiltinLesson } from '../tabs/builtin';
import { analyze, analyzeBar, chordComfort, ISSUE_LABELS, reach, type BarReport, type IssueKind } from './analyze';
import { beatQuarters, toSimpleBars, type SimpleBar, type SimpleBeat, type SimpleNote } from './model';

const n = (string: number, fret: number, extra: Partial<SimpleNote> = {}): SimpleNote => ({
  string, fret, hammer: false, slide: false, bend: false, palmMute: false, tied: false, ...extra,
});
/** Bar of equally long beats; each beat is a list of notes (empty = rest). */
const bar = (index: number, beats: SimpleNote[][], quarters = 0.5, tempo = 80): SimpleBar => ({
  index, tempo, beats: beats.map((notes) => ({ quarters, notes })),
});
const kinds = (r: BarReport) => r.issues.map((i) => i.kind);
const issue = (r: BarReport, kind: IssueKind) => r.issues.find((i) => i.kind === kind);
const one = (beats: SimpleNote[][], quarters = 0.5, tempo = 80) => analyzeBar(bar(0, beats, quarters, tempo));

const C = [n(5, 3), n(4, 2), n(3, 0), n(2, 1), n(1, 0)];
const G = [n(6, 3), n(5, 2), n(4, 0), n(3, 0), n(2, 0), n(1, 3)];
const Am = [n(5, 0), n(4, 2), n(3, 2), n(2, 1), n(1, 0)];
const F_BARRE = [n(6, 1), n(5, 3), n(4, 3), n(3, 2), n(2, 1), n(1, 1)];
const F_SMALL = [n(4, 3), n(3, 2), n(2, 1), n(1, 1)];
const A = [n(5, 0), n(4, 2), n(3, 2), n(2, 2), n(1, 0)];
const BM = [n(5, 2), n(4, 4), n(3, 4), n(2, 3), n(1, 2)];

function fromTex(tex: string) {
  const s = new Settings();
  s.core.logLevel = LogLevel.None;
  const score = importer.ScoreLoader.loadAlphaTex(tex, s);
  return toSimpleBars(score.tracks[0], score.tempo);
}
const HEADER = '\\tempo 120\n.\n\\track "G"\n\\staff {tabs}\n\\tuning e4 b3 g3 d3 a2 e2\n';

describe('beatQuarters', () => {
  it('handles plain, dotted and triplet durations', () => {
    expect(beatQuarters(4, 0)).toBe(1);
    expect(beatQuarters(8, 1)).toBe(0.75);
    expect(beatQuarters(4, 2)).toBe(1.75);
    expect(beatQuarters(8, 0, 3, 2)).toBeCloseTo(1 / 3);
  });
});

describe('easy bars stay quiet', () => {
  it('gives an open-string bar difficulty 1 and no tips', () => {
    const r = one([[n(6, 0)], [n(5, 0)], [n(4, 0)], [n(3, 0)]], 1, 70);
    expect(r.difficulty).toBe(1);
    expect(r.issues).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.handPosition).toBeNull();
    expect(r.fretSpan).toBe(0);
  });

  it('does not complain about slow string skips or open strings far from the hand', () => {
    const r = one([[n(6, 0)], [n(1, 0)], [n(5, 0)], [n(2, 0)]], 1, 70);
    expect(r.issues).toEqual([]);
    expect(r.stringSkips).toBe(3);
    // Fretted notes high up mixed with open strings: the open strings neither shift nor stretch the hand.
    const mixed = one([[n(1, 9)], [n(1, 0)], [n(1, 10)], [n(2, 0)], [n(1, 12)], [n(1, 0)], [n(1, 10)], [n(1, 9)]]);
    expect(kinds(mixed)).toEqual([]);
    expect(mixed.handPosition).toBe(9);
  });

  it('keeps a one-finger-per-fret chromatic bar at difficulty 1 with no tips', () => {
    const r = one([1, 2, 3, 4, 1, 2, 3, 4].map((f, i) => [n(i < 4 ? 6 : 5, f)]), 0.5, 66);
    expect(r.difficulty).toBe(1);
    expect(r.issues).toEqual([]);
    expect(r.handPosition).toBe(1);
  });

  it('keeps a slow first-position melody and an empty bar at difficulty 1', () => {
    const melody = one([[n(1, 0)], [n(1, 0)], [n(1, 1)], [n(1, 3)]], 1, 96);
    expect(melody.difficulty).toBe(1);
    expect(melody.issues).toEqual([]);
    const empty = analyzeBar({ index: 0, tempo: 100, beats: [{ quarters: 4, notes: [] }] });
    expect(empty).toMatchObject({ difficulty: 1, issues: [], notesPerSecond: 0 });
    expect(analyzeBar({ index: 0, tempo: 100, beats: [] }).difficulty).toBe(1);
  });
});

describe('hand position and shifts', () => {
  it('uses a wider reach high on the neck and a narrower chord span near the nut', () => {
    expect(reach(1)).toBe(3);
    expect(reach(12)).toBe(4);
    expect(chordComfort(1)).toBeLessThan(chordComfort(5));
    expect(chordComfort(5)).toBeLessThan(chordComfort(12));
  });

  it('places the hand by looking ahead instead of following the first note', () => {
    // 3 then 1: the hand is in first position from the start, no shift.
    const r = one([[n(1, 3)], [n(1, 1)], [n(2, 3)], [n(2, 1)]]);
    expect(r.handPosition).toBe(1);
    expect(r.shiftCount).toBe(0);
    expect(kinds(r)).not.toContain('shift');
  });

  it('detects a big position shift and says where to land', () => {
    const r = one([[n(1, 12)], [n(1, 10)], [n(4, 3)], [n(4, 5)]]);
    const shift = issue(r, 'shift')!;
    expect(shift).toBeDefined();
    expect(r.handPosition).toBe(10);
    expect(r.maxShift).toBe(7);
    expect(shift.detail).toContain('10. pozisyondan 3. pozisyona');
    expect(shift.detail).toContain('burguya doğru');
    expect(shift.detail).toContain('4. tel 3. perdeye işaret parmağınla');
  });

  it('measures shifts from the hand position, not from the previous note', () => {
    // 5 → 8 is three frets apart but inside one position: no shift.
    expect(kinds(one([[n(1, 5)], [n(1, 8)], [n(2, 5)], [n(2, 8)]]))).not.toContain('shift');
    // 5-7-8 then 10-12-13 on one string: one real shift of five frets.
    const r = one([[n(1, 5)], [n(1, 7)], [n(1, 8)], [n(1, 10)], [n(1, 12)], [n(1, 13)]]);
    expect(r.shiftCount).toBe(1);
    expect(r.maxShift).toBe(5);
    expect(issue(r, 'shift')!.detail).toContain('kılavuz parmak');
  });

  it('weights a rushed shift more than the same shift with time or an open string in between', () => {
    const fast = one([[n(1, 1)], [n(1, 3)], [n(1, 8)], [n(1, 10)]], 0.25, 120);
    const slow = one([[n(1, 1)], [n(1, 3)], [n(1, 8)], [n(1, 10)]], 1, 80);
    const viaOpen = one([[n(1, 1)], [n(1, 3)], [n(1, 0)], [n(1, 8)]], 0.25, 120);
    expect(issue(fast, 'shift')!.weight).toBeGreaterThan(issue(slow, 'shift')!.weight);
    expect(issue(viaOpen, 'shift')!.detail).toContain('açık tel');
    // A small shift with plenty of time is not worth a tip.
    const relaxed = one([[n(1, 5)], [n(1, 7)], [n(1, 3)]], 2, 60);
    expect(relaxed.maxShift).toBe(2);
    expect(kinds(relaxed)).not.toContain('shift');
  });

  it('sees a shift across the bar line through the previous notes', () => {
    const b = bar(1, [[n(2, 1)], [n(2, 3)]], 1);
    expect(kinds(analyzeBar(b, null))).not.toContain('shift');
    expect(kinds(analyzeBar(b, [n(2, 12)]))).toContain('shift');
    expect(analyzeBar(b, [n(2, 12)]).bar).toBe(1);
  });
});

describe('stretches', () => {
  it('flags a wide chord and names the outer fingers', () => {
    const r = one([[n(6, 3), n(5, 5), n(4, 7), n(3, 8)]], 2);
    const s = issue(r, 'stretch')!;
    expect(s.detail).toContain('3–8. perdeler');
    expect(r.fretSpan).toBe(5);
    expect(r.difficulty).toBeGreaterThanOrEqual(3);
  });

  it('treats the same span as harder near the nut than high on the neck', () => {
    const low = one([[n(6, 1), n(4, 5)]], 2);
    const mid = one([[n(6, 5), n(4, 9)]], 2);
    const high = one([[n(6, 10), n(4, 14)]], 2);
    expect(issue(low, 'stretch')!.weight).toBeGreaterThan(issue(mid, 'stretch')!.weight);
    expect(kinds(high)).not.toContain('stretch');
  });

  it('ignores open strings inside a chord', () => {
    expect(kinds(one([[n(6, 0), n(5, 7), n(4, 9), n(1, 0)]], 2))).not.toContain('stretch');
    expect(kinds(one([C], 2))).not.toContain('stretch');
  });

  it('flags a quick five-fret reach over a sliding window, but not a slow one', () => {
    const beats = [[n(2, 1)], [n(1, 3)], [n(1, 5)], [n(1, 3)], [n(1, 1)], [n(2, 1)]];
    const quick = one(beats, 0.5, 90);
    expect(issue(quick, 'stretch')!.detail).toContain('1–5. perdeler');
    expect(issue(quick, 'stretch')!.detail).toContain('serçe');
    expect(kinds(quick)).not.toContain('shift');
    expect(kinds(one(beats, 2, 60))).not.toContain('stretch');
  });
});

describe('barre', () => {
  it('detects a full barre in a strummed chord and suggests the other fingers', () => {
    const r = one([F_BARRE], 2);
    const b = issue(r, 'barre')!;
    expect(b.detail).toContain('1. perdede');
    expect(b.detail).toContain('6. telden 1. tele');
    expect(b.detail).toContain('3. tel 2. perde orta');
    expect(b.detail).toContain('5. tel 3. perde yüzük');
    expect(b.detail).toContain('4. tel 3. perde serçe');
  });

  it('detects a barre shape played as an arpeggio', () => {
    expect(kinds(one(F_BARRE.map((x) => [x])))).toContain('barre');
  });

  it('detects a barre whose finger only sounds on the outer strings (Bm)', () => {
    expect(issue(one([BM], 2), 'barre')!.detail).toContain('5. telden 1. tele');
  });

  it('calls two adjacent top strings a mini barre with a lower weight', () => {
    const mini = issue(one([F_SMALL], 2), 'barre')!;
    expect(mini.detail).toContain('Mini barre');
    expect(mini.weight).toBeLessThan(issue(one([F_BARRE], 2), 'barre')!.weight);
  });

  it('does not call open chords or three fingers on one fret a barre', () => {
    for (const chord of [C, G, Am, A]) expect(kinds(one([chord], 2))).not.toContain('barre');
    expect(kinds(one(C.map((x) => [x])))).not.toContain('barre');
    // Same fret on two outer strings with an open string between them cannot be barred.
    expect(kinds(one([[n(6, 3), n(5, 2), n(4, 0), n(3, 0), n(2, 3), n(1, 3)]], 2))).not.toContain('barre');
  });

  it('does not see a barre in a melody that revisits strings', () => {
    const run = [[n(6, 1)], [n(6, 3)], [n(5, 1)], [n(5, 3)], [n(4, 1)], [n(4, 3)], [n(3, 1)], [n(3, 3)]];
    expect(kinds(one(run))).not.toContain('barre');
  });
});

describe('chord changes', () => {
  const change = (a: SimpleNote[], b: SimpleNote[], quarters = 2) => issue(one([a, b], quarters), 'chordChange');

  it('names the chords and counts the fingers that move', () => {
    const c = change(C, G)!;
    expect(c.detail).toContain('C → G');
    expect(c.detail).toContain('3 parmak');
    expect(c.detail).toContain('6. tel 3. perde orta');
  });

  it('points out anchor fingers and scores a small change lower than a full one', () => {
    // C → Am keeps index and middle finger: only one finger moves, not worth a tip.
    expect(change(C, Am)).toBeUndefined();
    const amF = change(Am, F_SMALL)!;
    expect(amF.detail).toContain('Çapa parmak: 2. tel 1. perde');
    expect(change(C, G)!.detail).toContain('Ortak parmak yok');
  });

  it('is harder with less time', () => {
    expect(change(C, G, 0.25)!.weight).toBeGreaterThan(change(C, G, 2)!.weight);
  });

  it('ignores repeated chords and the same shape moved along the neck', () => {
    expect(change(C, C)).toBeUndefined();
    const g5 = [n(6, 3), n(5, 5), n(4, 5)];
    const a5 = [n(6, 5), n(5, 7), n(4, 7)];
    const r = one([g5, a5], 2);
    expect(kinds(r)).not.toContain('chordChange');
  });

  it('reports one chord-change issue per bar even with several changes', () => {
    const r = one([C, G, Am, F_SMALL], 1);
    expect(kinds(r).filter((k) => k === 'chordChange')).toHaveLength(1);
    expect(issue(r, 'chordChange')!.detail).toContain('3 geçiş');
  });

  it('follows arpeggiated chords across bars', () => {
    const arp = (index: number, chord: SimpleNote[]) => bar(index, [...chord, ...chord].slice(0, 8).map((x) => [x]));
    const report = analyze([arp(0, C), arp(1, G.filter((x) => x.string !== 5))]);
    expect(kinds(report.bars[0])).toEqual([]);
    expect(issue(report.bars[1], 'chordChange')!.detail).toContain('C → G');
  });
});

describe('right hand', () => {
  it('flags fast string skips with a pick direction', () => {
    const r = one(Array.from({ length: 8 }, (_, i) => [n(i % 2 ? 2 : 5, 0)]), 0.25, 120);
    const skip = issue(r, 'stringSkip')!;
    expect(r.stringSkips).toBe(7);
    expect(skip.detail).toContain('5. telden 2. tele');
    expect(skip.detail).toContain('aşağı (↓)');
    expect(skip.advice).toContain('yukarı (↑)');
  });

  it('does not count adjacent strings or legato notes as skips', () => {
    const adjacent = one(Array.from({ length: 8 }, (_, i) => [n(i % 2 ? 2 : 3, 0)]), 0.25, 120);
    expect(adjacent.stringSkips).toBe(0);
    expect(kinds(adjacent)).not.toContain('stringSkip');
  });
});

describe('speed', () => {
  it('uses the real tempo', () => {
    const sixteenths = Array.from({ length: 16 }, (_, i) => [n(1, i % 2 ? 5 : 7)]);
    const slow = one(sixteenths, 0.25, 60);
    const fast = one(sixteenths, 0.25, 120);
    expect(slow.notesPerSecond).toBeCloseTo(4);
    expect(fast.notesPerSecond).toBeCloseTo(8);
    expect(kinds(slow)).not.toContain('speed');
    const s = issue(fast, 'speed')!;
    expect(s.detail).toContain('onaltılık');
    expect(s.detail).toContain('%45');
    expect(s.detail).toContain('54 bpm');
  });

  it('counts tuplets and finds the fastest run inside a mostly slow bar', () => {
    const triplet: SimpleBeat = { quarters: beatQuarters(16, 0, 6, 4), notes: [n(1, 5)], tuplet: 6 };
    const b: SimpleBar = { index: 0, tempo: 100, beats: [{ quarters: 3, notes: [n(1, 5)] }, ...Array.from({ length: 6 }, () => triplet)] };
    const r = analyzeBar(b);
    expect(r.notesPerSecond).toBeCloseTo(7 / 2.4);
    expect(r.peakNotesPerSecond).toBeCloseTo(10);
    expect(issue(r, 'speed')!.detail).toContain('altılama');
  });

  it('does not count tied notes as played notes', () => {
    const r = one([[n(1, 5)], [n(1, 5, { tied: true })], [n(1, 7)], [n(1, 7, { tied: true })]], 1, 60);
    expect(r.notesPerSecond).toBeCloseTo(0.5);
  });
});

describe('techniques', () => {
  it('tells hammer-ons from pull-offs by the next note on the string', () => {
    const r = one([[n(3, 5, { hammer: true })], [n(3, 7)], [n(3, 7, { hammer: true })], [n(3, 5)]], 1);
    expect(issue(r, 'hammer')!.detail).toContain('3. telde 5. perde → 7. perde');
    expect(issue(r, 'pull')!.detail).toContain('3. telde 7. perde → 5. perde');
  });

  it('describes legato to and from open strings and counts repeats', () => {
    const r = one([[n(1, 0, { hammer: true })], [n(1, 2)], [n(2, 0, { hammer: true })], [n(2, 1)]], 1);
    expect(issue(r, 'hammer')!.detail).toContain('açık tel → 2. perde');
    expect(issue(r, 'hammer')!.detail).toContain('2 kez');
    expect(kinds(r)).not.toContain('pull');
    const pull = one([[n(1, 3, { hammer: true, pull: true })], [n(1, 0)]], 1);
    expect(issue(pull, 'pull')!.detail).toContain('3. perde → açık tel');
  });

  it('reports slide, bend, palm mute, harmonic and dead notes once each', () => {
    const r = one([
      [n(3, 7, { slide: true })], [n(3, 9)],
      [n(2, 8, { bend: true })], [n(6, 0, { palmMute: true })], [n(6, 0, { palmMute: true })],
      [n(1, 12, { harmonic: true })], [n(4, 0, { dead: true })], [n(4, 0, { dead: true })],
    ]);
    for (const k of ['slide', 'bend', 'palmMute', 'harmonic', 'deadNote'] as const) {
      expect(kinds(r).filter((x) => x === k), k).toHaveLength(1);
    }
    expect(issue(r, 'bend')!.detail).toContain('2. tel 8. perde');
    expect(issue(r, 'palmMute')!.detail).toContain('2 nota');
    expect(issue(r, 'bend')!.weight).toBeGreaterThan(issue(r, 'palmMute')!.weight);
  });

  it('does not treat a slide target as a stretch', () => {
    const r = one([[n(3, 5)], [n(3, 7, { slide: true })], [n(3, 9)], [n(3, 9)]]);
    expect(kinds(r)).toContain('slide');
    expect(kinds(r)).not.toContain('stretch');
  });

  it('reads techniques from alphaTab notes', () => {
    const bars = fromTex(`${HEADER}:8 5.3{h} 7.3 7.3{h} 5.3 x.4 12.1{nh} 7.3{b (0 4)} 5.6{pm} | 3.3{sl} 5.3 r r r r r r`);
    const [first, second] = analyze(bars).bars;
    expect(kinds(first)).toEqual(expect.arrayContaining(['hammer', 'pull', 'deadNote', 'harmonic', 'bend', 'palmMute']));
    expect(kinds(second)).toContain('slide');
    expect(bars[0].beats[0].notes[0]).toMatchObject({ string: 3, fret: 5, hammer: true, pull: false });
    expect(bars[0].beats[2].notes[0]).toMatchObject({ hammer: true, pull: true });
  });
});

describe('toSimpleBars', () => {
  it('follows tempo changes and tuplets', () => {
    const bars = fromTex(`${HEADER}:4 0.1 0.1 0.1 0.1 | \\tempo 60 :8 {tu 3} 0.1 0.1 0.1 :4 0.1 0.1 0.1`);
    expect(bars.map((b) => b.tempo)).toEqual([120, 60]);
    expect(bars[1].beats[0].quarters).toBeCloseTo(1 / 3);
    expect(bars[1].beats[0].tuplet).toBe(3);
    const report = analyze(bars);
    expect(report.bars[0].notesPerSecond).toBeCloseTo(2);
    expect(report.bars[1].notesPerSecond).toBeCloseTo(1.5);
  });
});

describe('analyze', () => {
  it('ranks hard bars and suggests a slower start speed', () => {
    const easy = bar(0, [[n(1, 0)], [n(2, 1)]], 2);
    const hard = bar(1, Array.from({ length: 16 }, (_, i) => [n(i % 2 ? 6 : 1, 1)]), 0.25, 110);
    const r = analyze([easy, hard]);
    expect(r.bars[0].difficulty).toBe(1);
    expect(r.bars[1].difficulty).toBeGreaterThanOrEqual(4);
    expect(r.hardestBars).toEqual([1]);
    expect(r.suggestedStartSpeed).toBeLessThanOrEqual(0.6);
    expect(r.overallDifficulty).toBeGreaterThanOrEqual(4);
    expect(r.summary[0]).toContain('2');
  });

  it('keeps difficulty within 1–5 and at most one issue per kind per bar', () => {
    const wild = bar(0, Array.from({ length: 32 }, (_, i) => [n((i % 6) + 1, (i * 7) % 20, { bend: true, hammer: i % 3 === 0, slide: true, palmMute: true })]), 0.125, 200);
    const r = analyze([wild, bar(1, [F_BARRE, BM, G, C], 1)]);
    for (const b of r.bars) {
      expect(b.difficulty).toBeGreaterThanOrEqual(1);
      expect(b.difficulty).toBeLessThanOrEqual(5);
      expect(Number.isInteger(b.difficulty)).toBe(true);
      expect(new Set(kinds(b)).size).toBe(b.issues.length);
      for (const i of b.issues) {
        expect(i.message.length).toBeGreaterThan(10);
        expect(ISSUE_LABELS[i.kind]).toBeTruthy();
      }
    }
    expect(r.bars[0].difficulty).toBe(5);
  });

  it('explains a technique once and keeps later bars specific and short', () => {
    const hammerBar = (index: number, fret: number) => bar(index, [[n(3, fret, { hammer: true })], [n(3, fret + 2)]], 2);
    const r = analyze([hammerBar(0, 5), hammerBar(1, 7), hammerBar(2, 5)]);
    const [a, b, c] = r.bars.map((x) => issue(x, 'hammer')!);
    expect(a.message).toBe(`${a.detail} ${a.advice}`);
    expect(b.message).toBe(b.detail);
    expect(b.message).toContain('7. perde → 9. perde');
    expect(c.message).not.toContain(a.advice);
    const messages = r.bars.flatMap((x) => x.issues.map((i) => i.message));
    expect(messages.filter((m) => m.includes(a.advice))).toHaveLength(1);
    expect(new Set(r.summary).size).toBe(r.summary.length);
  });

  it('gives an easy piece a calm summary and a high start speed', () => {
    const r = analyze([bar(0, [[n(6, 0)], [n(5, 0)], [n(4, 0)], [n(3, 0)]], 1, 70)]);
    expect(r.hardestBars).toEqual([]);
    expect(r.overallDifficulty).toBe(1);
    expect(r.suggestedStartSpeed).toBe(0.9);
    expect(r.summary).toHaveLength(2);
    expect(r.summary[1]).toContain('%90');
    expect(r.summary[1]).toContain('63 bpm');
  });

  it('handles an empty score', () => {
    const r = analyze([]);
    expect(r.bars).toEqual([]);
    expect(r.hardestBars).toEqual([]);
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('finds the known hard spots of the demo tab', () => {
    const r = analyze(fromTex(DEMO_TEX));
    expect(r.bars).toHaveLength(10);
    expect(r.bars[0].issues).toEqual([]);
    expect(kinds(r.bars[2])).toContain('barre');
    expect(kinds(r.bars[4])).toEqual(expect.arrayContaining(['hammer', 'slide', 'shift']));
    expect(kinds(r.bars[7])).toContain('stretch');
    expect(kinds(r.bars[8])).toContain('speed');
    expect(r.hardestBars).toContain(7);
    expect(r.bars[7].difficulty).toBe(5);
  });
});

describe('built-in lessons through the analysis', () => {
  const reports = Object.fromEntries(listBuiltinLessons().map((l) => [l.id, analyze(fromTex(loadBuiltinLesson(l.id)))]));

  it('finds nothing to warn about in the first lessons', () => {
    for (const id of ['open-strings', 'chromatic-warmup', 'twinkle', 'ode-to-joy', 'em-pentatonic']) {
      const r = reports[id];
      expect(r.bars.every((b) => b.difficulty === 1 && b.issues.length === 0), id).toBe(true);
      expect(r.overallDifficulty, id).toBe(1);
    }
  });

  it('never rates a beginner lesson above 3 and keeps the start speed high', () => {
    // The "Eserler" pack is meant to reach level 5 (hard), so it is left out here.
    const easy = new Set(listBuiltinLessons().filter((l) => l.group !== 'eserler').map((l) => l.id));
    for (const [id, r] of Object.entries(reports).filter(([id]) => easy.has(id))) {
      expect(Math.max(...r.bars.map((b) => b.difficulty)), id).toBeLessThanOrEqual(3);
      expect(r.suggestedStartSpeed, id).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('gives lesson-specific tips', () => {
    expect(kinds(reports['frere-jacques'].bars[4])).toEqual(['stretch']);
    expect(issue(reports['open-chords'].bars[1], 'chordChange')!.detail).toContain('C → G');
    expect(issue(reports['open-chords'].bars[3], 'barre')!.detail).toContain('Mini barre');
    expect(kinds(reports['hammer-pull'].bars[0])).toEqual(['hammer']);
    expect(kinds(reports['hammer-pull'].bars[2])).toEqual(['pull']);
    expect(kinds(reports['hammer-pull'].bars[4]).sort()).toEqual(['hammer', 'pull']);
    expect(issue(reports['arpeggio-pattern'].bars[2], 'chordChange')!.detail).toContain('C → G');
  });
});
