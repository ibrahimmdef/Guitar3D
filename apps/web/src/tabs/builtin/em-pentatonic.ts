import type { BuiltinLessonDef } from './types';

export const emPentatonic: BuiltinLessonDef = {
  id: 'em-pentatonic',
  title: 'Mi Minör Pentatonik Kutusu',
  level: 2,
  tempo: 76,
  source: 'original',
  goal: 'Açık pozisyonda Mi minör pentatonik gamı ezberlemek: sololarda en çok kullanılan kalıp.',
  description: 'Her telde iki nota: açık tel ve 2. ya da 3. perde. Altı telde çıkış, iniş ve küçük bir bitiriş cümlesi.',
  tip: '2. perdelere orta, 3. perdelere yüzük parmağını kullan; böylece el hiç kaymaz. Her tel değişiminde penayı aşağı-yukarı sırasını bozmadan sürdür.',
  bars: `
:8 0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3 |
0.2 3.2 0.1 3.1 3.1 0.1 3.2 0.2 |
2.3 0.3 2.4 0.4 2.5 0.5 3.6 0.6 |
0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3 |
0.2 3.2 0.1 3.1 3.1 0.1 3.2 0.2 |
2.3 0.3 2.4 0.4 2.5 0.5 3.6 0.6 |
0.1 3.2 0.2 2.3 0.3 2.4 0.4 2.5 |
0.6.1
`,
};
