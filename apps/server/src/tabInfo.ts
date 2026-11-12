import type { TabFormat } from '@guitar3d/shared';

export interface TabInfo {
  title?: string;
  artist?: string;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

/** Reads a string metadata tag from alphaTex: `\title "Foo"` or `\title Foo`. */
function texTag(tex: string, tag: string) {
  const m = new RegExp(`\\\\${tag}\\s+(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^\\s\\\\|]+))`, 'i').exec(tex);
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v?.replace(/\\(.)/g, '$1').trim() || undefined;
}

/**
 * Cheap, dependency-free metadata extraction for the formats that are plain text.
 * Binary Guitar Pro files are parsed in the browser (alphaTab) which sends title/artist along with the upload.
 */
export function extractTabInfo(buf: Buffer, format: TabFormat | undefined): TabInfo {
  if (format === 'alphatex' || format === 'ascii') {
    const tex = buf.toString('utf8');
    return { title: texTag(tex, 'title'), artist: texTag(tex, 'artist') };
  }
  if (format === 'musicxml') {
    const xml = buf.subarray(0, 64 * 1024).toString('utf8');
    const title = /<work-title>([^<]*)<\/work-title>/.exec(xml)?.[1] ?? /<movement-title>([^<]*)<\/movement-title>/.exec(xml)?.[1];
    const artist =
      /<creator[^>]*type="(?:artist|composer)"[^>]*>([^<]*)<\/creator>/.exec(xml)?.[1] ?? /<creator[^>]*>([^<]*)<\/creator>/.exec(xml)?.[1];
    return { title: title ? unescapeXml(title) || undefined : undefined, artist: artist ? unescapeXml(artist) || undefined : undefined };
  }
  return {};
}
