/**
 * Tab screenshot → ASCII text. tesseract.js is loaded on first use only (dynamic import); its
 * worker, core and English model come from the tesseract.js CDN, so this needs a connection.
 */

/** Characters that may appear in an ASCII tab. */
const WHITELIST = '0123456789-|hpbrsx/\\~()<>EADGBe:=*. ';

export async function ocrImage(image: Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: WHITELIST,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(image);
    return cleanOcrTab(data.text);
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
