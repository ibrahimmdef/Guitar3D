export interface SectionMarker {
  marker: string;
  text: string;
}

export interface Section {
  /** Chip label: A, B, C … Z, A2, B2 … */
  label: string;
  /** Section name from the score (empty for generated phrases). */
  name: string;
  startBar: number;
  /** Inclusive. */
  endBar: number;
}

export function sectionLabel(i: number) {
  const letter = String.fromCharCode(65 + (i % 26));
  return i < 26 ? letter : `${letter}${Math.floor(i / 26) + 1}`;
}

/**
 * Sections from the score's section markers, or phrases of `phraseBars` bars when there are none.
 * Bars before the first marker become their own section.
 */
export function computeSections(masterBars: { section?: SectionMarker | null }[], phraseBars = 4): Section[] {
  const n = masterBars.length;
  if (n === 0) return [];
  const starts: { bar: number; name: string }[] = [];
  masterBars.forEach((mb, i) => {
    if (mb.section) starts.push({ bar: i, name: (mb.section.text || mb.section.marker || '').trim() });
  });
  if (starts.length === 0) {
    for (let b = 0; b < n; b += phraseBars) starts.push({ bar: b, name: '' });
  } else if (starts[0].bar > 0) {
    starts.unshift({ bar: 0, name: '' });
  }
  return starts.map((s, i) => ({
    label: sectionLabel(i),
    name: s.name,
    startBar: s.bar,
    endBar: (starts[i + 1]?.bar ?? n) - 1,
  }));
}

/** Index of the section containing `bar` (-1 when none). */
export function sectionAt(sections: Section[], bar: number) {
  return sections.findIndex((s) => bar >= s.startBar && bar <= s.endBar);
}

/** Index of the section after the one containing `bar`, wrapping to the first. */
export function nextSectionIndex(sections: Section[], bar: number) {
  if (sections.length === 0) return -1;
  return (sectionAt(sections, bar) + 1) % sections.length;
}
