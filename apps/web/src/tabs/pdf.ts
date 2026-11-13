/**
 * PDF → tab text, in the browser. pdf.js is loaded on first use only.
 *  - Text PDFs (exported from a tab site or editor): the page text is rebuilt with its column layout;
 *    when it contains ASCII tab that text is used as is (fast and exact).
 *  - Scanned / drawn PDFs: each page is rendered and read like a screenshot (see ocr.ts).
 */
import { looksLikeAsciiTab } from './asciiTab';
import { itemsToText, type PdfTextItem } from './pdfText';

export interface PdfResult {
  text: string;
  /** 'text' = tab found in the PDF text; 'scan' = pages read as images; 'none' = nothing usable. */
  mode: 'text' | 'scan' | 'none';
  pages: number;
  /** Tab lines (systems) found when pages were read as images. */
  systems: number;
}

const MAX_PAGES = 12;

export async function readPdf(file: Blob, onProgress?: (p: number) => void): Promise<PdfResult> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);

    // 1. Text layer.
    const texts: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) });
      }
      texts.push(itemsToText(items));
      onProgress?.((i / pages) * 0.1);
    }
    const allText = texts.filter(Boolean).join('\n\n');
    if (looksLikeAsciiTab(allText)) return { text: allText, mode: 'text', pages, systems: 0 };

    // 2. Pages as images.
    const { ocrImage } = await import('./ocr');
    const found: string[] = [];
    let systems = 0;
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, 2200 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Sayfa görüntüye çevrilemedi.'))), 'image/png'));
      const at = 0.1 + ((i - 1) / pages) * 0.9;
      const out = await ocrImage(blob, (p) => onProgress?.(at + (p * 0.9) / pages));
      if (out.mode === 'layout' && out.text.trim()) {
        found.push(out.text);
        systems += out.systems;
      }
    }
    if (found.length) return { text: found.join('\n\n'), mode: 'scan', pages, systems };
    // No tab lines anywhere: give back whatever text the PDF had so the user can still edit it.
    return { text: allText, mode: 'none', pages, systems: 0 };
  } finally {
    void doc.destroy();
  }
}
