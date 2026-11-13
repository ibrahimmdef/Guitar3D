import type { BuiltinLessonDef } from './types';

/**
 * "Türküler" pack: original études written for Guitar3D in Anatolian folk idioms (Hicaz, Kürdi,
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
    goal: 'Hicaz dizisinin artık ikilisini (Si bemol – Do diyez) kulakta ve parmakta oturtmak.',
    description: 'La Hicaz dizisinde dörtlüklerle çıkış ve iniş. Türkü havasında özgün bir etüt.',
    tip: 'Si bemolden Do diyeze geçerken aradaki boşluğu duy; bu adım Hicaz\'ın rengidir. Her notayı eşit uzunlukta çal.',
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
    goal: 'Birinci pozisyonda 1., 2. ve 3. tel arasında sakin bir ezgi çalmak.',
    description: 'La Kürdi renginde, yarım ve dörtlük notalarla yavaş bir ezgi. Özgün etüt.',
    tip: 'Yarım notalarda ikinci vuruşu içinden say. Son notayı tam dört vuruş tut.',
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
    goal: '2/4 ölçüde sekizliklerle oynak bir halay ritmi tutturmak.',
    description: 'Hüseyni havasında, iki vuruşluk ölçülerle kısa bir halay ezgisi. Özgün etüt.',
    tip: 'Ayağınla her ölçüde iki kez vur: "bir-ve-iki-ve". Sekizlikler eşit, dörtlükler tam bir vuruş.',
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
    goal: 'Açık La telini dem (sabit ses) olarak tutarken üst tellerde ezgi çalmak.',
    description: 'Bağlamadaki dem teli gibi: her ezgi notasının arasında açık 5. tel. Hicaz havasında özgün etüt.',
    tip: 'Açık teli hafif, ezgiyi biraz daha güçlü çal. Pena aşağı-yukarı düzenli gitsin: dem aşağı, ezgi yukarı.',
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
    goal: '9/8 aksak ölçüyü 2+2+2+3 gruplamasıyla saymak.',
    description: 'Hicaz havasında, uzun son vuruşlu 9/8 ezgi. Özgün etüt.',
    tip: '"Bir-ki, bir-ki, bir-ki, bir-ki-üç" diye say. Ölçünün son notası diğerlerinden yarım vuruş uzundur.',
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
    goal: '7/8 ölçüde (2+2+3) hızlı ve eşit sekizlikler çalmak.',
    description: 'Karadeniz horonu havasında, Kürdi renginde 7/8 bir etüt. Özgün parça.',
    tip: 'Önce %60 hızda "bir-ki, bir-ki, bir-ki-üç" diye say. Pena hep aşağı-yukarı, üçlü grupta da aksamadan devam et.',
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
    goal: 'Hammer-on ve pull-off ile türkülerdeki çarpma ve göçürme süslerini taklit etmek.',
    description: 'Hicaz dizisinde legato süslemeler. Bağlamadaki çarpmaları gitarda çalmak için özgün etüt.',
    tip: 'Süslü notanın ilkini penayla, ikincisini sadece sol elle çal. Yavaşta iki nota eşit yüksek duyulmalı.',
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
    goal: 'Akoru vurup aynı elle ezgiye geçmek; Am, Dm ve E akorlarıyla.',
    description: 'Nihavend renginde, her ölçü bir akorla başlar ve ezgiyle devam eder. Özgün etüt.',
    tip: 'Akoru vurduktan sonra parmakları kaldırmadan ezgi notalarına uzan. E akorundaki Sol diyez Nihavend\'in rengidir.',
    bars: `
:4 (0.5 2.4 2.3 1.2 0.1) 0.1 1.1 0.1 | (0.4 2.3 3.2 1.1) 1.1 3.2 1.2 | (0.6 2.5 2.4 1.3 0.2 0.1) 0.2 1.3 0.2 | :2 (0.5 2.4 2.3 1.2 0.1) :4 1.2 0.2 |
:4 (0.4 2.3 3.2 1.1) 0.1 1.1 3.2 | (0.5 2.4 2.3 1.2 0.1) 1.2 0.2 1.2 | (0.6 2.5 2.4 1.3 0.2 0.1) 1.3 0.2 1.3 | :1 (0.5 2.4 2.3 1.2 0.1)
`,
  }),
];
