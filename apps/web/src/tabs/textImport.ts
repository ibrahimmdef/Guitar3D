import { asciiTabToAlphaTex, type AsciiTabResult } from './asciiTab';

/** Parses the text; returns the result or the error message. */
export function convertAscii(text: string, tempo?: number): AsciiTabResult | string {
  if (!text.trim()) return '';
  try {
    return asciiTabToAlphaTex(text, tempo ? { tempo } : {});
  } catch (e) {
    return (e as Error).message;
  }
}

/** Replaces or inserts the \title line. */
export function withTitle(tex: string, title: string) {
  if (!title) return tex;
  const line = `\\title "${title.replace(/["\\]/g, '')}"`;
  return /^\\title .*$/m.test(tex) ? tex.replace(/^\\title .*$/m, line) : `${line}\n${tex}`;
}
