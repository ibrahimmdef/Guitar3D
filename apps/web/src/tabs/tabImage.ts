/**
 * Tab image → layout → ASCII tab. Framework free (works on a binary bitmap), so it is unit-tested
 * without a browser; `ocr.ts` does the decoding and glyph recognition around it.
 *
 * Plain OCR fails on tab: rows of dashes and staff lines are not text. Instead we
 *  1. find string rows: y positions with a lot of thin horizontal ink (drawn staff lines or `-----`),
 *     grouped into systems of six evenly spaced rows;
 *  2. erase those lines, cut the remaining ink into glyphs and keep the ones centred on a string;
 *  3. find bar lines: tall thin strokes spanning the system, or `|` glyphs stacked on ≥ 4 strings;
 *  4. merge neighbouring glyphs on a string into tokens ("12", "0h2"), which the caller recognises;
 *  5. write a clean ASCII tab whose column spacing follows the x positions (rhythm comes from spacing).
 */

export interface Bitmap {
  width: number;
  height: number;
  /** 1 = ink, 0 = paper; row-major. */
  data: Uint8Array;
  /**
   * Optional low-contrast ink (anything clearly off the background colour), used only to find and
   * erase string lines: faint grey staff lines fall under the Otsu threshold that keeps the digits.
   */
  lines?: Uint8Array;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TabToken extends Box {
  /** String index in the system, 0 = top line (highest string). */
  row: number;
  /** Number of glyphs merged into the token (≈ expected character count). */
  pieces: number;
}

export interface TabSystemLayout {
  /** y of the six string lines, top first. */
  rows: number[];
  /** Line spacing in px. */
  spacing: number;
  /** x of bar lines, left to right (may be empty). */
  bars: number[];
  tokens: TabToken[];
  left: number;
  right: number;
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** Grey (0 = black … 255 = white) → ink bitmap with Otsu's threshold; dark-background images are inverted. */
export function binarize(grey: Uint8Array | Uint8ClampedArray, width: number, height: number): Bitmap {
  const hist = new Array<number>(256).fill(0);
  let sum = 0;
  for (const g of grey) {
    hist[g]++;
    sum += g;
  }
  const n = grey.length;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  const dark = sum / n < 110;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = dark ? (grey[i] > threshold ? 1 : 0) : grey[i] <= threshold ? 1 : 0;
  // Background = most common grey level; "line ink" = at least 18 levels away from it, on the ink side.
  let bg = 0;
  for (let t = 1; t < 256; t++) if (hist[t] > hist[bg]) bg = t;
  const lines = new Uint8Array(n);
  for (let i = 0; i < n; i++) lines[i] = data[i] || (dark ? grey[i] - bg > 18 : bg - grey[i] > 18) ? 1 : 0;
  return { width, height, data, lines };
}

/** Vertical run length of ink through every pixel. */
export function verticalRuns(bm: Bitmap): Uint16Array {
  const { width: w, height: h, data } = bm;
  const out = new Uint16Array(w * h);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!data[y * w + x]) {
        y++;
        continue;
      }
      let e = y;
      while (e < h && data[e * w + x]) e++;
      const len = Math.min(65535, e - y);
      for (let k = y; k < e; k++) out[k * w + x] = len;
      y = e;
    }
  }
  return out;
}

/** Thickness limit for "line" strokes (staff lines, dashes). */
const thinLimit = (bm: Bitmap) => Math.max(3, Math.round(Math.min(bm.width, 2400) / 260));

/** Per-row amount of thin horizontal ink (runs of thin pixels at least `minRun` long). */
export function horizontalProfile(bm: Bitmap, vr: Uint16Array, thin: number, minRun: number): Float64Array {
  const { width: w, height: h, data } = bm;
  const prof = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let run = 0;
    let acc = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && data[y * w + x] && vr[y * w + x] <= thin;
      if (on) run++;
      else {
        if (run >= minRun) acc += run;
        run = 0;
      }
    }
    prof[y] = acc;
  }
  return prof;
}

/** Centres of the peaks of a profile (regions above `frac` of the maximum). */
/**
 * Centres of the peaks of a profile. The threshold is local (a fraction of the strongest row within
 * `window` rows), so a small ASCII tab on the same page as a big drawn one is still found; `floor`
 * keeps weak noise (text, underlines) out.
 */
function peaks(prof: Float64Array, frac: number, window: number, floor: number): number[] {
  const n = prof.length;
  const thr = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    let m = 0;
    for (let k = Math.max(0, y - window); k <= Math.min(n - 1, y + window); k++) if (prof[k] > m) m = prof[k];
    thr[y] = Math.max(floor, m * frac);
  }
  const out: number[] = [];
  let y = 0;
  while (y < n) {
    if (prof[y] < thr[y] || prof[y] <= 0) {
      y++;
      continue;
    }
    let e = y;
    let m = 0;
    let s = 0;
    while (e < n && prof[e] >= thr[e] && prof[e] > 0) {
      m += prof[e] * e;
      s += prof[e];
      e++;
    }
    out.push(m / s);
    y = e;
  }
  // Merge peaks closer than 3 px (thick lines split by noise).
  return out.reduce<number[]>((a, p) => (a.length && p - a[a.length - 1] < 3 ? (a[a.length - 1] = (a[a.length - 1] + p) / 2, a) : (a.push(p), a)), []);
}

/** String-line candidates from the thin-ink profile of an image `width` px wide. */
export function rowCandidates(prof: Float64Array, width = 0): number[] {
  let max = 0;
  for (const v of prof) max = Math.max(max, v);
  if (!max) return [];
  const window = Math.max(80, Math.round(prof.length / 10));
  return peaks(prof, 0.3, window, Math.max(max * 0.06, width * 0.1));
}

/** Groups row candidates into systems of six evenly spaced lines. */
export function groupSystems(rows: number[]): { rows: number[]; spacing: number }[] {
  const out: { rows: number[]; spacing: number }[] = [];
  let i = 0;
  while (i + 6 <= rows.length) {
    const six = rows.slice(i, i + 6);
    const gaps = six.slice(1).map((y, k) => y - six[k]);
    const m = median(gaps);
    if (m >= 6 && gaps.every((g) => Math.abs(g - m) <= m * 0.22)) {
      out.push({ rows: six, spacing: m });
      i += 6;
    } else i++;
  }
  return out;
}

interface Comp extends Box {
  area: number;
}

/** 8-connected components of the ink inside a box. */
function components(bm: Bitmap, box: Box): Comp[] {
  const { width: w, data } = bm;
  const seen = new Uint8Array((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1));
  const bw = box.x1 - box.x0 + 1;
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const li = (y - box.y0) * bw + (x - box.x0);
      if (seen[li] || !data[y * w + x]) continue;
      const c: Comp = { x0: x, y0: y, x1: x, y1: y, area: 0 };
      seen[li] = 1;
      stack.push(x, y);
      while (stack.length) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        c.area++;
        if (cx < c.x0) c.x0 = cx;
        if (cx > c.x1) c.x1 = cx;
        if (cy < c.y0) c.y0 = cy;
        if (cy > c.y1) c.y1 = cy;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < box.y0 || ny > box.y1) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            if (nx < box.x0 || nx > box.x1) continue;
            const nli = (ny - box.y0) * bw + (nx - box.x0);
            if (seen[nli] || !data[ny * w + nx]) continue;
            seen[nli] = 1;
            stack.push(nx, ny);
          }
        }
      }
      out.push(c);
    }
  }
  return out;
}

const overlapX = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

/** Rejoins glyph pieces split by line erasure (stacked, overlapping in x, tiny vertical gap). */
function mergeStacked(cs: Comp[], gap: number, maxH: number): Comp[] {
  const out = [...cs];
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ov = overlapX(a, b);
        const vgap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
        const mergedH = Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0) + 1;
        if (ov >= 0.5 * Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1) && vgap <= gap && mergedH <= maxH) {
          out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area };
          out.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/**
 * Finds the tab systems, bar lines and fret-number tokens. Mutates nothing: works on a copy
 * whose string lines are erased (returned as `clean`, which the caller crops glyphs from).
 */
export function analyzeTabImage(src: Bitmap): { systems: TabSystemLayout[]; clean: Bitmap } {
  const bm: Bitmap = { width: src.width, height: src.height, data: new Uint8Array(src.data) };
  const { width: w, height: h } = bm;
  // Lines are found (and erased) on the low-contrast map when there is one.
  const lm: Bitmap = { width: w, height: h, data: src.lines ? new Uint8Array(src.lines) : bm.data };
  const vr = verticalRuns(lm);
  // Line thickness depends on the source and on our rescaling: try a few limits, keep the first that finds tab.
  let thin = thinLimit(bm);
  let systems: { rows: number[]; spacing: number }[] = [];
  for (const f of [1, 1.6, 2.5]) {
    const t = Math.round(thinLimit(bm) * f);
    systems = groupSystems(rowCandidates(horizontalProfile(lm, vr, t, Math.max(4, Math.round(w / 300))), w));
    if (systems.length) {
      thin = t;
      break;
    }
  }
  const layouts: TabSystemLayout[] = [];

  for (const sys of systems) {
    const s = sys.spacing;
    const box: Box = { x0: 0, x1: w - 1, y0: Math.max(0, Math.floor(sys.rows[0] - s * 0.9)), y1: Math.min(h - 1, Math.ceil(sys.rows[5] + s * 0.9)) };
    // Vertical strokes taller than a line gap (bar lines, a playback cursor, stems) are no digit:
    // erase them so they cannot glue a chord column together; full-height ones are bar candidates.
    const vr2 = verticalRuns(bm);
    const yTop = Math.round(sys.rows[0]);
    const yBot = Math.round(sys.rows[5]);
    const cover = new Uint16Array(w);
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (bm.data[i] && vr2[i] > s * 1.3) {
          bm.data[i] = 0;
          if (y >= yTop && y <= yBot) cover[x]++;
        }
      }
    }
    const vLines: number[] = [];
    for (let x = 0; x < w; ) {
      if (cover[x] < (yBot - yTop) * 0.8) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && cover[e] >= (yBot - yTop) * 0.8) e++;
      if (e - x <= Math.max(3, s * 0.25)) vLines.push((x + e - 1) / 2);
      x = e;
    }
    // 1. erase string lines: thin pixels in a band around each row that belong to long horizontal runs.
    const band = Math.max(2, Math.ceil(thin / 2) + 1);
    const longRun = Math.max(6, Math.round(s * 0.75));
    for (const ry of sys.rows) {
      for (let y = Math.max(0, Math.round(ry) - band); y <= Math.min(h - 1, Math.round(ry) + band); y++) {
        let x = 0;
        while (x < w) {
          if (!(lm.data[y * w + x] && vr[y * w + x] <= thin)) {
            x++;
            continue;
          }
          let e = x;
          while (e < w && lm.data[y * w + e] && vr[y * w + e] <= thin) e++;
          if (e - x >= longRun) for (let k = x; k < e; k++) bm.data[y * w + k] = 0;
          x = e;
        }
      }
    }

    // 2. glyphs around the system.
    const raw = components(bm, box).filter((c) => c.area >= 4);
    // Dotted zeros (DejaVu, Consolas…): a small mark inside another glyph's hole is dropped, or OCR reads 0 as 6/8.
    const inner = raw.filter((c) => raw.some((d) => d !== c && d.x0 < c.x0 && d.x1 > c.x1 && d.y0 < c.y0 && d.y1 > c.y1 && c.area < d.area * 0.35));
    for (const c of inner) for (let y = c.y0; y <= c.y1; y++) bm.data.fill(0, y * w + c.x0, y * w + c.x1 + 1);
    const comps = mergeStacked(raw.filter((c) => !inner.includes(c)), Math.max(2, Math.min(thin + 2, Math.round(s * 0.15))), s * 0.95);
    const nearestRow = (cy: number) => {
      let best = 0;
      for (let r = 1; r < 6; r++) if (Math.abs(sys.rows[r] - cy) < Math.abs(sys.rows[best] - cy)) best = r;
      return best;
    };

    const bars: number[] = [];
    const pipes: { cx: number; row: number; c: Comp }[] = [];
    const glyphs: Omit<TabToken, 'pieces'>[] = [];
    for (const c of comps) {
      const cw = c.x1 - c.x0 + 1;
      const ch = c.y1 - c.y0 + 1;
      const cx = (c.x0 + c.x1) / 2;
      const cy = (c.y0 + c.y1) / 2;
      // Drawn bar line spanning (most of) the system.
      if (cw <= Math.max(3, s * 0.2) && ch >= s * 3 && c.y0 <= sys.rows[1] && c.y1 >= sys.rows[4]) {
        bars.push(cx);
        continue;
      }
      if (ch < s * 0.3 || ch > s * 1.15) continue; // dashes, specks, big clef / time signature glyphs
      const row = nearestRow(cy);
      if (Math.abs(sys.rows[row] - cy) > s * 0.32) continue; // stems, beams, text between strings
      if (cw <= Math.max(3, s * 0.16) && ch >= s * 0.5) pipes.push({ cx, row, c });
      else glyphs.push({ ...c, row });
    }
    // `|` characters stacked over ≥ 4 strings form an ASCII bar line; lone ones are glyphs (a "1").
    pipes.sort((a, b) => a.cx - b.cx);
    const used = new Set<number>();
    for (let i = 0; i < pipes.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      for (let j = i + 1; j < pipes.length && pipes[j].cx - pipes[i].cx <= s * 0.3; j++) group.push(j);
      const rowsHit = new Set(group.map((k) => pipes[k].row));
      if (rowsHit.size >= 4) {
        bars.push(median(group.map((k) => pipes[k].cx)));
        group.forEach((k) => used.add(k));
      }
    }
    // A real bar line never touches a fret number; a cursor drawn through one does (and was cut out of it).
    const nearGlyph = (cx: number) => [...glyphs, ...pipes.map((p) => p.c)].some((g) => g.x0 - s * 0.25 <= cx && g.x1 + s * 0.25 >= cx);
    for (const cx of vLines) if (!nearGlyph(cx)) bars.push(cx);
    // Faint drawn bar lines (only in the low-contrast map): columns covering the whole system.
    if (src.lines) {
      const covered = (x: number) => {
        let n = 0;
        for (let y = yTop; y <= yBot; y++) n += src.lines![y * w + x];
        return n >= (yBot - yTop + 1) * 0.92;
      };
      for (let x = 0; x < w; ) {
        if (!covered(x)) {
          x++;
          continue;
        }
        let e = x;
        while (e < w && covered(e)) e++;
        const cx = (x + e - 1) / 2;
        const throughGlyph = nearGlyph(cx);
        if (e - x <= Math.max(3, s * 0.2) && !throughGlyph && !bars.some((b) => Math.abs(b - cx) < s * 0.5)) bars.push(cx);
        x = e;
      }
    }
    bars.sort((a, b) => a - b);
    // Lone `|` next to a bar line is that bar drawn a character off on one string, not a "1".
    pipes.forEach((p, i) => !used.has(i) && !bars.some((b) => Math.abs(b - p.cx) <= s * 0.8) && glyphs.push({ ...p.c, row: p.row }));
    const dedupBars = bars.filter((b, i) => i === 0 || b - bars[i - 1] > s * 0.5);

    // Fret numbers share one size; much taller glyphs are time signatures, clefs or titles.
    const typicalH = median(glyphs.map((g) => g.y1 - g.y0 + 1));
    for (let i = glyphs.length - 1; i >= 0; i--) if (glyphs[i].y1 - glyphs[i].y0 + 1 > typicalH * 1.5) glyphs.splice(i, 1);

    // 3. string labels (e B G D A E) sit just left of the first bar line.
    const firstBar = dedupBars[0];
    const kept = firstBar == null ? glyphs : glyphs.filter((g) => !(g.x1 < firstBar && firstBar - g.x1 <= s * 1.6));

    // 4. merge neighbours on the same string into tokens.
    const tokens: TabToken[] = [];
    for (let r = 0; r < 6; r++) {
      const onRow = kept.filter((g) => g.row === r).sort((a, b) => a.x0 - b.x0);
      for (const g of onRow) {
        const last = tokens.length ? tokens[tokens.length - 1] : null;
        const crossesBar = last && dedupBars.some((b) => b > last.x1 && b < g.x0);
        if (last && last.row === r && g.x0 - last.x1 <= s * 0.18 && !crossesBar) {
          last.x0 = Math.min(last.x0, g.x0);
          last.x1 = Math.max(last.x1, g.x1);
          last.pieces++;
          last.y0 = Math.min(last.y0, g.y0);
          last.y1 = Math.max(last.y1, g.y1);
        } else tokens.push({ x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, row: r, pieces: 1 });
      }
    }
    if (!tokens.length && !dedupBars.length) continue;
    const xs = [...tokens.flatMap((t) => [t.x0, t.x1]), ...dedupBars];
    layouts.push({ rows: sys.rows, spacing: s, bars: dedupBars, tokens, left: Math.min(...xs), right: Math.max(...xs) });
  }
  return { systems: layouts, clean: bm };
}

const LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

/** Keeps the characters an ASCII tab token may contain. */
export const cleanToken = (t: string) => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/[^0-9hpbrx/\\~<>]/g, '');

/**
 * Writes the systems as ASCII tab. `texts[i]` is the recognised text of the i-th token across all
 * systems (in `systems[].tokens` order). Notes closer than ~0.4 line spacing form one column (a chord);
 * the gaps between columns follow the image so the parser can recover the rhythm.
 */
export function layoutToAscii(systems: TabSystemLayout[], texts: string[]): string {
  let k = 0;
  const blocks: string[] = [];
  for (const sys of systems) {
    const toks = sys.tokens.map((t) => ({ ...t, text: cleanToken(texts[k++] ?? '') })).filter((t) => t.text);
    if (!toks.length) continue;
    const s = sys.spacing;
    // Bar boundaries: detected bar lines, else one bar around everything.
    const edges = sys.bars.length ? [...sys.bars] : [];
    const minX = Math.min(...toks.map((t) => t.x0));
    const maxX = Math.max(...toks.map((t) => t.x1));
    if (!edges.length || edges[0] > minX) edges.unshift(Math.min(minX - s * 0.6, edges[0] ?? Infinity));
    if (edges[edges.length - 1] < maxX) edges.push(maxX + s * 0.6);
    const unit = s * 0.32;
    const lines = LABELS.map((l) => `${l}|`);
    const barToks = (b: number) => toks.filter((t) => (t.x0 + t.x1) / 2 > edges[b] && (t.x0 + t.x1) / 2 < edges[b + 1]).sort((a, c) => a.x0 - c.x0);
    // Space before the first note of a bar is normally small; a clef / time signature makes it huge.
    const leads = edges.slice(0, -1).map((e, b) => (barToks(b)[0]?.x0 ?? Infinity) - e).filter(Number.isFinite);
    const typicalLead = Math.max(s * 0.4, median(leads));
    for (let b = 0; b + 1 < edges.length; b++) {
      const inBar = barToks(b);
      if (inBar.length && inBar[0].x0 - edges[b] > typicalLead * 2) edges[b] = inBar[0].x0 - typicalLead;
      // Columns: tokens whose left edges are close share a column.
      const cols: { x: number; items: typeof inBar }[] = [];
      for (const t of inBar) {
        const c = cols[cols.length - 1];
        if (c && t.x0 - c.x < s * 0.4) c.items.push(t);
        else cols.push({ x: t.x0, items: [t] });
      }
      const cells = LABELS.map(() => [] as string[]);
      let pos = 1;
      const place = (row: number, at: number, text: string) => {
        while (cells[row].length < at) cells[row].push('-');
        cells[row].push(...text);
      };
      for (const c of cols) {
        const want = Math.max(pos, Math.round((c.x - edges[b]) / unit));
        const width = Math.max(...c.items.map((t) => t.text.length));
        for (const t of c.items) place(t.row, want, t.text);
        pos = want + width + 1;
      }
      const barLen = Math.max(pos + 1, Math.round((edges[b + 1] - edges[b]) / unit));
      for (let r = 0; r < 6; r++) {
        while (cells[r].length < barLen) cells[r].push('-');
        lines[r] += `${cells[r].join('')}|`;
      }
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

/* ---------- zero check by shape ---------- */

/** Column runs of ink inside a box: the separate glyphs of a token ("16" → 2 boxes). */
export function splitGlyphs(bm: Bitmap, b: Box): Box[] {
  const out: Box[] = [];
  let start = -1;
  for (let x = b.x0; x <= b.x1 + 1; x++) {
    let ink = false;
    if (x <= b.x1) for (let y = b.y0; y <= b.y1 && !ink; y++) ink = !!bm.data[y * bm.width + x];
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      let y0 = b.y1;
      let y1 = b.y0;
      for (let y = b.y0; y <= b.y1; y++) {
        for (let xx = start; xx < x; xx++) {
          if (bm.data[y * bm.width + xx]) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      }
      out.push({ x0: start, x1: x - 1, y0, y1 });
      start = -1;
    }
  }
  return out;
}

/** Enclosed background regions (holes) of a glyph, as boxes relative to the glyph (0..1). */
export function glyphHoles(bm: Bitmap, g: Box): { cx: number; cy: number; w: number; h: number; area: number }[] {
  const w = g.x1 - g.x0 + 1;
  const h = g.y1 - g.y0 + 1;
  if (w < 3 || h < 3) return [];
  const seen = new Uint8Array(w * h);
  const ink = (x: number, y: number) => !!bm.data[(g.y0 + y) * bm.width + g.x0 + x];
  const fill = (sx: number, sy: number) => {
    const st = [sx, sy];
    seen[sy * w + sx] = 1;
    let x0 = sx;
    let x1 = sx;
    let y0 = sy;
    let y1 = sy;
    let area = 0;
    let border = false;
    while (st.length) {
      const y = st.pop()!;
      const x = st.pop()!;
      area++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || ink(nx, ny)) continue;
        seen[ny * w + nx] = 1;
        st.push(nx, ny);
      }
    }
    return { border, area, x0, x1, y0, y1 };
  };
  const holes: { cx: number; cy: number; w: number; h: number; area: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || ink(x, y)) continue;
      const r = fill(x, y);
      if (r.border || r.area < Math.max(2, w * h * 0.01)) continue;
      holes.push({ cx: (r.x0 + r.x1 + 1) / 2 / w, cy: (r.y0 + r.y1 + 1) / 2 / h, w: (r.x1 - r.x0 + 1) / w, h: (r.y1 - r.y0 + 1) / h, area: r.area / (w * h) });
    }
  }
  return holes;
}

/**
 * True when a glyph is shaped like a zero: one tall, centred hole (plain or dotted zero), or two
 * side-by-side halves (slashed zero). A 6 / 9 has its hole low / high, an 8 two stacked holes.
 */
export function zeroLike(bm: Bitmap, g: Box): boolean {
  const holes = glyphHoles(bm, g).filter((o) => o.h > 0.15);
  if (!holes.length || holes.length > 2) return false;
  const top = Math.min(...holes.map((o) => o.cy - o.h / 2));
  const bottom = Math.max(...holes.map((o) => o.cy + o.h / 2));
  const tall = bottom - top >= 0.5;
  const centred = Math.abs((top + bottom) / 2 - 0.5) <= 0.12;
  const sideBySide = holes.length === 1 || Math.abs(holes[0].cy - holes[1].cy) < 0.2;
  return tall && centred && sideBySide;
}

/**
 * Corrects zeros OCR gets wrong (a dotted / slashed zero read as 6, 8, 9, or nothing): when the
 * token's glyphs and characters line up one to one, every zero-shaped glyph becomes '0'.
 */
export function fixZeros(bm: Bitmap, token: Box, text: string): string {
  const glyphs = splitGlyphs(bm, token);
  const chars = [...cleanToken(text)];
  if (!glyphs.length) return text;
  if (!chars.length) return glyphs.length === 1 && zeroLike(bm, glyphs[0]) ? '0' : text;
  if (chars.length !== glyphs.length) return chars.join('');
  return chars.map((c, i) => (/[0-9]/.test(c) && c !== '0' && zeroLike(bm, glyphs[i]) ? '0' : c)).join('');
}
