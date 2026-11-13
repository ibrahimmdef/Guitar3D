import { describe, expect, it } from 'vitest';
import { groupByLevel, groupByRank, listLessons, loadLesson, normalizeLevel, toLessonContent, toLessonMeta } from './lessons';

describe('lessons', () => {
  it('normalises levels from several spellings', () => {
    expect(normalizeLevel('Başlangıç')).toBe('beginner');
    expect(normalizeLevel('medium')).toBe('intermediate');
    // Built-in lessons use 1–5: 1–2 beginner, 3 intermediate, 4–5 advanced.
    expect(normalizeLevel(2)).toBe('beginner');
    expect(normalizeLevel(3)).toBe('intermediate');
    expect(normalizeLevel(5)).toBe('advanced');
    expect(normalizeLevel(undefined)).toBe('beginner');
  });

  it('accepts loose lesson metadata', () => {
    expect(toLessonMeta({ slug: 'a', name: 'A', difficulty: 'hard', bpm: 90 })).toEqual({ id: 'a', title: 'A', level: 'advanced', description: undefined, tempo: 90 });
    expect(toLessonMeta({ title: 'no id' })).toBeNull();
    expect(toLessonMeta(null)).toBeNull();
  });

  it('accepts alphaTex strings, binary data and wrapped content', () => {
    expect(toLessonContent('\\title "x" . 0.1')).toEqual({ kind: 'tex', tex: '\\title "x" . 0.1' });
    expect(toLessonContent({ alphaTex: 'abc' })).toEqual({ kind: 'tex', tex: 'abc' });
    const bytes = new Uint8Array([1, 2, 3]);
    const c = toLessonContent({ data: bytes });
    expect(c?.kind).toBe('buffer');
    expect(c && c.kind === 'buffer' ? c.data.byteLength : 0).toBe(3);
    expect(toLessonContent('   ')).toBeNull();
    expect(toLessonContent(42)).toBeNull();
  });

  it('groups by level in a fixed order', () => {
    const g = groupByLevel([{ level: 'advanced' as const }, { level: 'beginner' as const }, { level: 'beginner' as const }]);
    expect(g.map((x) => [x.level, x.items.length])).toEqual([['beginner', 2], ['advanced', 1]]);
  });

  it('keeps the raw 1–5 level and groups the Eserler pack as Orta / Orta üstü / Zor', async () => {
    expect(toLessonMeta({ id: 'x', title: 'X', level: 4 })).toMatchObject({ level: 'advanced', rank: 4 });
    const g = groupByRank([{ rank: 5 }, { rank: 3 }, { rank: 4 }, { rank: 5 }, {}]);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['Orta', 1], ['Orta üstü', 1], ['Zor', 2]]);
    const eserler = (await listLessons()).filter((l) => l.group === 'eserler');
    expect(groupByRank(eserler).map((x) => x.items.length)).toEqual([10, 10, 10]);
  });

  it('falls back to built-in lessons that load', async () => {
    const list = await listLessons();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((l) => l.level === 'beginner')).toBe(true);
    const { content } = await loadLesson(list[0].id);
    expect(content.kind === 'tex' ? content.tex : '').toContain('\\tuning');
    await expect(loadLesson('missing-lesson')).rejects.toThrow();
  });

  it('every fallback lesson is valid alphaTex', async () => {
    const { importer } = await import('@coderline/alphatab');
    for (const l of await listLessons()) {
      const { content } = await loadLesson(l.id);
      if (content.kind !== 'tex') continue;
      const score = importer.ScoreLoader.loadAlphaTex(content.tex);
      expect(score.masterBars.length, l.id).toBeGreaterThan(2);
      expect(score.tracks[0].staves[0].tuning.length, l.id).toBe(6);
    }
  });
});
