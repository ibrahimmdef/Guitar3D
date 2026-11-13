/** Metadata of a built-in lesson. `level` runs from 1 (first day) to 5 (hard); the regular built-in set stays within 1–3, the packs go up to 5. */
export interface BuiltinLesson {
  id: string;
  /** Turkish display title. */
  title: string;
  level: 1 | 2 | 3 | 4 | 5;
  /** Target tempo in BPM (same as the \tempo of the alphaTex). */
  tempo: number;
  /** What the lesson trains, one short Turkish sentence. */
  goal: string;
  description: string;
  /** Practice tip shown next to the lesson. */
  tip: string;
  /** Where the material comes from: an exercise written for this app or a public-domain melody. */
  source: 'original' | 'public-domain';
  /** Library group; 'turkuler' = the Turkish folk-style pack, 'eserler' = the classical/traditional pieces pack. Missing = the regular lessons. */
  group?: 'turkuler' | 'eserler';
}

export interface BuiltinLessonDef extends BuiltinLesson {
  /** Bars only; the header (title, tempo, track, tuning) is generated from the metadata. */
  bars: string;
}

/** Builds the full alphaTex source of a lesson: standard tuning, 6 strings, 4/4. */
export function lessonTex(def: BuiltinLessonDef): string {
  return [
    `\\title "${def.title}"`,
    `\\subtitle "Guitar3D dersleri"`,
    `\\tempo ${def.tempo}`,
    '.',
    '\\track "Akustik Gitar"',
    '\\staff {tabs}',
    '\\tuning e4 b3 g3 d3 a2 e2',
    def.bars.trim(),
    '',
  ].join('\n');
}
