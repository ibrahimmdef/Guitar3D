import type { BuiltinLessonDef } from './types';

export const openStrings: BuiltinLessonDef = {
  id: 'open-strings',
  title: 'Açık Teller',
  level: 1,
  tempo: 70,
  source: 'original',
  goal: 'Altı teli tanımak ve penayla tek tek, eşit vuruşlarla çalmak.',
  description: 'Sol el hiç basmaz. Her teli dörder kez çal, sonra teller arasında sırayla gez.',
  tip: 'Her notayı aşağı vuruşla çal ve metronomla say: 1-2-3-4. Bileğini köprüye hafifçe yasla, penayı tele sadece ucuyla değdir.',
  bars: `
:4 0.6 0.6 0.6 0.6 | 0.5 0.5 0.5 0.5 | 0.4 0.4 0.4 0.4 |
0.3 0.3 0.3 0.3 | 0.2 0.2 0.2 0.2 | 0.1 0.1 0.1 0.1 |
0.1 0.2 0.3 0.4 | 0.5 0.6 0.5 0.4 | 0.3 0.2 0.1 0.2 |
0.6.1
`,
};
