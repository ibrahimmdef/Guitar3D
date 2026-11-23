import type { TabFormat } from '@guitar3d/shared';

/**
 * Title and artist of the text formats, read without loading the whole score. Binary Guitar Pro
 * files are read with alphaTab by the caller (screens/data.ts) and passed along.
 */
export interface TabInfo {
  title?: string;
  artist?: string;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

/** A string tag of alphaTex: `\title "Foo"` or `\title Foo`. */
function texTag(tex: string, tag: string) {
  const m = new RegExp(`\\\\${tag}\\s+(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^\\s\\\\|]+))`, 'i').exec(tex);
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v?.replace(/\\(.)/g, '$1').trim() || undefined;
}

export function extractTabInfo(data: ArrayBuffer, format: TabFormat | undefined): TabInfo {
  if (format === 'alphatex' || format === 'ascii') {
    const tex = new TextDecoder().decode(data);
    return { title: texTag(tex, 'title'), artist: texTag(tex, 'artist') };
  }
  if (format === 'musicxml') {
    const xml = new TextDecoder().decode(data.slice(0, 64 * 1024));
    const title = /<work-title>([^<]*)<\/work-title>/.exec(xml)?.[1] ?? /<movement-title>([^<]*)<\/movement-title>/.exec(xml)?.[1];
    const artist = /<creator[^>]*type="(?:artist|composer)"[^>]*>([^<]*)<\/creator>/.exec(xml)?.[1] ?? /<creator[^>]*>([^<]*)<\/creator>/.exec(xml)?.[1];
    return { title: title ? unescapeXml(title) || undefined : undefined, artist: artist ? unescapeXml(artist) || undefined : undefined };
  }
  return {};
}
