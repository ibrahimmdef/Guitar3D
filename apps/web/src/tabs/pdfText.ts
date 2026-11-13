/**
 * Pure helpers for PDF import (no pdf.js here, so they are unit-tested in Node).
 */

export interface PdfTextItem {
  str: string;
  /** Left edge and baseline in PDF units (y grows upwards). */
  x: number;
  y: number;
  /** Width of the run and font height. */
  w: number;
  h: number;
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q);
  return s[s.length >> 1];
};

/**
 * Positioned text of one page → plain lines. Runs on the same baseline form one line; horizontal
 * positions become columns of an estimated character width, so ASCII tab drawn as several runs
 * (or in a monospace font with gaps) keeps its column layout.
 */
export function itemsToText(items: PdfTextItem[]): string {
  const runs = items.filter((i) => i.str.length > 0);
  if (!runs.length) return '';
  const charW = Math.max(0.5, median(runs.filter((r) => r.str.trim()).map((r) => r.w / r.str.length)) || 5);
  const tol = Math.max(1, median(runs.map((r) => r.h || charW * 2)) * 0.45);
  // Group runs into lines, top of the page first.
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const r of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - r.y) <= tol) line.push(r);
    else lines.push([r]);
  }
  const minX = Math.min(...runs.map((r) => r.x));
  const out: string[] = [];
  let prevY: number | null = null;
  for (const line of lines) {
    // A large vertical gap is a paragraph / system break: keep it as a blank line.
    if (prevY != null && prevY - line[0].y > tol * 5) out.push('');
    prevY = line[0].y;
    let s = '';
    for (const r of line.sort((a, b) => a.x - b.x)) {
      const col = Math.round((r.x - minX) / charW);
      if (s.length < col) s += ' '.repeat(col - s.length);
      // overlapping runs (proportional fonts): keep words apart, but never split tab lines
      else if (col < s.length && !s.endsWith(' ') && !/^[-|]/.test(r.str) && !/[-|]$/.test(s)) s += ' ';
      s += r.str;
    }
    out.push(s.trimEnd());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
