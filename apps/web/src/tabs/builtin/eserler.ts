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

/** Six 16th-note triplets (one beat and a half). */
const tri16 = (a: string, b: string, c: string) => `${a}.16{tu 3} ${b}.16{tu 3} ${c}.16{tu 3}`;

const LEVEL_4: BuiltinLessonDef[] = [
  e({
    id: 'eser-gymnopedie-1',
    title: 'Gymnopédie No. 1 (Satie)',
    level: 4,
    tempo: 66,
    goal: 'Yavaş tempoda bas, akor ve melodiyi dengeli çalmak; sesleri sürdürmek.',
    description: 'Erik Satie, Gymnopédie No. 1. Sol maj7 – Re majör salınımı üzerinde ünlü melodinin ilk cümlesi; melodi bir oktav pes, akorlar sadeleştirildi. Düzenleme.',
    tip: 'Her ölçüde bas birinci vuruşta, akor ikincide. Melodi notalarını akordan biraz daha yüksek sesle çal ve üç vuruş boyunca bırakma. Satie\'nin işareti: "yavaş ve acılı".',
    bars: `
\\ts 3 4 3.6.4 (4.4 4.3).2 | 0.4.4 (4.4 2.3).2 | 3.6.4 (4.4 4.3).2 | 0.4.4 (4.4 2.3).2 |
3.6.4 (2.1 4.4 4.3).4 5.1.4 | (3.1 0.4).4 (2.1 4.4 2.3).4 2.2.4 | (0.2 3.6).4 (2.2 4.4 4.3).4 3.2.4 | (2.3 0.4).4 4.4.2 |
(4.4 3.6).4 4.3.2 | (4.4 5.5).4 2.3.2 | (4.4 3.6).4 4.3.2 | (4.4 5.5).4 2.3.2 |
(3.6 0.4 0.3 0.2 2.1).2{d}
`,
  }),
  e({
    id: 'eser-dag-kralinin-salonu',
    title: 'Dağ Kralının Salonunda (Grieg)',
    level: 4,
    tempo: 100,
    goal: 'Sekizlik notalarla kromatik geçişleri temiz ve eşit çalmak; tema iki oktavda.',
    description: 'Edvard Grieg, Peer Gynt\'ten "In the Hall of the Mountain King" teması. Si minörde; önce kalın tellerde, sonra bir oktav yukarıda. Düzenleme.',
    tip: 'Notaları kısa (staccato) çal, sol eli her notadan sonra hafifçe gevşet. Eser giderek hızlanır: 100 BPM\'de temiz çalınca 120, sonra 160\'a çık.',
    bars: `
:8 2.5 4.5 0.4 2.4 4.4 0.4 4.4.4 | 3.4.8 4.5.8 3.4.4 2.4.8 3.5.8 2.4.4 | 2.5.8 4.5.8 0.4.8 2.4.8 4.4.8 0.4.8 4.4.8 0.2.8 | 2.3.8 4.4.8 0.4.8 4.4.8 2.3.2 |
0.2.8 2.2.8 3.2.8 0.1.8 2.1.8 3.2.8 2.1.4 | 1.1.8 2.2.8 1.1.4 0.1.8 1.2.8 0.1.4 | 0.2.8 2.2.8 3.2.8 0.1.8 2.1.8 3.2.8 2.1.8 7.1.8 | 5.1.8 2.1.8 3.2.8 2.1.8 5.1.2 |
(2.5 4.4 4.3 3.2).1
`,
  }),
  e({
    id: 'eser-habanera',
    title: 'Habanera (Bizet, Carmen)',
    level: 4,
    tempo: 66,
    goal: 'Habanera bas ritmini (noktalı sekizlik + onaltılık) tutarken kromatik inen melodiyi çalmak.',
    description: 'Georges Bizet, Carmen operasından Habanera. Re minörde; melodi 1. telde 10. perdeden kromatik iner, açık Re ve La telleri habanera ritmini çalar. İlk cümle iki kez, sözsüz düzenleme.',
    tip: 'Önce ilk iki ölçüdeki bas ritmini ezberle: "Re . La Fa La". Melodi 1. telde tek parmakla kayarak iner; üçlemelerde (Do-Do-Do) acele etme.',
    bars: `
\\ts 2 4 0.4.8 r.16 0.5.16 3.4.8 0.5.8 | 0.4.8 r.16 0.5.16 3.4.8 0.5.8 |
0.4.8 r.16 0.5.16 (10.1 3.4).8 (9.1 0.5).8 | (8.1 0.4).8{tu 3} 8.1.8{tu 3} 8.1.8{tu 3} (7.1 3.4).8 (6.1 0.5).8 | (5.1 0.4).8 5.1.16 (5.1 0.5).16 (4.1 3.4).8 (3.1 0.5).8 | ${tri16('(1.1 0.4)', '3.1', '1.1')} 0.1.16 (1.1 0.5).16 (3.1 3.4).8 (1.1 0.5).8 |
(0.1 0.4).8 r.16 0.5.16 3.4.8 0.5.8 |
0.4.8 r.16 0.5.16 (10.1 3.4).8 (9.1 0.5).8 | (8.1 0.4).8{tu 3} 8.1.8{tu 3} 8.1.8{tu 3} (7.1 3.4).8 (6.1 0.5).8 | (5.1 0.4).8 5.1.16 (5.1 0.5).16 (4.1 3.4).8 (3.1 0.5).8 | ${tri16('(1.1 0.4)', '3.1', '1.1')} 0.1.16 (1.1 0.5).16 (3.1 3.4).8 (1.1 0.5).8 |
(0.4 2.3 3.2 1.1).2
`,
  }),
  e({
    id: 'eser-lagrima',
    title: 'Lágrima (Tárrega)',
    level: 4,
    tempo: 60,
    goal: 'Melodiyi açık Si teli ile dönüşümlü çalmak; IV. ve IX. pozisyona geçmek.',
    description: 'Francisco Tárrega, Lágrima ("Gözyaşı") prelüdü, Mi majör bölümünün ilk sekiz ölçüsü. Melodi sekizliklerde açık 2. tel ile dönüşümlü, ölçü başlarında bas. Düzenleme.',
    tip: 'Melodi notası (1. tel) ile açık Si tel arasında i-m parmaklarını dönüşümlü kullan. 5. ölçüde 9. perde barresine tek hamlede geç; melodiyi şarkı söyler gibi bağla.',
    bars: `
\\ts 3 4 (4.1 2.4).8 0.2.8 (5.1 4.4).8 0.2.8 (7.1 6.4).8 0.2.8 | (2.1 1.4).8 0.2.8 2.3.8 0.2.8 2.5.8 0.2.8 |
(4.1 2.4).8 0.2.8 (5.1 4.4).8 0.2.8 (7.1 6.4).8 0.2.8 | (2.1 1.4).8 0.2.8 2.3.8 0.2.8 2.5.8 0.2.8 |
(12.1 11.4).4 (11.1 9.4).4 (9.1 7.4).4 | 7.1.8 9.2.8 6.3.8 5.2.8 7.2.8 5.1.8 | 4.1.8 5.2.8 6.3.8 7.2.4 (4.2 2.3).8 | (0.1 1.3 0.6).2 r.4
`,
  }),
  e({
    id: 'eser-adelita',
    title: 'Adelita (Tárrega)',
    level: 4,
    tempo: 72,
    goal: '12. perdeden inen mazurka melodisini baslarla birlikte, pozisyon değiştirerek çalmak.',
    description: 'Francisco Tárrega, Adelita (mazurka), Mi minör bölümü (8 ölçü, tekrarlı). Süs notaları (appoggiatura) sadeleştirildi. Düzenleme.',
    tip: 'İlk notada (12. perde) elini önceden yerleştir; Mi-Re# arasını bağlı (legato) çal. Mazurka ritmi: ikinci vuruşa hafif vurgu.',
    bars: `
\\ts 3 4 (12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (7.2 0.6).8 9.3.8 0.2.8 9.3.8 8.2.8 7.1.8 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (0.3 0.2 0.1 2.4).2 r.4 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (7.2 0.6).8 9.3.8 0.2.8 9.3.8 8.2.8 7.1.8 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (0.3 0.2 0.1 2.4).2 r.4
`,
  }),
  e({
    id: 'eser-bourree-mi-minor',
    title: 'Bourrée Mi Minör (Bach)',
    level: 4,
    tempo: 100,
    goal: 'İki sesli Barok yazıda melodi ve bası bağımsız çalmak.',
    description: 'Johann Sebastian Bach, Lavta Süiti BWV 996\'dan Bourrée, Mi minörde; ilk bölüm (bas ve melodi). Son ölçüdeki pes Re bir oktav yukarı alındı. Düzenleme.',
    tip: 'Başparmak (p) sadece bası, i-m parmakları melodiyi çalsın. Önce yalnız bas sesini, sonra yalnız melodiyi çal, en son birleştir. Hedef tempo 120.',
    bars: `
\\ts 2 2 r.2 r.4 (0.1 3.6).8 (2.1 2.6).8 | (3.1 0.6).4 (2.1 0.5).8 0.1.8 (4.2 2.5).4 (0.1 0.5).8 2.1.8 | (0.2 3.6).4 (2.2 2.6).8 4.2.8 (0.1 0.6).4 (3.2 2.6).8 1.2.8 |
(0.2 3.6).4 (2.3 0.5).8 0.3.8 (4.4 2.5).4 (0.3 0.5).8 2.3.8 | (0.2 3.6).8 2.3.8 (0.3 2.5).8 4.4.8 (2.4 0.6).8 2.6.8 (0.1 3.6).8 (2.1 2.6).8 |
(3.1 0.6).4 (2.1 0.5).8 0.1.8 (4.2 2.5).4 (0.1 0.5).8 2.1.8 | (0.2 3.6).4 (2.2 2.6).8 4.2.8 (0.1 0.6).4 (3.2 2.6).8 1.2.8 |
(0.2 3.6).4 (2.3 3.5).8 0.3.8 (4.4 5.5).4 0.4.8 0.3.8 | (0.3 3.6).2 r.2
`,
  }),
  e({
    id: 'eser-ay-isigi-sonati',
    title: 'Ay Işığı Sonatı (Beethoven)',
    level: 4,
    tempo: 54,
    goal: 'Üçleme arpejini eşit çalmak ve üstte giren melodiyi öne çıkarmak.',
    description: 'Ludwig van Beethoven, Piyano Sonatı No. 14 ("Ay Işığı"), 1. bölüm açılışı: üçleme arpej ve melodinin girişi. Tárrega\'nın gitar düzenlemesindeki gibi Re minörde. Düzenleme.',
    tip: 'Üçlemeleri "üç-le-me" diye say, her vuruş başı basla birlikte gelsin. 5. ölçünün son vuruşunda melodi (La, 1. tel 5. perde) girer: onu arpejden daha güçlü çal. Hedef tempo 60.',
    bars: `
:8 ${tri('(2.3 0.4)', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} |
${tri('(2.3 3.5)', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} ${tri('2.3', '3.2', '1.1')} |
${tri('(3.3 1.5)', '3.2', '1.1')} ${tri('3.3', '3.2', '1.1')} ${tri('(3.3 3.6)', '4.2', '3.1')} ${tri('3.3', '4.2', '3.1')} |
${tri('(2.3 0.5)', '2.2', '3.1')} ${tri('2.3', '3.2', '1.1')} ${tri('(2.3 0.5)', '3.2', '0.1')} ${tri('0.3', '2.2', '0.1')} |
${tri('3.4', '2.3', '3.2')} ${tri('3.4', '2.3', '3.2')} ${tri('3.4', '2.3', '3.2')} ${tri('5.1', '3.2', '5.1')} |
${tri('(5.1 4.5)', '5.2', '8.2')} ${tri('7.4', '5.2', '8.2')} ${tri('7.4', '5.2', '8.2')} ${tri('(5.1 7.4)', '5.2', '5.1')} |
${tri('(5.1 0.4)', '7.3', '6.2')} ${tri('7.4', '7.3', '6.2')} ${tri('(6.1 3.6)', '7.3', '8.2')} ${tri('8.4', '7.3', '8.2')} |
(0.4 2.3 3.2 1.1).1
`,
  }),
  e({
    id: 'eser-eine-kleine-nachtmusik',
    title: 'Eine kleine Nachtmusik (Mozart)',
    level: 4,
    tempo: 100,
    goal: 'Sol majör üç sesli akorlardan 5. pozisyona geçerek hızlı ve net melodi çalmak.',
    description: 'Wolfgang Amadeus Mozart, Serenat KV 525 "Eine kleine Nachtmusik", 1. bölümün ilk on ölçüsü (1. keman). Sol majörde, bir oktav pes; süs notaları sadeleştirildi. Düzenleme.',
    tip: 'Açılıştaki "Sol-Re" sıçramalarını kesik ve canlı çal. 6. ölçüdeki dört otuzikilik bir trildir: önce sekizlik olarak çal, sonra hızlandır. Hedef tempo 132.',
    bars: `
:4 (3.1 0.2 0.4).4 r.8 3.2.8 3.1.4 r.8 3.2.8 | 3.1.8 3.2.8 3.1.8 7.1.8 10.1.4 r.4 | 8.1.4 r.8 5.1.8 8.1.4 r.8 5.1.8 | 8.1.8 5.1.8 7.2.8 5.1.8 7.3.4 r.4 |
(3.1 0.2 0.4).8 r.8 8.2.4{d} 7.1.8 5.1.8 8.2.8 | 5.1.32 8.2.32 5.1.32 8.2.32 7.2.8 7.2.4{d} 5.1.8 8.1.8 7.2.8 | 5.1.8 8.2.8 8.2.4{d} 7.1.8 5.1.8 8.2.8 | 5.1.32 8.2.32 5.1.32 8.2.32 7.2.8 7.2.4{d} 5.1.8 8.1.8 7.2.8 |
8.2.8 8.2.8 7.2.8 5.2.16 7.2.16 8.2.8 8.2.8 5.1.8 8.2.16 5.1.16 | 7.1.8 7.1.8 8.1.8 7.1.16 8.1.16 10.1.4 r.4 |
(3.6 2.5 0.4 0.3 0.2 3.1).1
`,
  }),
  e({
    id: 'eser-rondo-alla-turca',
    title: 'Türk Marşı (Mozart)',
    level: 4,
    tempo: 80,
    goal: 'Onaltılık süs figürlerini ve üçlü aralıklı çift sesleri hızlı çalmak.',
    description: 'Wolfgang Amadeus Mozart, Piyano Sonatı KV 331\'in finali "Rondo alla Turca", ana tema (ilk 8 ölçü). La minörde, bir oktav pes; süs notaları sadeleştirildi. Düzenleme.',
    tip: 'Si-La-Sol#-La figürü dönüş gibidir: parmaklar 4-2-1-2. 5.–7. ölçülerdeki çift sesleri (La/Fa#, Sol/Mi) 5. pozisyonda iki parmakla tut. Hedef tempo 120.',
    bars: `
\\ts 2 4 r.4 4.3.16 2.3.16 1.3.16 2.3.16 | (1.2 0.5).8 r.8 3.2.16 1.2.16 0.2.16 1.2.16 | (0.1 0.5).8 r.8 1.1.16 0.1.16 4.2.16 0.1.16 |
(7.1 0.5).16 5.1.16 4.1.16 5.1.16 7.1.16 5.1.16 4.1.16 5.1.16 | (8.1 0.5).4 5.1.8 8.1.8 |
(7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (5.1 7.2).8 | (7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (5.1 7.2).8 | (7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (2.1 4.2).8 | (0.1 0.6).4 r.4
`,
  }),
  e({
    id: 'eser-toccata-re-minor',
    title: 'Tokata Re Minör (Bach)',
    level: 4,
    tempo: 60,
    goal: 'Serbest açılış motifini ve onaltılık üçlemeli hızlı figürleri çalmak.',
    description: 'Johann Sebastian Bach, Tokata ve Füg Re minör BWV 565, açılış: ünlü inen motif iki oktavda, eksik yedili akor ve "Prestissimo" üçleme figürleri. Org eserinden gitar için sadeleştirilmiş düzenleme.',
    tip: 'Açılış motifini serbestçe, fermata gibi uzatarak çal. Üçleme figürlerinde (Re-Mi-Do#) sol el sabit kalsın, sadece sağ el hızlansın. Önce yavaş, sonra hedef 80.',
    bars: `
5.1.4 r.16 3.1.32 1.1.32 0.1.32 3.2.32 2.2.16 3.2.2 | 2.3.4 r.16 2.4.16 3.4.16 4.5.16 0.4.2 | 0.4.2 (2.4 3.3 2.2 3.1).2 | (0.4 2.3 3.2 1.1).2 r.4 r.8 r.16 2.2.16 |
${tri16('3.2', '0.1', '2.2')} ${tri16('3.2', '0.1', '2.2')} ${tri16('3.2', '0.1', '2.2')} 3.2.16 0.1.16 ${tri16('1.1', '3.1', '0.1')} ${tri16('1.1', '3.1', '0.1')} ${tri16('1.1', '3.1', '0.1')} 1.1.16 3.1.16 |
${tri16('5.1', '6.1', '3.1')} ${tri16('5.1', '6.1', '3.1')} ${tri16('5.1', '6.1', '3.1')} 5.1.16 r.16 r.4 r.8 r.16 2.2.16 |
${tri16('3.2', '0.1', '2.2')} ${tri16('3.2', '0.1', '2.2')} ${tri16('3.2', '0.1', '2.2')} 3.2.16 0.1.16 ${tri16('1.1', '3.1', '0.1')} ${tri16('1.1', '3.1', '0.1')} ${tri16('1.1', '3.1', '0.1')} 1.1.16 3.1.16 |
(0.4 2.3 3.2 1.1).1
`,
  }),
];

/** Sixteenth notes from a space-separated list of fret.string positions. */
const s16 = (notes: string) => notes.trim().split(/\s+/).map((n) => `${n}.16`).join(' ');

/** One bar of Bach's C major prelude: two bass notes, then a three-note figure twice, all played twice. */
const preludeBar = (b1: string, b2: string, a: string, b: string, c: string) => s16(`${b1} ${b2} ${a} ${b} ${c} ${a} ${b} ${c} `.repeat(2));

/** One 3/4 bar of tremolo: per eighth a thumb note and three 32nd repeats of the melody note. */
const tremoloBar = (groups: [string, string][]) => groups.map(([p, m]) => `${p}.32 ${m}.32 ${m}.32 ${m}.32`).join(' ');

const LEVEL_5: BuiltinLessonDef[] = [
  e({
    id: 'eser-korobeiniki',
    title: 'Korobeiniki (Rus halk ezgisi)',
    level: 5,
    tempo: 120,
    goal: '5. pozisyonda hızlı melodiyi açık tel baslarıyla birlikte, tempo kaçırmadan çalmak.',
    description: 'Anonim Rus halk şarkısı "Korobeiniki" (Seyyar Satıcılar), La minörde. Melodi 5. pozisyonda, açık tellerde bas. Tarantella yerine seçilen hızlı dans ezgisi; düzenleme.',
    tip: 'Sol el 5. perdede sabit: işaret 5, orta 6, yüzük 7, serçe 8. Basları başparmakla, melodiyi i-m ile çal. 120\'de temizse 140, sonra 160 BPM.',
    bars: `
:4 (5.2 0.6).4 4.3.8 5.3.8 (7.3 0.6).4 5.3.8 4.3.8 | (7.4 0.5).4 7.4.8 5.3.8 (5.2 0.5).4 7.3.8 5.3.8 | (4.3 0.6).4{d} 5.3.8 (7.3 0.6).4 5.2.4 | (5.3 0.5).4 7.4.4 (7.4 0.5).2 |
r.8 (7.3 0.4).4 6.2.8 (5.1 0.4).4 8.2.8 6.2.8 | (5.2 0.5).4{d} 5.3.8 (5.2 0.5).4 7.3.8 5.3.8 | (4.3 0.6).4 4.3.8 5.3.8 (7.3 0.6).4 5.2.4 | (5.3 0.5).4 7.4.4 (7.4 0.5).2 |
(0.5 2.4 2.3 1.2 0.1).1
`,
  }),
  e({
    id: 'eser-gavotte-en-rondeau',
    title: 'Gavotte en Rondeau (Bach)',
    level: 5,
    tempo: 100,
    goal: 'Barok dans ritminde melodi ve bası eşit, akıcı sekizliklerle çalmak.',
    description: 'Johann Sebastian Bach, Keman Partitası No. 3 BWV 1006\'dan "Gavotte en Rondeau" ana teması, Mi majörde, bir oktav pes. Brahms\'ın Macar Dansı No. 5 yerine seçildi. Düzenleme.',
    tip: 'Gavot iki vuruşluk öncülle başlar: ilk ölçüdeki iki dörtlüğü hafif çal, ilk tam ölçünün başına vurgu ver. 3. ölçüdeki onaltılıkları (Fa#-Sol#) bağlı çal. Hedef tempo 132.',
    bars: `
:4 r.2 (0.2 2.4).4 4.1.4 | (4.1 2.3).4 2.1.8 0.1.8 2.1.4 5.1.4 | (5.1 4.3).2 7.1.8 4.1.8 5.1.8 2.1.8 | 0.2.8 2.1.16 4.1.16 5.1.8 2.1.8 4.1.8 0.1.8 2.1.8 4.2.8 |
0.1.8 0.2.8 1.3.8 2.4.8 1.3.8 0.2.8 0.1.8 4.1.8 | 2.3.8 4.1.8 2.1.8 0.1.8 2.1.8 4.1.8 5.1.8 2.1.8 | (5.1 4.3).2 (0.2 2.4).4 4.1.4 | (2.2 2.3).4 2.1.4 (4.4 2.5).4 4.2.4 | (0.1 2.4).2 r.2
`,
  }),
  e({
    id: 'eser-bourree-mi-major',
    title: 'Bourrée Mi Majör (Bach)',
    level: 5,
    tempo: 104,
    goal: 'Hızlı sekizlik dizilerinde birinci pozisyonu ve açık telleri temiz kullanmak.',
    description: 'Johann Sebastian Bach, Keman Partitası No. 3 BWV 1006\'dan Bourrée, ilk dokuz ölçü, Mi majörde, bir oktav pes. Monti\'nin Czardas\'ı yerine seçildi. Düzenleme.',
    tip: 'Sekizlikleri i-m dönüşümlü çal, aynı parmakla iki kez vurma. 5.–8. ölçülerdeki yükselen diziler aynı kalıbı tekrarlar: önce yalnız onları çalış. Hedef tempo yarımlık = 80.',
    bars: `
\\ts 2 2 r.2 r.4 (2.4 0.2).4 | (2.3 2.2).4 2.3.8 0.2.8 2.2.8 4.2.8 0.1.4 | 1.3.8 0.2.8 0.1.4 0.1.8 4.2.8 0.1.4 | 4.4.8 1.3.8 2.3.8 0.2.8 2.2.8 2.3.8 0.2.4 |
2.3.8 1.3.8 4.4.8 1.3.8 2.4.4 4.1.8 0.1.8 | 2.1.8 4.2.8 0.2.8 2.2.8 4.2.8 0.1.8 2.1.8 5.1.8 | 4.1.8 0.1.8 0.2.8 4.2.8 0.1.8 2.1.8 4.1.8 7.1.8 |
2.1.8 4.2.8 0.2.8 2.2.8 4.2.8 0.1.8 2.1.8 5.1.8 | 4.1.8 0.1.8 0.2.8 4.2.8 0.1.8 2.1.8 4.1.8 7.1.8 | 0.1.8 4.2.8 2.2.8 4.2.8 0.1.8 4.2.8 2.2.8 0.2.8 |
(0.6 2.5 2.4 1.3 0.2 0.1).1
`,
  }),
  e({
    id: 'eser-prelude-do-major',
    title: 'Prelüd Do Majör (Bach)',
    level: 5,
    tempo: 66,
    goal: 'Onaltılık arpejde akor şekillerini tutarak geniş açıklı parmak dağılımını çalmak.',
    description: 'Johann Sebastian Bach, İyi Düzenlenmiş Klavye I\'den Prelüd Do majör BWV 846, ilk yedi ölçü ve kapanış akoru. Do majörde, her ölçü bir akor. Rossini\'nin Wilhelm Tell uvertürü yerine seçildi. Düzenleme.',
    tip: 'Her ölçünün başında akorun tamamını bas ve ölçü boyunca bırakma; sağ el p-i-m-a sırasıyla dolaşsın. 5. ölçüde (Am) Mi notası 2. telin 5. perdesinde. Hedef tempo 80.',
    bars: `
${preludeBar('3.5', '2.4', '0.3', '1.2', '0.1')} | ${preludeBar('3.5', '0.4', '2.3', '3.2', '1.1')} | ${preludeBar('2.5', '0.4', '0.3', '3.2', '1.1')} | ${preludeBar('3.5', '2.4', '0.3', '1.2', '0.1')} |
${preludeBar('3.5', '2.4', '2.3', '5.2', '5.1')} | ${preludeBar('3.5', '0.4', '4.4', '2.3', '3.2')} | ${preludeBar('2.5', '0.4', '0.3', '3.2', '3.1')} | (3.5 2.4 0.3 1.2 0.1).1
`,
  }),
  e({
    id: 'eser-paganini-kapris-24',
    title: 'Kapris No. 24 (Paganini)',
    level: 5,
    tempo: 76,
    goal: 'Onaltılık figürleri pozisyon atlamalarıyla hızlı ve temiz çalmak.',
    description: 'Niccolò Paganini, Keman için 24 Kapris\'ten No. 24, La minör tema (tekrarıyla 16 ölçü). Kemandaki sesler bir oktav pes alındı. Düzenleme.',
    tip: 'Her ölçü aynı kalıp: uzun nota, onaltılık susuş, dört onaltılık. Susuşu say, kısaltma. Önce 60\'ta, sonra hedef 120 BPM.',
    bars: `
\\ts 2 4 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.8 r.16 2.4.16 2.4.16 1.3.16 4.4.16 2.4.16 | 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.4 2.4.8 r.8 |
2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.8 r.16 2.4.16 2.4.16 1.3.16 4.4.16 2.4.16 | 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.4 2.4.8 r.8 |
5.1.8 r.16 5.1.16 5.1.16 6.1.16 5.1.16 3.1.16 | 1.1.8 r.16 3.2.16 3.2.16 1.1.16 0.1.16 3.2.16 | 3.1.8 r.16 3.1.16 3.1.16 5.1.16 3.1.16 1.1.16 | 0.1.8 r.16 1.2.16 1.2.16 0.1.16 3.2.16 1.2.16 |
1.1.8 r.16 0.2.16 0.2.16 3.2.16 1.2.16 0.2.16 | 0.1.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 3.4.8 r.16 4.2.16 2.4.16 0.1.16 3.2.16 0.2.16 | 2.3.4 0.5.8 r.8
`,
  }),
  e({
    id: 'eser-cello-suit-prelud',
    title: 'Çello Süiti No. 1 Prelüd (Bach)',
    level: 5,
    tempo: 72,
    goal: 'Sürekli onaltılıklarda bas notasını ve açık telleri kullanarak akıcı arpej çalmak.',
    description: 'Johann Sebastian Bach, Solo Çello Süiti No. 1 BWV 1007, Prelüd\'ün ilk sekiz ölçüsü. Çellodaki gibi Sol majörde ve aynı seslerde; gitarda birinci pozisyon. Düzenleme.',
    tip: 'Her ölçünün ilk notası (bas) bir sonraki ölçüye kadar çınlasın. Açık telleri bol kullan; sol el sadece değişen notaya basar. Hedef tempo 90.',
    bars: `
${s16('3.6 0.4 0.2 2.3 0.2 0.4 0.2 0.4 3.6 0.4 0.2 2.3 0.2 0.4 0.2 0.4')} | ${s16('3.6 2.4 1.2 0.2 1.2 2.4 1.2 2.4 3.6 2.4 1.2 0.2 1.2 2.4 1.2 2.4')} |
${s16('3.6 4.4 1.2 0.2 1.2 4.4 1.2 4.4 3.6 4.4 1.2 0.2 1.2 4.4 1.2 4.4')} | ${s16('3.6 0.3 0.2 2.3 0.2 0.3 0.2 0.3 3.6 0.3 0.2 2.3 0.2 0.3 0.2 4.4')} |
${s16('3.6 2.4 0.2 2.3 0.2 0.3 4.4 0.3 2.4 0.3 4.4 0.3 2.5 0.4 4.5 2.5')} | ${s16('4.5 0.3 2.3 0.3 2.3 0.3 2.3 0.3 4.5 0.3 2.3 0.3 2.3 0.3 2.3 0.3')} |
${s16('4.4 2.3 3.2 2.2 3.2 2.3 0.3 2.3 4.4 2.3 0.3 2.3 0.4 4.4 2.4 0.4')} | ${s16('0.6 2.5 0.3 4.4 0.3 2.5 0.3 2.5 0.6 2.5 0.3 4.4 0.3 2.5 0.3 2.5')}
`,
  }),
  e({
    id: 'eser-recuerdos-de-la-alhambra',
    title: 'Elhamra Hatıraları (Tárrega)',
    level: 5,
    tempo: 50,
    goal: 'p-a-m-i tremolo tekniğinde melodiyi kesintisiz, başparmakla arpeji eşit çalmak.',
    description: 'Francisco Tárrega, "Recuerdos de la Alhambra", La minör açılışın ilk sekiz ölçüsü: başparmakta bas ve arpej, tremoloda melodi. Düzenleme.',
    tip: 'Her grup dört nota: başparmak (p), sonra aynı melodi notası a-m-i ile üç kez. Önce dörtlü grubu yavaşça eşitle, sonra hızlandır. Tremolo bir çizgi gibi duyulmalı. Hedef tempo 76.',
    bars: `
\\ts 3 4 ${tremoloBar([['0.5', '0.1'], ['2.4', '0.1'], ['1.2', '0.1'], ['2.4', '0.1'], ['4.3', '3.2'], ['2.4', '3.2']])} |
${tremoloBar([['0.5', '1.2'], ['2.4', '1.2'], ['2.3', '1.2'], ['2.4', '1.2'], ['4.3', '3.2'], ['2.4', '3.2']])} |
${tremoloBar([['0.5', '0.1'], ['2.4', '0.1'], ['1.2', '0.1'], ['2.4', '0.1'], ['1.2', '0.1'], ['2.4', '0.1']])} |
${tremoloBar([['0.5', '0.1'], ['2.4', '0.1'], ['1.2', '0.1'], ['2.4', '0.1'], ['3.2', '1.1'], ['0.3', '1.1']])} |
${tremoloBar([['3.5', '3.1'], ['0.3', '3.1'], ['5.2', '3.1'], ['0.3', '3.1'], ['3.2', '1.1'], ['0.3', '1.1']])} |
${tremoloBar([['3.5', '0.1'], ['0.3', '0.1'], ['1.2', '0.1'], ['0.3', '0.1'], ['3.2', '1.1'], ['0.3', '1.1']])} |
${tremoloBar([['3.5', '3.1'], ['0.3', '3.1'], ['5.2', '3.1'], ['0.3', '3.1'], ['5.2', '3.1'], ['0.3', '3.1']])} |
${tremoloBar([['3.5', '3.1'], ['0.3', '3.1'], ['5.2', '3.1'], ['0.3', '3.1'], ['5.2', '3.1'], ['0.3', '3.1']])}
`,
  }),
  e({
    id: 'eser-yaz-presto',
    title: 'Yaz, Presto (Vivaldi)',
    level: 5,
    tempo: 90,
    goal: 'Hızlı tekrar eden onaltılıkları (tremolo) ve inen diziyi temiz çalmak.',
    description: 'Antonio Vivaldi, Dört Mevsim\'den "Yaz" (L\'estate), 3. bölüm Presto, fırtına açılışı (1. keman). Sol minörde, bir oktav pes. Düzenleme.',
    tip: 'Tekrarlanan Sol notalarında i-m dönüşümlü ve hafif çal, ölçü başındaki notayı vurgula. 10. ölçüdeki inen diziyi 5. pozisyonda ayrıca çalış. Hedef tempo 150.',
    bars: `
\\ts 3 4 ${s16('3.1' + ' 0.3'.repeat(11))} | ${s16('1.1' + ' 0.3'.repeat(11))} | ${s16('4.2' + ' 0.3'.repeat(11))} | ${s16('3.2' + ' 0.3'.repeat(7))} 0.3.8 r.8 | r.2{d} |
${s16('10.1' + ' 7.3'.repeat(11))} | ${s16('8.1' + ' 7.3'.repeat(11))} | ${s16('6.1' + ' 7.3'.repeat(11))} | ${s16('5.1' + ' 7.3'.repeat(7))} 7.3.8 r.8 |
r.16 ${s16('10.1 8.1 6.1 5.1 8.2 7.2 5.2 7.3 5.3 8.4 7.4')} | (3.6 0.4 0.3 3.3).2{d}
`,
  }),
  e({
    id: 'eser-partita-prelud',
    title: 'Partita No. 3 Prelüd (Bach)',
    level: 5,
    tempo: 80,
    goal: 'Sürekli onaltılıklarda açık Si teliyle "bariolage" ve 12. pozisyon geçişlerini çalmak.',
    description: 'Johann Sebastian Bach, Keman Partitası No. 3 BWV 1006, Preludio\'nun ilk on ölçüsü, Mi majörde, bir oktav pes. Albéniz\'in Asturias\'ı yerine seçildi. Düzenleme.',
    tip: '3. ve 5. ölçülerde her iki notadan biri açık Si teli: sol el yalnız diğer notaya basar. 8. ölçüde 7. pozisyona, 9. ölçüde 9.–12. perdelere kay. Hedef tempo 116.',
    bars: `
\\ts 3 4 r.8 12.1.16 11.1.16 12.1.8 12.2.8 9.2.8 12.2.8 | 5.2.16 7.2.16 5.2.16 4.2.16 5.2.8 4.3.8 6.4.8 4.3.8 |
${s16('2.4 0.2 4.4 0.2 1.3 0.2 2.3 0.2 1.3 0.2 4.4 0.2')} | ${s16('2.4 0.1 4.2 2.2 0.2 0.1 4.2 2.2 0.2 2.3 1.3 4.4')} |
${s16('2.4 0.2 4.4 0.2 1.3 0.2 2.3 0.2 1.3 0.2 4.4 0.2')} | ${s16('2.4 0.1 4.2 2.2 0.2 0.1 4.2 2.2 0.2 2.3 1.3 4.4')} |
${s16('2.4 4.4 1.3 2.3 0.2 2.2 4.2 0.1 2.1 4.1 5.1 2.1')} | ${s16('9.2 7.1 9.3 7.2 9.2 10.2 7.1 9.1 11.1 12.1 9.1 11.1')} |
${s16('12.1 12.2 10.2 12.2 9.2 12.2 10.2 12.2 9.2 12.2 11.3 12.2')} | ${s16('9.3 12.1 11.1 9.1 12.2 9.3 9.1 9.3 12.2 9.3 10.2 9.3')} |
(0.6 2.5 2.4 1.3 0.2 0.1).2{d}
`,
  }),
  e({
    id: 'eser-yaban-arisinin-ucusu',
    title: 'Yaban Arısının Uçuşu (Rimsky-Korsakov)',
    level: 5,
    tempo: 80,
    goal: 'Kromatik onaltılık koşuyu pozisyon değiştirerek eşit ve hızlı çalmak.',
    description: 'Nikolay Rimsky-Korsakov, "Yaban Arısının Uçuşu", açılıştaki iki oktav inen kromatik koşu (iki kez). Mi\'den başlayıp gitara uygun oktavda. Düzenleme.',
    tip: 'Her ölçü iki grup dörtlü: grup başını hafif vurgula. Pozisyon geçişlerini (12 → 5 → 4 → 3. perde) ayrı ayrı çalış. 80\'de eşitse 120, hedef 160 BPM.',
    bars: `
\\ts 2 4 ${s16('12.1 11.1 10.1 9.1 10.1 9.1 8.1 7.1')} | ${s16('8.1 7.1 6.1 5.1 9.2 8.2 7.2 6.2')} | ${s16('5.2 8.3 7.3 6.3 7.3 6.3 5.3 4.3')} | ${s16('5.3 4.3 8.4 7.4 6.4 5.4 4.4 3.4')} |
${s16('12.1 11.1 10.1 9.1 10.1 9.1 8.1 7.1')} | ${s16('8.1 7.1 6.1 5.1 9.2 8.2 7.2 6.2')} | ${s16('5.2 8.3 7.3 6.3 7.3 6.3 5.3 4.3')} | ${s16('5.3 4.3 8.4 7.4 6.4 5.4 4.4 3.4')} |
2.4.2
`,
  }),
];

export const ESERLER: BuiltinLessonDef[] = [...LEVEL_3, ...LEVEL_4, ...LEVEL_5];
