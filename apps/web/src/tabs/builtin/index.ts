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

/** Metadata of every built-in lesson, easiest first. */
export function listBuiltinLessons(): BuiltinLesson[] {
  return LESSONS.map(({ bars: _bars, ...meta }) => meta);
}

/** alphaTex source of a built-in lesson. Throws for an unknown id. */
export function loadBuiltinLesson(id: string): string {
  const def = LESSONS.find((l) => l.id === id);
  if (!def) throw new Error(`Bu ders bulunamadı: ${id}`);
  return lessonTex(def);
}
