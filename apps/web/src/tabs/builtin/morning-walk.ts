import type { BuiltinLessonDef } from './types';

/** Short melody written for this app (A minor, first five frets). */
export const morningWalk: BuiltinLessonDef = {
  id: 'morning-walk',
  title: 'Sabah Yürüyüşü',
  level: 3,
  tempo: 88,
  source: 'original',
  goal: 'Öğrenilenleri bir melodide birleştirmek: tel geçişleri, karışık ritim ve ilk beş perde.',
  description: 'La minörde sekiz ölçülük özgün bir melodi. Dörtlük, sekizlik ve ikilik notalar bir arada.',
  tip: 'Önce ritmi el çırparak say, sonra çal. 6. ölçüdeki 5. perde için serçe parmağını uzat; 7. ölçüdeki Sol diyez (3. tel 1. perde) melodiye minör rengini verir, işaret parmağıyla bas.',
  bars: `
:4 2.3 1.2 0.1 1.2 |
3.2.8 0.1.8 1.1.4 0.1.2 |
3.1.4 0.1.4 3.2.8 1.2.8 0.2.4 |
2.3.2 2.4.2 |
2.3.4 1.2.4 0.1.4 3.1.4 |
5.1.8 3.1.8 1.1.4 0.1.2 |
3.2.8 0.1.8 3.2.8 1.2.8 0.2.4 1.3.4 |
2.3.1
`,
};
