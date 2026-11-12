import type { BuiltinLessonDef } from './types';

export const chromaticWarmup: BuiltinLessonDef = {
  id: 'chromatic-warmup',
  title: 'Kromatik Isınma 1-2-3-4',
  level: 1,
  tempo: 66,
  source: 'original',
  goal: 'Her parmağa bir perde: sol el parmak bağımsızlığı ve iki elin eşzamanlaması.',
  description: '1., 2., 3. ve 4. perdeleri sırayla işaret, orta, yüzük ve serçe parmakla bas; kalın telden inceye çık, sonra geri in.',
  tip: 'Parmakları telden en fazla 1 cm kaldır ve bastığın parmağı sıradaki nota çalana kadar yerinde tut. Penayı aşağı-yukarı sırayla kullan.',
  bars: `
:8 1.6 2.6 3.6 4.6 1.5 2.5 3.5 4.5 |
1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 |
1.2 2.2 3.2 4.2 1.1 2.1 3.1 4.1 |
4.1 3.1 2.1 1.1 4.2 3.2 2.2 1.2 |
4.3 3.3 2.3 1.3 4.4 3.4 2.4 1.4 |
4.5 3.5 2.5 1.5 4.6 3.6 2.6 1.6 |
1.6.1
`,
};
