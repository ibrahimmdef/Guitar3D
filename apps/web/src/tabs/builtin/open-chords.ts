import type { BuiltinLessonDef } from './types';

export const openChords: BuiltinLessonDef = {
  id: 'open-chords',
  title: 'Akor Geçişleri: C - G - Am - F',
  level: 3,
  tempo: 70,
  source: 'original',
  goal: 'Dört temel akor arasında ritmi bozmadan geçmek.',
  description: 'Binlerce şarkının dayandığı C - G - Am - F dizisi. Önce her akor iki kez, sonra ölçü içinde akor değişimi. F burada küçük (dört telli) haliyle çalınır.',
  tip: 'Geçişten bir vuruş önce parmakları kaldırıp yeni şekli havada hazırla. C ve Am arasında işaret ve orta parmak ortaktır; F\'de işaret parmağıyla 1. ve 2. teli birlikte bas.',
  bars: `
:2 (3.5 2.4 0.3 1.2 0.1) (3.5 2.4 0.3 1.2 0.1) |
(3.6 2.5 0.4 0.3 0.2 3.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(0.5 2.4 2.3 1.2 0.1) (0.5 2.4 2.3 1.2 0.1) |
(3.4 2.3 1.2 1.1) (3.4 2.3 1.2 1.1) |
(3.5 2.4 0.3 1.2 0.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(0.5 2.4 2.3 1.2 0.1) (3.4 2.3 1.2 1.1) |
(3.5 2.4 0.3 1.2 0.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(3.5 2.4 0.3 1.2 0.1).1
`,
};
