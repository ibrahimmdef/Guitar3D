import type { BuiltinLessonDef } from './types';

/**
 * "Eserler" pack: well-known themes and openings of public-domain classical works and
 * anonymous/traditional melodies, arranged for guitar in standard tuning. Short excerpts only,
 * no lyrics. Guitar sounds an octave below written pitch, so pitches here are the sounding ones
 * (e.g. Für Elise starts on E4 = open 1st string).
 * Levels: 3 = orta, 4 = orta üstü, 5 = zor; easiest first within each level.
 */
const e = (d: Omit<BuiltinLessonDef, 'source' | 'group'>): BuiltinLessonDef => ({ ...d, source: 'public-domain', group: 'eserler' });

/** Three triplet eighths. */
const tri = (a: string, b: string, c: string) => `${a}.8{tu 3} ${b}.8{tu 3} ${c}.8{tu 3}`;

/** One 3/4 bar of the Romance: melody frets on the 1st string over two inner notes, bass on the downbeat. */
const romanceBar = (frets: number[], inner: [string, string], bass: string) =>
  frets.map((f, i) => tri(i === 0 ? `(${f}.1 ${bass})` : `${f}.1`, inner[0], inner[1])).join(' ');

const LEVEL_3: BuiltinLessonDef[] = [
  e({
    id: 'eser-amazing-grace',
    title: 'Amazing Grace (Geleneksel)',
    level: 3,
    tempo: 80,
    goal: '3/4 ölçüde melodiyi bas notalarıyla birlikte çalmak.',
    description: 'Anonim ilahi ezgisi "New Britain" (Amazing Grace), Sol majörde. Melodi birinci pozisyonda, ölçü başlarında bas notası; ilk kıta, düzenleme.',
    tip: 'Ölçü başındaki bas ile melodi notasını aynı anda başparmak ve işaret parmağıyla çek. Uzun notaları tam üç vuruş tut, "bir-iki-üç" diye say.',
    bars: `
\\ts 3 4 r.2 0.4.4 | (0.3 3.6).2 0.2.8 0.3.8 | (0.2 3.6).2 2.3.4 | (0.3 3.5).2 2.4.4 | (0.4 3.6).2 0.4.4 |
(0.3 3.6).2 0.2.8 0.3.8 | (0.2 0.6).2 2.3.4 | (3.2 3.6).2{d} | r.2 0.2.4 |
(3.2 3.6).2 0.2.8 0.3.8 | (0.2 0.4).2 2.3.4 | (0.3 3.5).2 2.4.4 | (0.4 3.6).2 0.4.4 |
(0.3 0.6).2 0.2.8 0.3.8 | (0.2 0.4).2 2.3.4 | (0.3 3.6).2{d}
`,
  }),
  e({
    id: 'eser-sakura',
    title: 'Sakura Sakura (Japon halk ezgisi)',
    level: 3,
    tempo: 72,
    goal: 'Japon pentatonik dizisini (La-Si-Do-Mi-Fa) birinci pozisyonda çalmak.',
    description: 'Anonim Japon halk ezgisi "Sakura Sakura", La minör renginde, gitarın birinci pozisyonunda. Tam ezgi, düzenleme.',
    tip: 'Yarım notalarda sesi kesme; parmağı tel üzerinde tut. Sekizlik çiftlerini (Si-La) yumuşak bağla, acele etme.',
    bars: `
:4 2.3 2.3 0.2.2 | 2.3.4 2.3.4 0.2.2 | 2.3.4 0.2.4 1.2.4 0.2.4 | 2.3.4 0.2.8 2.3.8 3.4.2 |
2.4.4 3.5.4 2.4.4 3.4.4 | 2.4.4 2.4.8 3.5.8 2.5.2 | 2.3.4 0.2.4 1.2.4 0.2.4 | 2.3.4 0.2.8 2.3.8 3.4.2 |
2.4.4 3.5.4 2.4.4 3.4.4 | 2.4.4 2.4.8 3.5.8 2.5.2 | 2.3.4 2.3.4 0.2.2 | 2.3.4 2.3.4 0.2.2 |
2.4.4 3.4.4 0.2.8 2.3.8 3.4.4 | (2.4 0.6).1
`,
  }),
  e({
    id: 'eser-scarborough-fair',
    title: 'Scarborough Fair (Geleneksel)',
    level: 3,
    tempo: 84,
    goal: 'Re Dorian ezgisini iki oktavda çalmak; ikinci turda bas ekleyip pozisyon değiştirmek.',
    description: 'Anonim İngiliz halk ezgisi, Re Dorian. İlk iki dize önce alçak oktavda tek ses, sonra bir oktav yukarıda baslarla. Düzenleme.',
    tip: 'İkinci turda 5. ve 8.–10. perdeler arasında kayacaksın; kaymadan önce hedef perdeye bak. Noktalı dörtlükte "bir-ve" say.',
    bars: `
\\ts 3 4 0.4.2 0.4.4 | 2.3.2 2.3.4 | 2.4.4{d} 3.4.8 2.4.4 | 0.4.2{d} |
r.4 2.3.4 1.2.4 | 3.2.2 1.2.4 | 2.3.4 0.2.4 0.3.4 | 2.3.2{d} |
(3.2 0.4).2 3.2.4 | (5.1 0.4).2 5.1.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 0.4).2{d} |
r.4 5.1.4 8.1.4 | (10.1 0.4).2 8.1.4 | (5.1 3.6).4 7.1.4 3.1.4 | (5.1 0.5).2{d}
`,
  }),
  e({
    id: 'eser-greensleeves',
    title: 'Greensleeves (Geleneksel)',
    level: 3,
    tempo: 84,
    goal: '3/4 ölçüde noktalı ritmi ve bas + melodi çalımını oturtmak.',
    description: 'Anonim İngiliz ezgisi (16. yy), La minörde. Melodi 1.–4. tellerde, ölçü başlarında bas notaları. Ezginin ilk bölümü, düzenleme.',
    tip: 'Noktalı dörtlük + sekizlik kalıbı ("daa-da") her ölçüde döner; önce sadece melodiyi çal, sonra basları ekle. Sol diyez (3. tel 1. perde) için parmağını hazır tut.',
    bars: `
\\ts 3 4 r.2 2.3.4 | (1.2 0.5).2 3.2.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 3.6).2 0.2.4 |
(0.3 0.6).4{d} 2.3.8 0.2.4 | (1.2 0.5).2 2.3.4 | (2.3 0.5).4{d} 1.3.8 2.3.4 | (0.2 0.6).2 1.3.4 |
(0.1 0.6).2 2.3.4 | (1.2 0.5).2 3.2.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 3.6).2 0.2.4 |
(0.3 0.6).4{d} 2.3.8 0.2.4 | (1.2 0.5).4{d} 0.2.8 2.3.4 | (1.3 0.6).4{d} 4.4.8 1.3.4 | (2.3 0.5).2{d}
`,
  }),
  e({
    id: 'eser-minuet-in-g',
    title: 'Sol Majör Menuet (Petzold)',
    level: 3,
    tempo: 92,
    goal: 'Barok menuette sekizlik dizileri ve bas notalarını birlikte çalmak.',
    description: 'Christian Petzold, Menuet Sol majör (BWV Anh. 114, eskiden Bach\'a atfedilirdi). Sol majörde, birinci pozisyon; 16 ölçülük ilk bölüm, düzenleme.',
    tip: 'Sekizlik dizilerinde (Sol-La-Si-Do) parmaklar perde başına bir parmak kuralıyla dursun. 7. ölçüdeki Fa diyez 4. telin 4. perdesinde; serçe parmakla bas.',
    bars: `
\\ts 3 4 (3.2 3.6).4 0.3.8 2.3.8 0.2.8 1.2.8 | (3.2 2.5).4 0.3.4 0.3.4 | (0.1 3.5).4 1.2.8 3.2.8 0.1.8 2.1.8 | (3.1 2.5).4 0.3.4 0.3.4 |
(1.2 0.5).4 3.2.8 1.2.8 0.2.8 2.3.8 | (0.2 3.6).4 1.2.8 0.2.8 2.3.8 0.3.8 | 4.4.4 0.3.8 2.3.8 0.2.8 0.3.8 | (2.3 0.4).2{d} |
(3.2 3.6).4 0.3.8 2.3.8 0.2.8 1.2.8 | (3.2 2.5).4 0.3.4 0.3.4 | (0.1 3.5).4 1.2.8 3.2.8 0.1.8 2.1.8 | (3.1 2.5).4 0.3.4 0.3.4 |
(1.2 0.5).4 3.2.8 1.2.8 0.2.8 2.3.8 | (0.2 3.6).4 1.2.8 0.2.8 2.3.8 0.3.8 | (2.3 0.4).4 0.2.8 2.3.8 0.3.8 4.4.8 | (0.3 3.6).2{d}
`,
  }),
  e({
    id: 'eser-pachelbel-canon',
    title: 'Kanon Re Majör (Pachelbel)',
    level: 3,
    tempo: 66,
    goal: 'Tekrarlanan bas çizgisi üzerinde melodi çalmak (bas + melodi bağımsızlığı).',
    description: 'Johann Pachelbel, Kanon Re majör. Önce sekiz notalık bas (Re-La-Si-Fa#-Sol-Re-Sol-La), sonra üzerinde ünlü ana melodinin ilk üç çeşitlemesi. Re majörde, düzenleme.',
    tip: 'İlk iki ölçüde bası ezberle; melodi girince bas aynı kalır. 6. ölçüde Fa diyez ile Re bası (4. tel 4. perde + 5. tel 5. perde) için elini 4. pozisyona hazırla.',
    bars: `
:4 0.4 0.5 2.5 2.6 | 3.6 0.4 3.6 0.5 |
(2.1 0.4).4 (0.1 0.5).4 (3.2 2.5).4 (2.2 2.6).4 | (0.2 3.6).4 (2.3 0.4).4 (0.2 3.6).4 (2.2 0.5).4 |
(3.2 0.4).4 (2.2 0.5).4 (0.2 2.5).4 (2.3 2.6).4 | (0.3 3.6).4 (4.4 5.5).4 (0.3 3.6).4 (2.4 0.5).4 |
(3.2 0.4).8 2.1.8 (5.1 0.5).8 3.1.8 (2.1 2.5).8 3.2.8 (2.1 2.6).8 0.1.8 | (3.2 3.6).8 0.2.8 (3.2 0.4).8 5.1.8 (3.1 3.6).8 7.1.8 (5.1 0.5).8 3.1.8 |
(2.1 3.2 2.3 0.4).1
`,
  }),
  e({
    id: 'eser-mavi-tuna',
    title: 'Mavi Tuna (Strauss II)',
    level: 3,
    tempo: 120,
    goal: 'Vals ritmini (bas + iki vuruş) hissetmek; alçak ve tiz bölge arasında atlamak.',
    description: 'Johann Strauss II, "An der schönen blauen Donau" ana vals teması. Re majörde; alçak tellerde tema, tiz tellerde "pam pam" cevapları. Düzenleme.',
    tip: '"Bir-iki-üç" say: cevap ölçülerinde birinci vuruş bas (açık tel), iki ve üç tiz nota. 14. ölçüdeki Si notası 1. telin 7. perdesinde; elini önceden kaydır.',
    bars: `
\\ts 3 4 r.4 r.4 0.4.4 | 0.4.4 4.4.4 2.3.4 | 2.3.2{d} | 0.4.4 5.1.4 5.1.4 | 0.4.4 2.1.4 2.1.4 |
r.4 r.4 0.4.4 | 0.4.4 4.4.4 2.3.4 | 2.3.2{d} | 0.4.4 5.1.4 5.1.4 | 0.5.4 3.1.4 3.1.4 |
r.4 r.4 4.5.4 | 4.5.4 2.4.4 0.2.4 | 0.2.2{d} | 0.5.4 7.1.4 7.1.4 | 0.5.4 3.1.4 3.1.4 |
r.4 r.4 4.5.4 | 4.5.4 2.4.4 0.2.4 | 0.2.2{d} | 0.5.4 7.1.4 7.1.4 | 0.4.4 2.1.4 2.1.4 |
(0.4 2.3 3.2 2.1).2{d}
`,
  }),
  e({
    id: 'eser-can-can',
    title: 'Kan-kan (Offenbach)',
    level: 3,
    tempo: 92,
    goal: '5. pozisyonda onaltılık notaları temiz ve eşit çalmak.',
    description: 'Jacques Offenbach, "Cehennemdeki Orfeus" operetinden galop (Kan-kan) teması. Do majörde, 5. pozisyonda (5.–8. perdeler). Düzenleme.',
    tip: 'Elini 5. perdede sabit tut: işaret 5, orta 6, yüzük 7, serçe 8. perdede. Önce 60 BPM\'de çal; hedef tempo 140 civarı.',
    bars: `
\\ts 2 4 5.3.4 7.3.16 6.2.16 5.2.16 7.3.16 | 8.2.8 8.2.8 8.2.16 5.1.16 5.2.16 6.2.16 | 7.3.8 7.3.8 7.3.16 6.2.16 5.2.16 7.3.16 | 5.3.16 8.1.16 7.1.16 5.1.16 8.2.16 6.2.16 5.2.16 7.3.16 |
5.3.4 7.3.16 6.2.16 5.2.16 7.3.16 | 8.2.8 8.2.8 8.2.16 5.1.16 5.2.16 6.2.16 | 7.3.8 7.3.8 7.3.16 6.2.16 5.2.16 7.3.16 | 5.3.8 8.2.8 7.3.16 5.2.16 5.3.8
`,
  }),
  e({
    id: 'eser-fur-elise',
    title: 'Für Elise (Beethoven)',
    level: 3,
    tempo: 60,
    goal: 'Onaltılık notalarda Mi-Re# salınımını ve bas arpejini birlikte çalmak.',
    description: 'Ludwig van Beethoven, "Für Elise" (WoO 59) A bölümü, La minörde. Gitarda yazıldığı gibi bir oktav pes sesler (açık 1. tel Mi). Düzenleme.',
    tip: 'Mi (açık 1. tel) ile Re diyez (2. tel 4. perde) arasında serçe parmağı hazır tut. Bas notalarını ölçü başında, melodiyle aynı anda çal. Bu tempo dörtlük; hedef 80 civarı.',
    bars: `
\\ts 3 8 r.4 0.1.16 4.2.16 | 0.1.16 4.2.16 0.1.16 0.2.16 3.2.16 1.2.16 | (2.3 0.5).8 r.16 3.5.16 2.4.16 2.3.16 | (0.2 0.6).8 r.16 2.4.16 1.3.16 0.2.16 |
(1.2 0.5).8 r.16 2.4.16 0.1.16 4.2.16 | 0.1.16 4.2.16 0.1.16 0.2.16 3.2.16 1.2.16 | (2.3 0.5).8 r.16 3.5.16 2.4.16 2.3.16 | (0.2 0.6).8 r.16 2.4.16 1.2.16 0.2.16 |
(2.3 0.5).8 r.8 0.1.16 4.2.16 | 0.1.16 4.2.16 0.1.16 0.2.16 3.2.16 1.2.16 | (2.3 0.5).8 r.16 3.5.16 2.4.16 2.3.16 | (0.2 0.6).8 r.16 2.4.16 1.3.16 0.2.16 |
(1.2 0.5).8 r.16 2.4.16 0.1.16 4.2.16 | 0.1.16 4.2.16 0.1.16 0.2.16 3.2.16 1.2.16 | (2.3 0.5).8 r.16 3.5.16 2.4.16 2.3.16 | (0.2 0.6).8 r.16 2.4.16 1.2.16 0.2.16 |
(2.3 0.5).4{d}
`,
  }),
  e({
    id: 'eser-romance-anonimo',
    title: 'Romance Anónimo (İspanyol Romansı)',
    level: 3,
    tempo: 60,
    goal: 'Üçleme arpejinde melodiyi 1. telde öne çıkarmak; 7. ve 12. pozisyona geçmek.',
    description: 'Anonim İspanyol romansı ("Spanish Romance"), Mi minörde. Açılış bölümünün ilk sekiz ölçüsü ve kapanış akoru: üçleme arpej, melodi 1. telde. Düzenleme.',
    tip: 'Her vuruş üç nota: melodi (a parmağı), açık 2. tel (m), açık 3. tel (i). Melodiyi biraz daha güçlü çal. 5. ölçüde 12. perdeye geçmeden önce elini 7. pozisyonda bırakma, tek hamlede kay.',
    bars: `
\\ts 3 4 ${romanceBar([7, 7, 7], ['0.2', '0.3'], '0.6')} | ${romanceBar([7, 5, 3], ['0.2', '0.3'], '0.6')} | ${romanceBar([3, 2, 0], ['0.2', '0.3'], '0.6')} | ${romanceBar([0, 3, 7], ['0.2', '0.3'], '0.6')} |
${romanceBar([12, 12, 12], ['8.2', '9.3'], '0.6')} | ${romanceBar([12, 10, 8], ['8.2', '9.3'], '0.6')} | ${romanceBar([8, 7, 5], ['5.2', '5.3'], '0.5')} | ${romanceBar([5, 7, 8], ['5.2', '5.3'], '0.5')} |
(0.6 2.5 2.4 0.3 0.2 0.1).2{d}
`,
  }),
];

export const ESERLER: BuiltinLessonDef[] = [...LEVEL_3];
