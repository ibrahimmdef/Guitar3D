/**
 * Video-free course: levels 1–5 of short lessons. Each lesson is a few lines of Turkish text, a
 * demonstration on the 3D guitar and an exercise (checked by the microphone where it can be).
 * All text is written for this app; melodies come from the built-in lessons (original exercises
 * and public-domain tunes, no lyrics).
 */

export interface Pos {
  /** Tab string, 1 = high e. */
  string: number;
  fret: number;
}

export type Demo =
  | { kind: 'notes'; notes: Pos[] }
  | { kind: 'chord'; chord: string }
  | { kind: 'strum'; patternId: string; chord: string };

export type Exercise =
  /** Play these notes in order; the microphone follows along. */
  | { kind: 'play'; notes: Pos[]; prompt: string }
  /** Play the chord one string at a time (low to high); the microphone checks every string. */
  | { kind: 'arpeggio'; chord: string; prompt: string }
  /** Open a built-in lesson in the player. */
  | { kind: 'lesson'; lessonId: string; prompt: string }
  /** Practise on another screen (rhythm, chord trainer, tuner, games), then mark it done. */
  | { kind: 'screen'; route: 'rhythm' | 'chord-trainer' | 'tuner' | 'fretboard-game' | 'ear'; patternId?: string; chords?: [string, string]; prompt: string };

export interface CourseLesson {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  /** Two to four short paragraphs. */
  text: string[];
  demo: Demo;
  exercise: Exercise;
}

export const LEVEL_TITLES: Record<number, string> = {
  1: 'İlk adımlar',
  2: 'İlk akorlar ve ritim',
  3: 'Akorları bağlamak',
  4: 'Gam ve teknik',
  5: 'Bare ve ileri ritim',
};

const OPEN: Pos[] = [6, 5, 4, 3, 2, 1].map((string) => ({ string, fret: 0 }));
const EM_PENTA: Pos[] = [
  { string: 6, fret: 0 }, { string: 6, fret: 3 }, { string: 5, fret: 0 }, { string: 5, fret: 2 },
  { string: 4, fret: 0 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 3, fret: 2 },
  { string: 2, fret: 0 }, { string: 2, fret: 3 }, { string: 1, fret: 0 }, { string: 1, fret: 3 },
];

export const COURSE: CourseLesson[] = [
  /* ---------- Level 1 ---------- */
  {
    id: 'c1-strings',
    level: 1,
    title: 'Teller ve perdeler',
    text: [
      'Gitarın altı teli var. En kalın tel 6. tel, en ince tel 1. teldir. Tab okurken de bu numaraları kullanırız.',
      'Standart akortta kalından inceye teller Mi, La, Re, Sol, Si, Mi notalarını verir. Akılda kalsın diye kendi cümleni kur: harflerin sırası yeter.',
      'Gitarda teller sırayla yanıp sönecek. Sonra sen de her teli tek tek, kalından inceye çal.',
    ],
    demo: { kind: 'notes', notes: OPEN },
    exercise: { kind: 'play', notes: OPEN, prompt: 'Boş telleri 6. telden 1. tele doğru tek tek çal.' },
  },
  {
    id: 'c1-tune',
    level: 1,
    title: 'Önce akort',
    text: [
      'Akortsuz bir gitarla doğru çalsan bile kulağa yanlış gelir. Her çalışmaya akortla başla.',
      'Akort ekranında bir teli çal, ibre ortaya gelene kadar burguyu yavaşça çevir. Ses pesse sık, tizse gevşet.',
    ],
    demo: { kind: 'notes', notes: OPEN },
    exercise: { kind: 'screen', route: 'tuner', prompt: 'Akort ekranında altı teli de akort et, sonra buraya dön.' },
  },
  {
    id: 'c1-first-notes',
    level: 1,
    title: 'İlk basılı notalar',
    text: [
      'Bir perdeye basarken parmak ucunu perde telinin hemen arkasına koy. Tam telin üstüne ya da perdenin ortasına basarsan ses cızırdar.',
      '1. telde boş Mi, 1. perdede Fa, 3. perdede Sol vardır. 1. perdeye işaret, 3. perdeye yüzük parmağını kullan.',
    ],
    demo: { kind: 'notes', notes: [{ string: 1, fret: 0 }, { string: 1, fret: 1 }, { string: 1, fret: 3 }, { string: 1, fret: 1 }, { string: 1, fret: 0 }] },
    exercise: { kind: 'play', notes: [{ string: 1, fret: 0 }, { string: 1, fret: 1 }, { string: 1, fret: 3 }, { string: 1, fret: 1 }, { string: 1, fret: 0 }], prompt: 'Mi – Fa – Sol – Fa – Mi: her notayı net çal.' },
  },
  {
    id: 'c1-warmup',
    level: 1,
    title: 'Dört parmak ısınması',
    text: [
      'Her parmağa bir perde: işaret 1., orta 2., yüzük 3., serçe 4. perde. Buna "bir perdeye bir parmak" kuralı denir.',
      'Yavaş başla. Hız, temiz çalınan notaların tekrarından gelir.',
    ],
    demo: { kind: 'notes', notes: [1, 2, 3, 4].map((fret) => ({ string: 6, fret })) },
    exercise: { kind: 'lesson', lessonId: 'chromatic-warmup', prompt: 'Kromatik ısınma dersini yavaş tempoda bir kez baştan sona çal.' },
  },
  {
    id: 'c1-melody',
    level: 1,
    title: 'İlk ezgi',
    text: [
      'Şimdi iki tel üzerinde bilinen bir çocuk ezgisini çalacaksın. Notalar 1. ve 2. telde, ilk üç perdede.',
      'Çalarken sayarak ilerle: dörtlük notalar bir vuruş, ikilikler iki vuruş sürer.',
    ],
    demo: { kind: 'notes', notes: [{ string: 2, fret: 1 }, { string: 2, fret: 1 }, { string: 1, fret: 3 }, { string: 1, fret: 3 }, { string: 1, fret: 5 }, { string: 1, fret: 5 }, { string: 1, fret: 3 }] },
    exercise: { kind: 'lesson', lessonId: 'twinkle', prompt: 'Ezgiyi oynatıcıda dinleme moduyla çal.' },
  },

  /* ---------- Level 2 ---------- */
  {
    id: 'c2-em',
    level: 2,
    title: 'İlk akor: Mi minör',
    text: [
      'Em en kolay akorlardan biridir: iki parmak, altı tel. Orta parmak 5. telin, yüzük parmağı 4. telin 2. perdesine.',
      'Akor basarken parmaklar kemerli olsun ki komşu teller susmasın. Önce teller tek tek tınlıyor mu kontrol et.',
    ],
    demo: { kind: 'chord', chord: 'Em' },
    exercise: { kind: 'arpeggio', chord: 'Em', prompt: 'Em akorunu bas ve telleri kalından inceye tek tek çal.' },
  },
  {
    id: 'c2-am-c',
    level: 2,
    title: 'La minör ve Do majör',
    text: [
      'Am ve C akorlarında iki parmak yerinde kalır: işaret parmağı 2. telin 1. perdesinde, orta parmak 4. telin 2. perdesinde.',
      'Geçerken sadece yüzük parmağı hareket eder. Ortak parmakları kaldırma; bu, geçişi yarı yarıya hızlandırır.',
    ],
    demo: { kind: 'chord', chord: 'C' },
    exercise: { kind: 'arpeggio', chord: 'C', prompt: 'C akorunu 5. telden başlayarak tek tek çal (6. tel çalınmaz).' },
  },
  {
    id: 'c2-quarters',
    level: 2,
    title: 'Dörtlük tokat',
    text: [
      'Sağ el ritmi taşır. İlk desen basit: her vuruşta bir aşağı tokat.',
      'Bileği gevşek tut, kolu değil bileği salla. Metronomun tıkıyla aynı anda vur.',
    ],
    demo: { kind: 'strum', patternId: 'quarters', chord: 'Em' },
    exercise: { kind: 'screen', route: 'rhythm', patternId: 'quarters', prompt: 'Ritim ekranında "Dörtlük aşağı" desenini mikrofonla çal; puanın 70\'i geçsin.' },
  },
  {
    id: 'c2-frere',
    level: 2,
    title: 'Geleneksel bir kanon',
    text: [
      'Bu ezgi yüzyıllardır söylenen geleneksel bir kanondur. Aynı motif ikişer kez tekrar eder, bu da ezberlemeyi kolaylaştırır.',
      'Tekrarlanan bölümleri döngüye alıp ayrı ayrı çalış.',
    ],
    demo: { kind: 'notes', notes: [{ string: 2, fret: 1 }, { string: 2, fret: 3 }, { string: 1, fret: 0 }, { string: 2, fret: 1 }] },
    exercise: { kind: 'lesson', lessonId: 'frere-jacques', prompt: 'Kanonu oynatıcıda çal.' },
  },

  /* ---------- Level 3 ---------- */
  {
    id: 'c3-g-d',
    level: 3,
    title: 'Sol ve Re akorları',
    text: [
      'G akoru altı telin hepsini kullanır; D akorunda ise sadece ince dört tel çalınır.',
      'D çalarken başparmağı sapın arkasında biraz aşağı indirirsen parmakların ince tellere daha rahat uzanır.',
    ],
    demo: { kind: 'chord', chord: 'G' },
    exercise: { kind: 'arpeggio', chord: 'G', prompt: 'G akorunu bas ve telleri tek tek çal.' },
  },
  {
    id: 'c3-change',
    level: 3,
    title: 'Akor geçişi',
    text: [
      'Akorları bilmek yetmez, aralarında zamanında geçmek gerekir. Bir dakikada kaç geçiş yapabildiğini ölçmek ilerlemeyi gösterir.',
      'Geçişte parmakları tek tek değil, şekil olarak birlikte taşı. Önce yavaş ve sessiz, sonra tokatla.',
    ],
    demo: { kind: 'chord', chord: 'C' },
    exercise: { kind: 'screen', route: 'chord-trainer', chords: ['C', 'G'], prompt: 'Akor geçişi ekranında C ↔ G ile bir dakikalık tur at.' },
  },
  {
    id: 'c3-eighths',
    level: 3,
    title: 'Aşağı-yukarı sekizlik',
    text: [
      'Sekizlik desende el hiç durmadan aşağı-yukarı sallanır: aşağı vuruşta, yukarı aradaki "ve"de.',
      'Yukarı tokatta tüm telleri çalman gerekmez; ince üç-dört tel yeterlidir.',
    ],
    demo: { kind: 'strum', patternId: 'eighths', chord: 'G' },
    exercise: { kind: 'screen', route: 'rhythm', patternId: 'eighths', prompt: 'Ritim ekranında sekizlik deseni çal.' },
  },
  {
    id: 'c3-ode',
    level: 3,
    title: 'Klasik bir tema',
    text: [
      'Beethoven\'ın bu teması adım adım ilerleyen notalardan oluşur; atlama azdır, bu yüzden parmak düzeni için iyi bir çalışmadır.',
      'Zorlandığın ölçüde çalış panelindeki "Daha kolay pozisyon" önerisine bak.',
    ],
    demo: { kind: 'notes', notes: [{ string: 2, fret: 0 }, { string: 2, fret: 0 }, { string: 2, fret: 1 }, { string: 2, fret: 3 }] },
    exercise: { kind: 'lesson', lessonId: 'ode-to-joy', prompt: 'Temayı oynatıcıda çal.' },
  },

  /* ---------- Level 4 ---------- */
  {
    id: 'c4-penta',
    level: 4,
    title: 'Mi minör pentatonik',
    text: [
      'Pentatonik gam beş notadan oluşur ve doğaçlamanın temelidir. Açık pozisyondaki kutu her telde iki notadır.',
      'Gamı yukarı ve aşağı çalarken her notayı eşit uzunlukta tut.',
    ],
    demo: { kind: 'notes', notes: EM_PENTA },
    exercise: { kind: 'play', notes: EM_PENTA, prompt: 'Gamı kalın telden ince tele doğru çal.' },
  },
  {
    id: 'c4-arpeggio',
    level: 4,
    title: 'Arpej',
    text: [
      'Arpejde akorun notaları birlikte değil sırayla çalınır. Sol el akoru tutar, sağ el telleri tek tek seçer.',
      'Akor değişene kadar sol eli kaldırma; böylece notalar birbirinin üstüne tınlar.',
    ],
    demo: { kind: 'chord', chord: 'Am' },
    exercise: { kind: 'lesson', lessonId: 'arpeggio-pattern', prompt: 'Arpej dersini oynatıcıda çal.' },
  },
  {
    id: 'c4-pop',
    level: 4,
    title: 'Pop tokadı',
    text: [
      'Bu desende üçüncü vuruşun aşağı tokadı atlanır ama el sallanmaya devam eder. Ritmi canlı yapan bu boşluktur.',
      'Önce desenin sesini ağzınla söyle, sonra gitara geç.',
    ],
    demo: { kind: 'strum', patternId: 'pop', chord: 'C' },
    exercise: { kind: 'screen', route: 'rhythm', patternId: 'pop', prompt: 'Ritim ekranında pop desenini çal.' },
  },
  {
    id: 'c4-legato',
    level: 4,
    title: 'Hammer-on ve pull-off',
    text: [
      'Hammer-on\'da ikinci nota tele vurulmaz, parmak perdeye çekiç gibi iner. Pull-off\'ta parmak teli hafifçe çekerek bırakır.',
      'İki notanın ses yüksekliği eşit olmalı; ikincisi zayıf kalıyorsa parmağı daha kararlı indir.',
    ],
    demo: { kind: 'notes', notes: [{ string: 3, fret: 0 }, { string: 3, fret: 2 }, { string: 3, fret: 0 }] },
    exercise: { kind: 'lesson', lessonId: 'hammer-pull', prompt: 'Legato dersini oynatıcıda çal.' },
  },

  /* ---------- Level 5 ---------- */
  {
    id: 'c5-barre',
    level: 5,
    title: 'Bare akor: Fa majör',
    text: [
      'Barede işaret parmağı bir perdedeki bütün telleri birden basar. Parmağın yan kemikli tarafını kullan, düz yüzünü değil.',
      'Güç kolundan değil, sapın arkasındaki başparmak ile parmaklar arasındaki sıkıştırmadan gelir. Ağrı olursa ara ver.',
    ],
    demo: { kind: 'chord', chord: 'F' },
    exercise: { kind: 'arpeggio', chord: 'F', prompt: 'F akorunu bas ve telleri tek tek çal; susan teli bul ve düzelt.' },
  },
  {
    id: 'c5-chuck',
    level: 5,
    title: 'Susturmalı tokat',
    text: [
      'Avuç içi tokatla birlikte tellere düşerse kısa, vurmalı bir ses çıkar. Bu ses ritme davul gibi bir vurgu ekler.',
      'Desende X ile gösterilir; diğer vuruşlar normal tınlar.',
    ],
    demo: { kind: 'strum', patternId: 'chuck', chord: 'Am' },
    exercise: { kind: 'screen', route: 'rhythm', patternId: 'chuck', prompt: 'Ritim ekranında susturmalı deseni çal.' },
  },
  {
    id: 'c5-six-eight',
    level: 5,
    title: '6/8 hissi',
    text: [
      '6/8 ölçüsü iki büyük vuruş olarak hissedilir; her biri üçe bölünür. Sayarken "BİR-iki-üç DÖRT-beş-altı" de.',
      'Vurgular 1 ve 4\'te. Ağır tempoda salınarak çal.',
    ],
    demo: { kind: 'strum', patternId: 'six-eight', chord: 'Em' },
    exercise: { kind: 'screen', route: 'rhythm', patternId: 'six-eight', prompt: 'Ritim ekranında 6/8 desenini çal.' },
  },
  {
    id: 'c5-walk',
    level: 5,
    title: 'Bütün parçalar bir arada',
    text: [
      'Bu son parça akorları, tek notaları ve ritmi birleştirir. Bölüm bölüm ilerle; her bölüm temiz olunca tempoyu artır.',
      'Tempo merdiveni seni hedef hıza adım adım taşır.',
    ],
    demo: { kind: 'chord', chord: 'G' },
    exercise: { kind: 'lesson', lessonId: 'morning-walk', prompt: 'Parçayı oynatıcıda tempo merdiveniyle çal.' },
  },
];

/* ---------- progress ---------- */

export const levelLessons = (level: number) => COURSE.filter((l) => l.level === level);

export function levelProgress(done: ReadonlySet<string>, level: number): { done: number; total: number; pct: number } {
  const ls = levelLessons(level);
  const d = ls.filter((l) => done.has(l.id)).length;
  return { done: d, total: ls.length, pct: ls.length ? Math.round((100 * d) / ls.length) : 0 };
}

/** A level opens when at least 75 % of the previous one is done (level 1 is always open). */
export function isUnlocked(done: ReadonlySet<string>, level: number): boolean {
  return level <= 1 || levelProgress(done, level - 1).pct >= 75;
}

/** The first lesson not done yet in an open level, or null when the course is finished. */
export function nextLesson(done: ReadonlySet<string>): CourseLesson | null {
  return COURSE.find((l) => !done.has(l.id) && isUnlocked(done, l.level)) ?? null;
}

/**
 * Mic-checked exercise: `idx` is the next target; a heard (stable) MIDI note equal to it moves on.
 * Returns the new index and whether the note was right.
 */
export function advance(targets: number[], idx: number, heard: number): { idx: number; hit: boolean } {
  if (idx >= targets.length) return { idx, hit: false };
  const hit = Math.round(heard) === targets[idx];
  return { idx: hit ? idx + 1 : idx, hit };
}

const KEY = 'guitar3d.course.v1';

export function loadDone(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

export function saveDone(done: ReadonlySet<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
}
