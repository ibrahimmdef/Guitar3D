import { describe, expect, it } from 'vitest';
import { asciiTabToAlphaTex } from './asciiTab';
import { itemsToText, type PdfTextItem } from './pdfText';

/** Monospace runs: one item per string of text at (col, row). */
const mono = (rows: { y: number; parts: [number, string][] }[], cw = 6): PdfTextItem[] =>
  rows.flatMap((r) => r.parts.map(([col, str]) => ({ str, x: 40 + col * cw, y: r.y, w: str.length * cw, h: 10 })));

describe('itemsToText', () => {
  it('rebuilds whole tab lines in page order', () => {
    const lines = ['e|---0---|', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'];
    const items = mono(lines.map((l, i) => ({ y: 700 - i * 12, parts: [[0, l]] })));
    const text = itemsToText(items);
    expect(text.split('\n')).toEqual(lines);
    expect(asciiTabToAlphaTex(text).notes).toBe(5);
  });

  it('keeps columns when a line is split into several runs', () => {
    const items = mono([
      { y: 700, parts: [[0, 'e|--'], [4, '3'], [5, '---|']] },
      { y: 688, parts: [[0, 'B|-----'], [7, '1|']] },
    ]);
    expect(itemsToText(items).split('\n')).toEqual(['e|--3---|', 'B|-----1|']);
  });

  it('separates words and paragraphs', () => {
    const items = mono([
      { y: 700, parts: [[0, 'Intro'], [8, '(x2)']] },
      { y: 600, parts: [[0, 'Verse']] },
    ]);
    expect(itemsToText(items)).toBe('Intro   (x2)\n\nVerse');
  });
});
