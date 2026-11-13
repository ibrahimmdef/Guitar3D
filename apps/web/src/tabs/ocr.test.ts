import { describe, expect, it } from 'vitest';
import { cleanOcrTab } from './ocr';
import { asciiTabToAlphaTex } from './asciiTab';

describe('cleanOcrTab', () => {
  it('repairs dashes, bar lines, spaces and O/0 mix-ups', () => {
    const raw = ['e I-- 3 —-O--l', 'B |--1----1--|', 'G: -2-------!', 'D|-----------|', 'A|—————-----|', 'E|___________|'].join('\n');
    expect(cleanOcrTab(raw).split('\n')).toEqual(['e|--3--0--|', 'B|--1----1--|', 'G|-2-------|', 'D|-----------|', 'A|----------|', 'E|-----------|']);
  });

  it('adds string labels to an unlabelled six-line block and keeps other text', () => {
    const raw = ['Intro', '|--0--|----|', '|--1--|----|', '|-----|-2--|', '|-----|----|', '|-----|----|', '|-----|----|'].join('\n');
    const out = cleanOcrTab(raw).split('\n');
    expect(out[0]).toBe('Intro');
    expect(out.slice(1).map((l) => l[0])).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });

  it('produces text the ASCII parser accepts', () => {
    const raw = ['e  |--0---3--|', 'B  |--1------|', 'G  |--0------|', 'D  |--2------|', 'A  |--3------|', 'E  |---------|'].join('\n');
    const r = asciiTabToAlphaTex(cleanOcrTab(raw));
    expect(r.notes).toBe(6);
  });
});
