import type { BuiltinLessonDef } from './types';

/**
 * "Türküler" (Turkish folk) pack: original études written for Guitar3D in Anatolian folk idioms (Hicaz, Kürdi,
 * Nihavend sounds; halay, horon and 9/8 aksak rhythms). No transcriptions of existing songs and
 * no lyrics. Played in 12-tone tuning, so the makam colours are approximations.
 */
const t = (d: Omit<BuiltinLessonDef, 'source' | 'group'>): BuiltinLessonDef => ({ ...d, source: 'original', group: 'turkuler' });

export const TURKULER: BuiltinLessonDef[] = [
  t({
    id: 'turku-hicaz-basamaklari',
    title: 'Hicaz Basamakları',
    level: 1,
    tempo: 66,
    goal: 'Get the augmented second of the Hicaz scale (B flat – C sharp) into your ear and fingers.',
    description: 'Ascending and descending in quarter notes on the A Hicaz scale. An original étude in Turkish folk style.',
    tip: 'Listen to the gap when moving from B flat to C sharp; this step is the color of Hicaz. Play every note the same length.',
    bars: `
:4 2.3 3.3 2.2 3.2 | 0.1 1.1 3.1 5.1 | 5.1 3.1 1.1 0.1 | 3.2 2.2 3.3 2.3 |
2.3 3.3 2.2 3.3 | 2.2 3.2 0.1 3.2 | 2.2 3.3 2.2 3.3 | :1 2.3
`,
  }),
  t({
    id: 'turku-kurdi-ezgi',
    title: 'Kürdi Ezgi',
    level: 1,
    tempo: 72,
    goal: 'Play a calm melody across the 1st, 2nd and 3rd strings in first position.',
    description: 'A slow melody in half and quarter notes with an A Kürdi color. Original étude.',
    tip: 'Count the second beat silently on the half notes. Hold the last note for a full four beats.',
    bars: `
:4 0.1 0.1 1.1 0.1 | 3.2 1.2 :2 3.2 | :4 1.2 3.2 1.2 3.3 | :2 2.3 2.3 |
:4 0.1 1.1 3.1 1.1 | 0.1 3.2 1.2 3.2 | 1.2 3.3 1.2 3.3 | :1 2.3
`,
  }),
  t({
    id: 'turku-halay-adimi',
    title: 'Halay Adımı',
    level: 2,
    tempo: 96,
    goal: 'Lock in a lively halay rhythm with eighth notes in 2/4.',
    description: 'A short halay tune in two-beat bars in a Hüseyni mood. Original étude.',
    tip: 'Tap your foot twice per bar: "one-and-two-and". Eighths even, quarters a full beat.',
    bars: `
\\ts 2 4 :8 2.3 2.3 0.2 1.2 | 3.2 1.2 :4 0.2 | :8 3.2 3.2 0.1 3.2 | 1.2 0.2 :4 2.3 |
:8 0.1 2.1 3.1 2.1 | 0.1 3.2 1.2 0.2 | 1.2 0.2 2.3 0.2 | :2 2.3
`,
  }),
  t({
    id: 'turku-dem-teli',
    title: 'Bağlama Havası: Dem Teli',
    level: 3,
    tempo: 80,
    goal: 'Play a melody on the upper strings while holding the open A string as a drone.',
    description: 'Like the drone string of the bağlama: the open 5th string between every melody note. Original étude in Hicaz mood.',
    tip: 'Play the open string softly and the melody a little louder. Keep the pick going down-up steadily: drone down, melody up.',
    bars: `
:8 0.5 2.3 0.5 3.3 0.5 2.2 0.5 3.3 | 0.5 2.3 0.5 3.3 0.5 2.3 0.5 0.3 | 0.5 3.2 0.5 2.2 0.5 3.2 0.5 0.1 | 0.5 3.2 0.5 2.2 0.5 3.3 0.5 2.3 |
0.5 0.1 0.5 1.1 0.5 0.1 0.5 3.2 | 0.5 2.2 0.5 3.2 0.5 2.2 0.5 3.3 | 0.5 2.3 0.5 3.3 0.5 2.2 0.5 3.3 | :2 (0.5 2.3) (0.5 2.3)
`,
  }),
  t({
    id: 'turku-dokuz-sekiz',
    title: 'Dokuz Sekizlik Aksak',
    level: 3,
    tempo: 72,
    goal: 'Count the 9/8 aksak meter grouped 2+2+2+3.',
    description: 'A 9/8 tune with a long last beat in Hicaz mood. Original étude.',
    tip: 'Count "one-two, one-two, one-two, one-two-three". The last note of the bar is half a beat longer than the others.',
    bars: `
\\ts 9 8 :4 2.3 2.2 3.2 0.1{d} | :4 1.1 0.1 3.2 2.2{d} | :8 0.1 1.1 0.1 3.2 2.2 3.2 2.2 3.3 2.3 | :4 3.3 2.2 3.3 2.3{d} |
:4 2.3 2.2 3.2 0.1{d} | :4 1.1 3.1 1.1 0.1{d} | :8 3.2 0.1 3.2 2.2 3.3 2.2 3.3 2.3 0.3 | :4 2.3 2.3 2.3 2.3{d}
`,
  }),
  t({
    id: 'turku-horon-adimi',
    title: 'Horon Adımı',
    level: 4,
    tempo: 100,
    goal: 'Play fast, even eighth notes in 7/8 (2+2+3).',
    description: 'A 7/8 étude in the style of the Black Sea horon, with a Kürdi color. Original piece.',
    tip: 'Count "one-two, one-two, one-two-three" at 60% speed first. Keep the pick going down-up and don\'t stumble on the group of three.',
    bars: `
\\ts 7 8 :8 0.1 1.1 0.1 3.2 1.2 3.2 0.1 | 1.1 3.1 1.1 0.1 3.2 1.2 3.2 | :4 0.1 3.2 1.2{d} | :8 3.2 1.2 3.3 1.2 3.3 2.3 0.3 |
:8 0.1 1.1 0.1 3.2 1.2 3.2 0.1 | 3.1 1.1 0.1 3.2 1.2 3.3 1.2 | :4 3.3 1.2 2.3{d} | :4 2.3 0.3 2.3{d}
`,
  }),
  t({
    id: 'turku-hicaz-susleme',
    title: 'Hicaz Süslemeleri',
    level: 4,
    tempo: 76,
    goal: 'Imitate the grace-note ornaments of Turkish folk music with hammer-ons and pull-offs.',
    description: 'Legato ornaments on the Hicaz scale. An original étude for playing bağlama-style ornaments on guitar.',
    tip: 'Pick the first note of the ornament and sound the second with the fretting hand only. At slow speed both notes should sound equally loud.',
    bars: `
:8 2.3{h} 3.3 2.3 0.3 2.3{h} 3.3 2.2 3.3 | 2.2{h} 3.2 2.2 3.3 2.3 3.3 2.2 3.2 | 0.1{h} 1.1 0.1 3.2 2.2{h} 3.2 2.2 3.3 | :2 2.3 :4 3.3 2.3 |
:8 1.1{h} 3.1 1.1{h} 0.1 3.2{h} 2.2 3.3{h} 2.3 | 0.1{h} 1.1 3.1{h} 1.1 0.1 3.2{h} 2.2 3.2 | 2.2{h} 3.2 2.2 3.3{h} 2.3 0.3 2.3 3.3 | :1 2.3
`,
  }),
  t({
    id: 'turku-nihavend-akor',
    title: 'Nihavend: Akor ve Ezgi',
    level: 4,
    tempo: 70,
    goal: 'Strum the chord and move to the melody with the same hand, using Am, Dm and E.',
    description: 'In a Nihavend color, every bar starts with a chord and continues with the melody. Original étude.',
    tip: 'After strumming the chord, reach for the melody notes without lifting your fingers. The G sharp in the E chord is the color of Nihavend.',
    bars: `
:4 (0.5 2.4 2.3 1.2 0.1) 0.1 1.1 0.1 | (0.4 2.3 3.2 1.1) 1.1 3.2 1.2 | (0.6 2.5 2.4 1.3 0.2 0.1) 0.2 1.3 0.2 | :2 (0.5 2.4 2.3 1.2 0.1) :4 1.2 0.2 |
:4 (0.4 2.3 3.2 1.1) 0.1 1.1 3.2 | (0.5 2.4 2.3 1.2 0.1) 1.2 0.2 1.2 | (0.6 2.5 2.4 1.3 0.2 0.1) 1.3 0.2 1.3 | :1 (0.5 2.4 2.3 1.2 0.1)
`,
  }),
];
