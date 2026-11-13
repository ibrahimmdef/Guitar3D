import { describe, expect, it } from 'vitest';
import { accuracyPct, checkClick, checkPlayed, GAME_LEVELS, getLevel, initialScore, nextQuestion, positionsOf, scoreAnswer, seeded } from './fretGame';
import { STANDARD } from './tunings';

describe('fretboard game questions', () => {
  it('only asks natural notes on easy levels and always has an answer', () => {
    const rng = seeded(7);
    for (const level of GAME_LEVELS) {
      let prev = null;
      for (let i = 0; i < 200; i++) {
        const q = nextQuestion(level, STANDARD, rng, prev);
        if (level.naturalOnly) expect([0, 2, 4, 5, 7, 9, 11]).toContain(q.pc);
        expect(Boolean(q.string)).toBe(level.withString);
        expect(positionsOf(q.pc, STANDARD, level.maxFret, q.string).length).toBeGreaterThan(0);
        if (prev) expect(q.pc === prev.pc && q.string === prev.string).toBe(false);
        prev = q;
      }
    }
  });
  it('covers every natural note eventually', () => {
    const rng = seeded(1);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(nextQuestion(GAME_LEVELS[0], STANDARD, rng).pc);
    expect(seen.size).toBe(7);
  });
  it('lists positions on the neck', () => {
    // A (pc 9) on frets 0..5 in standard tuning: 1st and 6th string 5, 5th string open, 3rd string 2
    expect(positionsOf(9, STANDARD, 5)).toEqual([{ string: 1, fret: 5 }, { string: 3, fret: 2 }, { string: 5, fret: 0 }, { string: 6, fret: 5 }]);
    expect(positionsOf(9, STANDARD, 5, 6)).toEqual([{ string: 6, fret: 5 }]);
  });
});

describe('answers', () => {
  const l1 = getLevel('l1');
  const l2 = getLevel('l2');
  it('checks clicks', () => {
    expect(checkClick({ pc: 9 }, { string: 5, fret: 0 }, STANDARD, l1)).toBe(true);
    expect(checkClick({ pc: 9 }, { string: 5, fret: 12 }, STANDARD, l1)).toBe(false); // beyond the level
    expect(checkClick({ pc: 9, string: 6 }, { string: 5, fret: 0 }, STANDARD, l2)).toBe(false);
    expect(checkClick({ pc: 9, string: 6 }, { string: 6, fret: 5 }, STANDARD, l2)).toBe(true);
  });
  it('checks played notes', () => {
    expect(checkPlayed({ pc: 9 }, 57.2, STANDARD, l1)).toBe(true);
    expect(checkPlayed({ pc: 9 }, 58, STANDARD, l1)).toBe(false);
    expect(checkPlayed({ pc: 9, string: 6 }, 45, STANDARD, l2)).toBe(true); // A2 = 6th string, 5th fret
    expect(checkPlayed({ pc: 9, string: 6 }, 57, STANDARD, l2)).toBe(false); // A3 is out of reach there
  });
});

describe('scoring', () => {
  it('rewards speed and streaks, and resets the streak on a miss', () => {
    let st = initialScore();
    let r = scoreAnswer(st, true, 0);
    expect(r.points).toBe(20);
    r = scoreAnswer(r.state, true, 5000);
    expect(r.points).toBe(10);
    st = r.state;
    for (let i = 0; i < 3; i++) st = scoreAnswer(st, true, 6000).state;
    expect(st.streak).toBe(5);
    expect(scoreAnswer(st, true, 6000).points).toBe(15); // 6th in a row: ×1.5
    st = scoreAnswer(st, false, 100).state;
    expect(st).toMatchObject({ streak: 0, bestStreak: 5, correct: 5, wrong: 1 });
    expect(accuracyPct(st)).toBe(83);
  });
});
