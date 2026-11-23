import { importer, LogLevel, Settings, type model } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { analyze } from '../tips/analyze';
import { toSimpleBars } from '../tips/model';
import { ladderStep, passResult, startLadder, type LadderState } from '../player/tempoLadder';
import { calibrationClicks, latencyFromTaps } from './calibration';
import { plannedNotes, tickToPerf, type PlannedNote } from './expected';
import { pickHardestSection } from './hardest';
import { detectOnsets, type Onset } from './onsets';
import { scorePass, tendencies, type ExpectedNote } from './scorePass';
import { renderPlucks } from './synth';

const SR = 22050;

function tex(src: string): model.Score {
  const settings = new Settings();
  settings.core.logLevel = LogLevel.None;
  return importer.ScoreLoader.loadAlphaTex(src, settings);
}

const note = (ms: number, midi: number, extra: Partial<ExpectedNote> = {}): ExpectedNote => ({
  bar: 0, beat: 0, beatInBar: 0, ms, midi: [midi], frets: [{ string: 1, fret: 0 }], strum: false, ...extra,
});
const on = (ms: number, midi: number | null): Onset => ({ ms, midi, strength: 20 });

/** Expected times of planned notes at `speed`, with the first downbeat of the loop at `leadMs`. */
function toMs(plan: PlannedNote[], tempo: number, speed: number, leadMs: number, loopTick: number): ExpectedNote[] {
  return plan.map(({ tick, ...n }) => ({ ...n, ms: leadMs + ((tick - loopTick) / 960) * (60000 / (tempo * speed)) }));
}

describe('scorePass', () => {
  const four = [note(0, 64), note(500, 67), note(1000, 69), note(1500, 71)];

  it('counts notes on time with the right pitch as clean', () => {
    const r = scorePass(four, [on(10, 64), on(530, 67), on(980, 69), on(1500, 71)], { toleranceMs: 60 });
    expect(r.score).toBe(100);
    expect(r.counts.clean).toBe(4);
    expect(r.medianDeltaMs).toBe(5);
  });

  it('classifies late, early, wrong and missed notes', () => {
    const r = scorePass(four, [on(0, 64), on(600, 67), on(1000, 70), on(1380, 71)], { toleranceMs: 60 });
    expect(r.notes.map((n) => n.outcome)).toEqual(['clean', 'late', 'wrong', 'early']);
    expect(scorePass(four, [on(0, 64)]).notes.slice(1).every((n) => n.outcome === 'missed')).toBe(true);
    expect(r.score).toBe(25);
  });

  it('removes the calibrated latency before judging timing', () => {
    const heard = four.map((n) => on(n.ms + 120, n.midi[0]));
    expect(scorePass(four, heard, { toleranceMs: 60 }).counts.late).toBe(4);
    const fixed = scorePass(four, heard, { toleranceMs: 60, latencyMs: 120 });
    expect(fixed.score).toBe(100);
    expect(fixed.medianDeltaMs).toBe(0);
  });

  it('judges strums on timing only and forgives octave slips of the detector', () => {
    const strums = [note(0, 52, { strum: true, midi: [40, 47, 52] }), note(500, 55, { strum: true, midi: [43, 47, 55] })];
    expect(scorePass(strums, [on(20, 30), on(510, null)]).score).toBe(100);
    expect(scorePass([note(0, 64)], [on(0, 76)]).score).toBe(100);
  });

  it('prefers the right pitch over a closer wrong one and counts stray attacks', () => {
    const r = scorePass([note(0, 64)], [on(-5, 65), on(30, 64), on(700, 60)], { toleranceMs: 60 });
    expect(r.notes[0]).toMatchObject({ outcome: 'clean', deltaMs: 30 });
    expect(r.extra).toBe(1);
  });
});

describe('tendencies', () => {
  it('finds a rushed beat of the bar', () => {
    const exp: ExpectedNote[] = [];
    const heard: Onset[] = [];
    for (let bar = 0; bar < 2; bar++) {
      for (let b = 0; b < 4; b++) {
        const ms = (bar * 4 + b) * 500;
        exp.push(note(ms, 60 + b, { bar, beatInBar: b }));
        heard.push(on(ms + (b === 2 ? -80 : 5), 60 + b));
      }
    }
    const t = tendencies(scorePass(exp, heard, { toleranceMs: 60 }), { toleranceMs: 60 });
    expect(t.find((x) => x.kind === 'beat')?.text).toMatch(/rush beat 3/);
    expect(t.some((x) => x.kind === 'overall')).toBe(false);
  });

  it('ties a late note to the position shift it lands on', () => {
    const exp = [note(0, 64, { bar: 3 }), note(500, 66, { bar: 4 }), note(1000, 71, { bar: 4, beatInBar: 2, shift: 7 }), note(1500, 72, { bar: 4, beatInBar: 3 })];
    const heard = [on(0, 64), on(500, 66), on(1110, 71), on(1500, 72)];
    const t = tendencies(scorePass(exp, heard, { toleranceMs: 60 }), { toleranceMs: 60 });
    expect(t[0]).toMatchObject({ kind: 'shift', bar: 4 });
    expect(t[0].text).toMatch(/^Late on the position shift in bar 5 \(\+110 ms\)/);
    expect(t.find((x) => x.kind === 'bar')?.text).toBe('Bar 5: 1 late.');
  });

  it('reports a general drag behind the beat', () => {
    const exp = [0, 1, 2, 3, 4, 5].map((i) => note(i * 400, 60, { beatInBar: i % 4 }));
    const t = tendencies(scorePass(exp, exp.map((n) => on(n.ms + 45, 60)), { toleranceMs: 60 }), { toleranceMs: 60 });
    expect(t.map((x) => x.kind)).toEqual(['overall']);
    expect(t[0].text).toMatch(/behind the beat \(\+45 ms\)/);
  });
});

describe('speed trainer ladder', () => {
  const cfg = { start: 0.6, target: 1, passes: 2 };

  it('steps up after N clean passes in a row and stops at the target', () => {
    let s = startLadder(cfg);
    expect(s).toMatchObject({ speed: 0.6, floor: 0.6, clean: 0, fails: 0, done: false });
    let r = ladderStep(s, 'clean');
    expect(r).toMatchObject({ event: 'count', state: { speed: 0.6, clean: 1 } });
    r = ladderStep(r.state, 'clean');
    expect(r).toMatchObject({ event: 'up', state: { speed: 0.65, clean: 0, best: 0.6 } });
    s = r.state;
    for (let i = 0; i < 40 && !s.done; i++) s = ladderStep(s, 'clean').state;
    expect(s).toMatchObject({ speed: 1, done: true, best: 1 });
  });

  it('a failed pass breaks the clean streak', () => {
    let s = ladderStep(startLadder(cfg), 'clean').state;
    const r = ladderStep(s, 'miss');
    expect(r).toMatchObject({ event: 'strike', state: { clean: 0, fails: 1, speed: 0.6 } });
    s = ladderStep(r.state, 'clean').state;
    expect(s).toMatchObject({ clean: 1, fails: 0 });
  });

  it('steps down after two failed passes in a row, never below the start', () => {
    let s: LadderState = startLadder(cfg);
    s = ladderStep(ladderStep(s, 'clean').state, 'clean').state;
    s = ladderStep(ladderStep(s, 'clean').state, 'clean').state;
    expect(s.speed).toBe(0.7);
    let r = ladderStep(ladderStep(s, 'miss').state, 'miss');
    expect(r).toMatchObject({ event: 'down', state: { speed: 0.65, fails: 0, best: 0.65 } });
    r = ladderStep(ladderStep(r.state, 'miss').state, 'miss');
    expect(r.state.speed).toBe(0.6);
    r = ladderStep(ladderStep(r.state, 'miss').state, 'miss');
    expect(r).toMatchObject({ event: 'floor', state: { speed: 0.6 } });
  });

  it('honours step size, fail count, overshoot target and the clean threshold', () => {
    let s = startLadder({ start: 0.95, target: 1.1, passes: 1 });
    s = ladderStep(s, 'clean', { step: 0.1 }).state;
    expect(s.speed).toBe(1.05);
    s = ladderStep(s, 'clean', { step: 0.1 }).state;
    expect(s.speed).toBe(1.1);
    expect(ladderStep(s, 'miss', { failPasses: 1, step: 0.1 })).toMatchObject({ event: 'down', state: { speed: 1 } });
    expect(startLadder({ start: 1.2, target: 0.9, passes: 0 })).toMatchObject({ speed: 0.9, passes: 1 });
    expect(passResult(90, 90)).toBe('clean');
    expect(passResult(89, 90)).toBe('miss');
  });
});

describe('pickHardestSection', () => {
  const bars = (scores: number[]) => scores.map((score, bar) => ({ bar, score }));

  it('picks the 2–4 bars where difficulty piles up', () => {
    expect(pickHardestSection(bars([1, 1, 5, 6, 1, 1, 1]))).toEqual([2, 3]);
    expect(pickHardestSection(bars([1, 4, 5, 6, 4, 1, 1, 1]))).toEqual([1, 4]);
    expect(pickHardestSection(bars([1, 1, 1, 9, 1, 1]))).toHaveLength(2);
  });

  it('prefers the earlier window on ties and skips empty bars', () => {
    expect(pickHardestSection(bars([5, 5, 1, 5, 5, 1]))).toEqual([0, 1]);
    const withRest = [{ bar: 0, score: 1 }, { bar: 1, score: 6, playable: false }, { bar: 2, score: 5 }, { bar: 3, score: 5 }];
    expect(pickHardestSection(withRest)).toEqual([2, 3]);
    expect(pickHardestSection([{ bar: 0, score: 2 }])).toEqual([0, 0]);
    expect(pickHardestSection([])).toBeNull();
  });

  it('works on a real tips report', () => {
    const score = tex('\\tempo 90 . :4 0.6 0.6 0.6 0.6 | 0.6 0.6 0.6 0.6 | :16 1.6 5.5 8.4 12.3 15.2 3.1 7.6 12.4 1.6 5.5 8.4 12.3 15.2 3.1 7.6 12.4 | :16 15.1 12.2 8.3 5.4 1.5 12.6 3.3 15.2 15.1 12.2 8.3 5.4 1.5 12.6 3.3 15.2 | :4 0.6 0.6 0.6 0.6');
    const report = analyze(toSimpleBars(score.tracks[0], score.tempo));
    expect(pickHardestSection(report.bars.map((b) => ({ bar: b.bar, score: b.score })))).toEqual([2, 3]);
  });
});

describe('latency calibration', () => {
  const { play } = calibrationClicks(90);

  it('measures the median offset of the taps', () => {
    const taps = play.map((c, i) => c + 140 + (i % 2 ? 8 : -6));
    const r = latencyFromTaps(play, [...taps, 50]);
    expect(r).toMatchObject({ matched: 8, ok: true });
    expect(Math.abs(r.latencyMs - 141)).toBeLessThanOrEqual(5);
  });

  it('refuses too few or unsteady taps', () => {
    expect(latencyFromTaps(play, play.slice(0, 3).map((c) => c + 100)).ok).toBe(false);
    expect(latencyFromTaps(play, play.map((c, i) => c + (i % 2 ? 20 : 220))).ok).toBe(false);
  });
});

describe('tickToPerf', () => {
  it('fits a line through jittery player events', () => {
    // 960 ticks per 500 ms, events every ~50 ms with ±6 ms jitter
    const anchors = Array.from({ length: 40 }, (_, i) => ({ tick: i * 96, perf: 1000 + i * 50 + (i % 3 === 0 ? 6 : i % 3 === 1 ? -6 : 0) }));
    expect(Math.abs(tickToPerf(anchors, 1920)! - 2000)).toBeLessThan(5);
    expect(Math.abs(tickToPerf(anchors, 4000)! - 3083)).toBeLessThan(6);
  });
});

describe('synthetic takes through the detector (same path as the microphone)', () => {
  // E minor pentatonic run, then a jump up the neck to position 12 in bar 3
  const SRC = '\\tempo 100 . :8 0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3 | 0.2 3.2 0.1 3.1 3.1 0.1 3.2 0.2 | 12.1 15.1 12.2 15.2 12.3 14.3 12.4 14.4 | 0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3';
  const score = tex(SRC);
  const track = score.tracks[0];
  const plan = plannedNotes(track, 1, 2);
  const speed = 0.8;
  const lead = 300;
  const exp = toMs(plan, score.tempo, speed, lead, score.masterBars[1].start);
  const total = exp[exp.length - 1].ms + 900;

  function take(errors: (n: ExpectedNote, i: number) => { dt?: number; skip?: boolean; midi?: number }, latency = 0): Float32Array {
    return renderPlucks(
      exp.flatMap((n, i) => {
        const e = errors(n, i);
        return e.skip ? [] : [{ ms: n.ms + (e.dt ?? 0) + latency, midi: [e.midi ?? n.midi[0]], durMs: 400 }];
      }),
      SR, total + latency, { noise: 0.003 },
    );
  }

  it('plans the notes with the shift landing from the tips engine', () => {
    expect(plan).toHaveLength(16);
    expect(plan[8]).toMatchObject({ bar: 2, beat: 0, midi: [76], frets: [{ string: 1, fret: 12 }], strum: false });
    expect(plan[8].shift).toBeGreaterThanOrEqual(2);
  });

  it('a clean take scores high and steps the tempo up', () => {
    const jitter = [4, -8, 12, -3, 0, 7, -10, 5];
    const audio = take((_, i) => ({ dt: jitter[i % jitter.length] }), 90);
    const onsets = detectOnsets(audio, SR);
    const r = scorePass(exp, onsets, { toleranceMs: 60, latencyMs: 90 });
    expect(r.score).toBeGreaterThanOrEqual(90);
    let s = startLadder({ start: speed, target: 1, passes: 2 });
    s = ladderStep(s, passResult(r.score, 90)).state;
    const second = ladderStep(s, passResult(r.score, 90));
    expect(second.event).toBe('up');
    expect(second.state.speed).toBe(0.85);
  });

  it('a sloppy take fails, stays put, and the feedback names the right bar', () => {
    // bar 3 (index 2): the shift landing is 130 ms late, two notes missed, one wrong
    const audio = take((n, i) => (i === 8 ? { dt: 130 } : i === 11 || i === 13 ? { skip: true } : i === 14 ? { midi: n.midi[0] + 2 } : { dt: (i % 3) * 5 }));
    const onsets = detectOnsets(audio, SR);
    const r = scorePass(exp, onsets, { toleranceMs: 60 });
    expect(r.score).toBeLessThan(90);
    expect(r.notes[8].outcome).toBe('late');
    expect(r.notes[11].outcome).toBe('missed');
    expect(r.notes[14].outcome).toBe('wrong');
    expect(r.notes.slice(0, 8).every((n) => n.outcome === 'clean')).toBe(true);
    const t = tendencies(r);
    expect(t[0]).toMatchObject({ kind: 'shift', bar: 2 });
    expect(t[0].text).toMatch(/Late on the position shift in bar 3/);
    expect(t.find((x) => x.kind === 'bar')).toMatchObject({ bar: 2 });
    const s = ladderStep(startLadder({ start: speed, target: 1, passes: 2 }), passResult(r.score, 90));
    expect(s).toMatchObject({ event: 'strike', state: { speed } });
  });

  it('latency calibration on detected taps', () => {
    const { play } = calibrationClicks(90);
    const audio = renderPlucks(play.map((c, i) => ({ ms: c + 110 + (i % 2 ? 6 : -6), midi: [52], durMs: 300 })), SR, play[play.length - 1] + 800, { noise: 0.003 });
    const r = latencyFromTaps(play, detectOnsets(audio, SR).map((o) => o.ms));
    expect(r.ok).toBe(true);
    expect(Math.abs(r.latencyMs - 110)).toBeLessThanOrEqual(10);
  });
});

describe('progress labels', () => {
  it('says how far a section is from full speed', async () => {
    const { cleanLabel, focusSection, cleanTempoBySession } = await import('./progress');
    expect(cleanLabel({ bestCleanSpeed: 0.85, bpm: 80 })).toBe('Clean at 85% — 12 BPM to go');
    expect(cleanLabel({ bestCleanSpeed: 0.85 })).toBe('Clean at 85% — 15% to go');
    expect(cleanLabel({ bestCleanSpeed: 1, bpm: 80 })).toBe('Clean at 100% — up to speed');
    expect(cleanLabel({ bestCleanSpeed: 0 })).toBe('Not clean yet');
    const a = { startBar: 0, endBar: 1, bestCleanSpeed: 0.9, updatedAt: '2026-11-02T10:00:00Z' };
    const b = { startBar: 4, endBar: 5, bestCleanSpeed: 0.7, updatedAt: '2026-11-01T10:00:00Z', history: [{ at: '2026-11-01T10:00:00Z', speed: 0.7, clean: true, mode: 'mic' as const }] };
    expect(focusSection({ tabId: 'x', sections: [a, b] })).toBe(b);
    const h = (at: string, speed: number, clean: boolean) => ({ at, speed, clean, mode: 'manual' as const });
    expect(cleanTempoBySession([
      h('2026-11-01T10:00:00Z', 0.6, true), h('2026-11-01T10:05:00Z', 0.65, true), h('2026-11-01T10:09:00Z', 0.7, false),
      h('2026-11-02T18:00:00Z', 0.7, true), h('2026-11-03T18:00:00Z', 0.75, false),
    ])).toEqual([
      { at: '2026-11-01T10:00:00Z', speed: 0.65, passes: 3 },
      { at: '2026-11-02T18:00:00Z', speed: 0.7, passes: 1 },
      { at: '2026-11-03T18:00:00Z', speed: null, passes: 1 },
    ]);
  });
});
