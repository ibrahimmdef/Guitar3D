import type { BuiltinLessonDef } from './types';

export const hammerPull: BuiltinLessonDef = {
  id: 'hammer-pull',
  title: 'Hammer-on ve Pull-off Çalışması',
  level: 3,
  tempo: 72,
  source: 'original',
  goal: 'Penayla bir kez vurup ikinci notayı sadece sol elle seslendirmek (legato).',
  description: 'Önce açık telden hammer-on, sonra açık tele pull-off, en sonda basılı notalar arasında ikisi birden.',
  tip: 'Hammer-on\'da parmağı perdenin hemen arkasına çekiç gibi indir. Pull-off\'ta parmağı düz kaldırma; teli hafifçe aşağı doğru çekerek bırak. İki notanın sesi eşit olana kadar yavaş çal.',
  bars: `
:8 0.1{h} 2.1 0.1{h} 3.1 0.2{h} 1.2 0.2{h} 3.2 |
0.3{h} 2.3 0.4{h} 2.4 0.5{h} 2.5 0.6{h} 3.6 |
3.1{h} 0.1 2.1{h} 0.1 3.2{h} 0.2 1.2{h} 0.2 |
2.3{h} 0.3 2.4{h} 0.4 2.5{h} 0.5 3.6{h} 0.6 |
2.3{h} 4.3 4.3{h} 2.3 2.4{h} 4.4 4.4{h} 2.4 |
(0.6 2.5 2.4).1
`,
};
