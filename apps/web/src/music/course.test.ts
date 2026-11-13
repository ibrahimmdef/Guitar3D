import { describe, expect, it } from 'vitest';
import { listBuiltinLessons } from '../tabs/builtin';
import { VOICINGS } from './chords';
import { advance, COURSE, isUnlocked, LEVEL_TITLES, levelLessons, levelProgress, nextLesson } from './course';
import { PATTERNS } from './rhythm';

const chordExists = (name: string) => VOICINGS.some((v) => v.name === name);

describe('course content', () => {
  it('has unique ids and every level 1–5 filled', () => {
    expect(new Set(COURSE.map((l) => l.id)).size).toBe(COURSE.length);
    for (let lv = 1; lv <= 5; lv++) {
      expect(levelLessons(lv).length, `level ${lv}`).toBeGreaterThanOrEqual(3);
      expect(LEVEL_TITLES[lv]).toBeTruthy();
    }
  });
  it('only references things that exist', () => {
    const lessons = new Set(listBuiltinLessons().map((l) => l.id));
    const patterns = new Set(PATTERNS.map((p) => p.id));
    const validPos = (p: { string: number; fret: number }) => p.string >= 1 && p.string <= 6 && p.fret >= 0 && p.fret <= 15;
    for (const l of COURSE) {
      expect(l.text.length, l.id).toBeGreaterThanOrEqual(2);
      const d = l.demo;
      if (d.kind === 'notes') expect(d.notes.every(validPos)).toBe(true);
      else expect(chordExists(d.chord), `${l.id} ${d.chord}`).toBe(true);
      if (d.kind === 'strum') expect(patterns.has(d.patternId)).toBe(true);
      const e = l.exercise;
      if (e.kind === 'play') expect(e.notes.every(validPos)).toBe(true);
      if (e.kind === 'arpeggio') expect(chordExists(e.chord)).toBe(true);
      if (e.kind === 'lesson') expect(lessons.has(e.lessonId), e.lessonId).toBe(true);
      if (e.kind === 'screen' && e.patternId) expect(patterns.has(e.patternId)).toBe(true);
      if (e.kind === 'screen' && e.chords) e.chords.forEach((c) => expect(chordExists(c)).toBe(true));
    }
  });
});

describe('course progress', () => {
  it('unlocks levels at 75 % and points at the next lesson', () => {
    const done = new Set<string>();
    expect(nextLesson(done)?.id).toBe(COURSE[0].id);
    expect(isUnlocked(done, 2)).toBe(false);
    const l1 = levelLessons(1);
    l1.slice(0, Math.ceil(l1.length * 0.75)).forEach((l) => done.add(l.id));
    expect(isUnlocked(done, 2)).toBe(true);
    expect(levelProgress(done, 1).pct).toBeGreaterThanOrEqual(75);
    expect(nextLesson(done)?.level).toBe(1);
    COURSE.forEach((l) => done.add(l.id));
    expect(nextLesson(done)).toBeNull();
  });
  it('advances through mic targets', () => {
    expect(advance([40, 45], 0, 40.2)).toEqual({ idx: 1, hit: true });
    expect(advance([40, 45], 1, 47)).toEqual({ idx: 1, hit: false });
    expect(advance([40], 1, 40)).toEqual({ idx: 1, hit: false });
  });
});
