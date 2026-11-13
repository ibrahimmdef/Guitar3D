import { arpeggioPattern } from './arpeggio-pattern';
import { chromaticWarmup } from './chromatic-warmup';
import { emPentatonic } from './em-pentatonic';
import { frereJacques } from './frere-jacques';
import { hammerPull } from './hammer-pull';
import { morningWalk } from './morning-walk';
import { odeToJoy } from './ode-to-joy';
import { openChords } from './open-chords';
import { openStrings } from './open-strings';
import { twinkle } from './twinkle';
import { ESERLER } from './eserler';
import { TURKULER } from './turkuler';
import { lessonTex, type BuiltinLesson, type BuiltinLessonDef } from './types';

export type { BuiltinLesson } from './types';

/** Ordered from easiest to hardest; this is the order the library shows. */
const LESSONS: BuiltinLessonDef[] = [
  openStrings,
  chromaticWarmup,
  twinkle,
  frereJacques,
  odeToJoy,
  emPentatonic,
  arpeggioPattern,
  openChords,
  hammerPull,
  morningWalk,
];

const ALL = [...LESSONS, ...TURKULER, ...ESERLER];

/** Metadata of every built-in lesson: the regular lessons easiest first, then the "Türküler" and "Eserler" packs easiest first. */
export function listBuiltinLessons(): BuiltinLesson[] {
  return ALL.map(({ bars: _bars, ...meta }) => meta);
}

/** alphaTex source of a built-in lesson. Throws for an unknown id. */
export function loadBuiltinLesson(id: string): string {
  const def = ALL.find((l) => l.id === id);
  if (!def) throw new Error(`Bu ders bulunamadı: ${id}`);
  return lessonTex(def);
}
