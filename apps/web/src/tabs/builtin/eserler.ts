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

export const ESERLER: BuiltinLessonDef[] = [...LEVEL_3, ...LEVEL_4];
