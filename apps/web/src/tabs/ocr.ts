/**
 * Tab screenshot → ASCII text, in the browser.
 *
 * Main path: `tabImage.ts` finds the string lines, bar lines and fret-number glyphs; only those small
 * glyphs go to OCR (digits and technique letters, one batched pass over a grid of crops), then the tab is
 * rebuilt with the image's spacing. Works for ASCII-tab screenshots and for rendered tabs (numbers on
 * drawn lines, Guitar Pro / Songsterr style), light or dark.
 * Fallback (no six-line system found): plain full-text OCR plus `cleanOcrTab`.
 *
 * tesseract.js is loaded on first use; its worker, core and English model come from its CDN.
 */
import { analyzeTabImage, binarize, fixPullOff, fixZeros, layoutToAscii, zeroLike, type Bitmap, type TabToken } from './tabImage';

/** Characters that may appear in an ASCII tab. */
const WHITELIST = '0123456789-|hpbrsx/\\~()<>EADGBe:=*. ';
const GLYPHS = '0123456789hpbx/\\~<>';

export interface OcrResult {
  text: string;
  /** 'layout' = tab lines found and rebuilt; 'text' = plain OCR fallback. */
  mode: 'layout' | 'text';
  systems: number;
}

async function decode(img: ImageBitmap, factor = 1): Promise<{ canvas: HTMLCanvasElement; bitmap: Bitmap }> {
  // Small screenshots are upscaled (glyphs need ~20 px), huge photos are reduced for speed.
  const base = img.width < 1000 ? Math.min(3, 1400 / img.width) : img.width > 2600 ? 2600 / img.width : 1;
  const scale = Math.min(base * factor, 4200 / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const grey = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    hist[grey[i]]++;
  }
  // Tab notation is monochrome; strongly coloured pixels are a playback cursor or a highlight box
  // drawn over it, so they become background.
  let bg = 0;
  for (let t = 1; t < 256; t++) if (hist[t] > hist[bg]) bg = t;
  const sat = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b) > 100 ? 1 : 0;
  }
  // …including their anti-aliased edges (1–2 px around).
  const pad = Math.max(1, Math.round(w / 1400));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!sat[y * w + x]) continue;
      for (let dx = -pad; dx <= pad; dx++) if (x + dx >= 0 && x + dx < w) grey[y * w + x + dx] = bg;
    }
  }
  return { canvas, bitmap: binarize(grey, w, h) };
}

/** One token on its own white canvas; `hollow` clears the centre (dotted / slashed zeros). */
function tokenCanvas(clean: Bitmap, t: TabToken, scale: number, hollow: boolean) {
  const w = t.x1 - t.x0 + 1;
  const h = t.y1 - t.y0 + 1;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale) + 48;
  c.height = Math.ceil(h * scale) + 44;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  for (let y = t.y0; y <= t.y1; y++) {
    for (let x = t.x0; x <= t.x1; x++) {
      if (!clean.data[y * clean.width + x]) continue;
      const u = (x - t.x0) / w - 0.5;
      const v = (y - t.y0) / h - 0.5;
      if (hollow && (u / 0.22) ** 2 + (v / 0.2) ** 2 < 1) continue;
      ctx.fillRect(24 + (x - t.x0) * scale, 22 + (y - t.y0) * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }
  return c;
}

/** Lays the token crops out on a white grid canvas (black ink), one cell per token. */
function tokenSheet(clean: Bitmap, tokens: TabToken[]) {
  const target = 34;
  const hs = tokens.map((t) => t.y1 - t.y0 + 1).sort((a, b) => a - b);
  const scale = target / Math.max(1, hs[hs.length >> 1]);
  const cellW = Math.ceil(Math.max(...tokens.map((t) => t.x1 - t.x0 + 1)) * scale) + 48;
  const cellH = Math.ceil(Math.max(...hs) * scale) + 44;
  const perRow = Math.max(1, Math.min(tokens.length, Math.floor(2400 / cellW)));
  const canvas = document.createElement('canvas');
  canvas.width = perRow * cellW;
  canvas.height = Math.ceil(tokens.length / perRow) * cellH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  const cells = tokens.map((t, i) => {
    const cx = (i % perRow) * cellW;
    const cy = Math.floor(i / perRow) * cellH;
    const ox = cx + 24;
    const oy = cy + 22;
    for (let y = t.y0; y <= t.y1; y++) {
      for (let x = t.x0; x <= t.x1; x++) {
        if (clean.data[y * clean.width + x]) ctx.fillRect(ox + (x - t.x0) * scale, oy + (y - t.y0) * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
    return { x0: cx, y0: cy, x1: cx + cellW, y1: cy + cellH };
  });
  return { canvas, cells, scale };
}

export async function ocrImage(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const img = await createImageBitmap(image);
  let { canvas, bitmap } = await decode(img);
  let { systems, clean } = analyzeTabImage(bitmap);
  // Tiny tab (dense screenshot): read again at a size where a line gap is ~28 px.
  const gap = systems.length ? Math.min(...systems.map((s) => s.spacing)) : 0;
  if (gap && gap < 22) {
    ({ canvas, bitmap } = await decode(img, 28 / gap));
    ({ systems, clean } = analyzeTabImage(bitmap));
  }
  img.close();
  const tokens = systems.flatMap((s) => s.tokens);
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    if (tokens.length) {
      const sheet = tokenSheet(clean, tokens);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: GLYPHS });
      const { data } = await worker.recognize(sheet.canvas, {}, { blocks: true, text: true });
      const texts = tokens.map(() => '');
      const conf = tokens.map(() => 100);
      // Assign every recognised character by its own box: a "word" can span several cells.
      const symbols = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.flatMap((w) => w.symbols))));
      for (const sy of symbols) {
        const mx = (sy.bbox.x0 + sy.bbox.x1) / 2;
        const my = (sy.bbox.y0 + sy.bbox.y1) / 2;
        const i = sheet.cells.findIndex((c) => mx >= c.x0 && mx < c.x1 && my >= c.y0 && my < c.y1);
        if (i >= 0) {
          texts[i] += sy.text;
          conf[i] = Math.min(conf[i], sy.confidence);
        }
      }
      // Re-read on its own every cell the sparse pass missed or read with the wrong length
      // (stray characters, merged neighbours); a lone glyph that stays unreadable gets its centre
      // cleared once, which turns a dotted / slashed zero into a plain 0.
      const digits = (t: string) => t.replace(/[^0-9]/g, '').length;
      // …and every cell read with low confidence: alone it usually reads clearly, junk stays unsure.
      const suspect = texts.map((t, i) => (!t || digits(t) > tokens[i].pieces || conf[i] < 50 ? i : -1)).filter((i) => i >= 0).slice(0, 250);
      for (const i of suspect) {
        const t = tokens[i];
        await worker.setParameters({ tessedit_pageseg_mode: t.pieces > 1 ? PSM.SINGLE_WORD : PSM.SINGLE_CHAR });
        let r = (await worker.recognize(tokenCanvas(clean, t, sheet.scale, false))).data;
        if ((!r.text.trim() || digits(r.text) > t.pieces) && t.pieces === 1) r = (await worker.recognize(tokenCanvas(clean, t, sheet.scale, true))).data;
        // keep the sparse reading when the single read is not better
        const tooLong = digits(texts[i]) > t.pieces;
        if (r.text.trim() && (r.confidence >= conf[i] || !texts[i] || (tooLong && digits(r.text) <= t.pieces))) {
          texts[i] = r.text.trim();
          conf[i] = r.confidence;
        } else if (!r.text.trim() && !texts[i]) conf[i] = 0;
      }
      // OCR often misreads dotted / slashed zeros; check them by shape. Then drop what is not a fret
      // number: very unsure readings (clef letters, rests, flags) and tokens without a digit ("b", "h").
      texts.forEach((t, i) => {
        const fixed = fixPullOff(clean, tokens[i], fixZeros(clean, tokens[i], t));
        if (!/[0-9x]/.test(fixed)) {
          texts[i] = '';
          return;
        }
        // Real fret numbers read with confidence ≥ ~55 (zeros, often touched by ties, from ~30); flags and
        // clef letters read as other digits stay well below.
        const zeros = /^0+$/.test(fixed);
        // digit-letter-digit (5h7, 7p5, 7/9) almost never comes out of junk, but reads with low confidence
        const technique = /^\d+[hpbr/\\~]\d+$/.test(fixed);
        const sure = zeros ? conf[i] >= 30 || zeroLike(clean, tokens[i]) : technique ? conf[i] >= 15 : conf[i] >= 50;
        texts[i] = sure ? fixed : '';
      });
      const text = layoutToAscii(systems, texts);
      if (text.trim()) return { text, mode: 'layout', systems: systems.length };
    }
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: WHITELIST,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(canvas);
    return { text: cleanOcrTab(data.text), mode: 'text', systems: 0 };
  } finally {
    await worker.terminate();
  }
}

const LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

/**
 * Repairs typical OCR mistakes in tab text so the ASCII parser can read it:
 * long dashes and underscores → `-`, `I l ! ]` → `|`, `O o` → `0` between dashes, spaces inside a
 * tab line removed, a missing bar line after the string label added, and runs of 6 tab lines
 * without labels get e B G D A E. Lines that are not tab are kept as they are.
 */
export function cleanOcrTab(text: string): string {
  const rows = text.replace(/\r/g, '').split('\n').map(cleanLine);
  // Label 6-line runs that came out without string names.
  const isTab = (r: string) => /^[A-Ga-g]?\|/.test(r) && (r.match(/-/g) ?? []).length >= 3;
  for (let i = 0; i < rows.length; ) {
    if (!isTab(rows[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && isTab(rows[j])) j++;
    if (j - i === 6 && rows.slice(i, j).every((r) => r.startsWith('|'))) {
      for (let k = 0; k < 6; k++) rows[i + k] = LABELS[k] + rows[i + k];
    }
    i = j;
  }
  return rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanLine(raw: string): string {
  let s = raw.replace(/[‒-―−_—–=]/g, '-').replace(/[¦¦]/g, '|').trimEnd();
  const dashes = (s.match(/-/g) ?? []).length;
  if (dashes < 4 || dashes < s.replace(/\s/g, '').length * 0.35) return raw.trimEnd();
  s = s.trim();
  // Label: a leading letter (maybe followed by spaces / colon) → "e|".
  let label = '';
  const m = /^([A-Ga-g])\s*[|:Il!\]1\[]?\s*/.exec(s);
  if (m && s.length > 2) {
    label = m[1];
    s = s.slice(m[0].length);
  }
  s = s.replace(/\s+/g, '');
  s = s.replace(/[Il!\][]/g, '|');
  s = s.replace(/(?<=[-|])[Oo](?=[-|\d])/g, '0').replace(/(?<=[-|\d])[Oo](?=[-|])/g, '0');
  if (!s.startsWith('|')) s = `|${s}`;
  return label + s;
}
