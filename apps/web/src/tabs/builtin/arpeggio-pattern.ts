import type { BuiltinLessonDef } from './types';

export const arpeggioPattern: BuiltinLessonDef = {
  id: 'arpeggio-pattern',
  title: 'Arpej Kalıbı: Am - C - G - Em',
  level: 2,
  tempo: 72,
  source: 'original',
  goal: 'Akoru basılı tutarken telleri tek tek çalmak; sağ elde tel atlama.',
  description: 'Her ölçüde bir akor: bas notadan ince tellere çık ve geri dön. Akor şekli ölçü boyunca basılı kalır.',
  tip: 'Akorun tamamını ölçünün başında bas, notalar birbirinin üstüne çınlasın. Am\'den C\'ye geçerken işaret ve orta parmak yerinde kalır, sadece yüzük parmağı yer değiştirir.',
  bars: `
:8 0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 |
3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 |
3.6 0.4 0.3 0.2 3.1 0.2 0.3 0.4 |
0.6 2.5 2.4 0.3 0.2 0.3 2.4 2.5 |
0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 |
3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 |
3.6 0.4 0.3 0.2 3.1 0.2 0.3 0.4 |
(0.5 2.4 2.3 1.2 0.1).1
`,
};
