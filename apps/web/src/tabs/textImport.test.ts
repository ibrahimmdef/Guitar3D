import { describe, expect, it } from 'vitest';
import { convertAscii, withTitle } from './textImport';

const TAB = `Title: Deneme
e|-----0-----|-0h2-----|
B|---1---1---|-----3p1-|
G|-2-------2-|---------|
D|-----------|---------|
A|-----------|---------|
E|-----------|---------|

e|---3-----|
B|---x-----|
G|---0-----|
D|---2/4---|
A|---3-----|
E|---------|`;

describe('convertAscii', () => {
  it('returns an empty string for empty input', () => {
    expect(convertAscii('   ')).toBe('');
  });
  it('returns the error message when there is no tab', () => {
    expect(convertAscii('merhaba dünya')).toMatch(/bulunamadı/);
  });
  it('converts several systems and honours the tempo override', () => {
    const r = convertAscii(TAB, 72);
    if (typeof r === 'string') throw new Error(r);
    expect(r.systems).toBe(2);
    expect(r.bars).toBe(3);
    expect(r.tempo).toBe(72);
    expect(r.title).toBe('Deneme');
    expect(r.alphaTex).toContain('\\tempo 72');
  });
});

describe('withTitle', () => {
  it('replaces an existing title', () => {
    expect(withTitle('\\title "A"\n\\tempo 90', 'B "x"')).toBe('\\title "B x"\n\\tempo 90');
  });
  it('inserts a title when missing and keeps text when empty', () => {
    expect(withTitle('\\tempo 90', 'C')).toBe('\\title "C"\n\\tempo 90');
    expect(withTitle('\\tempo 90', '')).toBe('\\tempo 90');
  });
});
