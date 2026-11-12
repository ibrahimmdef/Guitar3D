import type { BuiltinLessonDef } from './types';

/** Traditional melody (public domain), in C major on the two thinnest strings. */
export const twinkle: BuiltinLessonDef = {
  id: 'twinkle',
  title: 'Daha Dün Annemizin (Twinkle Twinkle)',
  level: 1,
  tempo: 80,
  source: 'public-domain',
  goal: 'İlk melodi: iki tel üzerinde nota bulmak ve dörtlük-ikilik ritmi saymak.',
  description: 'Herkesin bildiği geleneksel çocuk şarkısı. Sadece 1. ve 2. teli kullanır.',
  tip: '1. perdeye işaret, 3. perdeye yüzük parmağını koy; 5. perdedeki La için eli kaydırmadan serçe parmağını uzat. İkilik notaları iki vuruş boyunca tut.',
  bars: `
:4 1.2 1.2 3.1 3.1 | 5.1 5.1 3.1.2 |
1.1.4 1.1.4 0.1.4 0.1.4 | 3.2.4 3.2.4 1.2.2 |
3.1.4 3.1.4 1.1.4 1.1.4 | 0.1.4 0.1.4 3.2.2 |
3.1.4 3.1.4 1.1.4 1.1.4 | 0.1.4 0.1.4 3.2.2 |
1.2.4 1.2.4 3.1.4 3.1.4 | 5.1.4 5.1.4 3.1.2 |
1.1.4 1.1.4 0.1.4 0.1.4 | 3.2.4 3.2.4 1.2.2
`,
};
