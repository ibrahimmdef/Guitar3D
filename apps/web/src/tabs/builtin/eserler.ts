import type { BuiltinLessonDef } from './types';

/**
 * "Classics" pack: well-known themes and openings of public-domain classical works and
 * anonymous/traditional melodies, arranged for guitar in standard tuning. Short excerpts only,
 * no lyrics. Guitar sounds an octave below written pitch, so pitches here are the sounding ones
 * (e.g. Für Elise starts on E4 = open 1st string).
 * Levels: 3 = intermediate, 4 = upper intermediate, 5 = hard; easiest first within each level.
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
    title: 'Amazing Grace (Traditional)',
    level: 3,
    tempo: 80,
    goal: 'Play the melody together with bass notes in 3/4.',
    description: 'Anonymous hymn tune "New Britain" (Amazing Grace) in G major. Melody in first position with a bass note on each downbeat; first verse, arrangement.',
    tip: 'Pluck the downbeat bass and the melody note together with thumb and index finger. Hold long notes for a full three beats and count "one-two-three".',
    bars: `
\\ts 3 4 r.2 0.4.4 | (0.3 3.6).2 0.2.8 0.3.8 | (0.2 3.6).2 2.3.4 | (0.3 3.5).2 2.4.4 | (0.4 3.6).2 0.4.4 |
(0.3 3.6).2 0.2.8 0.3.8 | (0.2 0.6).2 2.3.4 | (3.2 3.6).2{d} | r.2 0.2.4 |
(3.2 3.6).2 0.2.8 0.3.8 | (0.2 0.4).2 2.3.4 | (0.3 3.5).2 2.4.4 | (0.4 3.6).2 0.4.4 |
(0.3 0.6).2 0.2.8 0.3.8 | (0.2 0.4).2 2.3.4 | (0.3 3.6).2{d}
`,
  }),
  e({
    id: 'eser-sakura',
    title: 'Sakura Sakura (Japanese folk song)',
    level: 3,
    tempo: 72,
    goal: 'Play the Japanese pentatonic scale (A-B-C-E-F) in first position.',
    description: 'Anonymous Japanese folk song "Sakura Sakura" in an A minor color, in first position. Full melody, arrangement.',
    tip: 'Don\'t cut off the half notes; keep your finger on the string. Connect the eighth-note pairs (B-A) smoothly, don\'t rush.',
    bars: `
:4 2.3 2.3 0.2.2 | 2.3.4 2.3.4 0.2.2 | 2.3.4 0.2.4 1.2.4 0.2.4 | 2.3.4 0.2.8 2.3.8 3.4.2 |
2.4.4 3.5.4 2.4.4 3.4.4 | 2.4.4 2.4.8 3.5.8 2.5.2 | 2.3.4 0.2.4 1.2.4 0.2.4 | 2.3.4 0.2.8 2.3.8 3.4.2 |
2.4.4 3.5.4 2.4.4 3.4.4 | 2.4.4 2.4.8 3.5.8 2.5.2 | 2.3.4 2.3.4 0.2.2 | 2.3.4 2.3.4 0.2.2 |
2.4.4 3.4.4 0.2.8 2.3.8 3.4.4 | (2.4 0.6).1
`,
  }),
  e({
    id: 'eser-scarborough-fair',
    title: 'Scarborough Fair (Traditional)',
    level: 3,
    tempo: 84,
    goal: 'Play the D Dorian melody in two octaves; add bass and shift position on the second pass.',
    description: 'Anonymous English folk song in D Dorian. The first two lines as single notes in the low octave, then an octave higher with bass. Arrangement.',
    tip: 'On the second pass you shift between the 5th and the 8th–10th frets; look at the target fret before shifting. Count "one-and" on the dotted quarter.',
    bars: `
\\ts 3 4 0.4.2 0.4.4 | 2.3.2 2.3.4 | 2.4.4{d} 3.4.8 2.4.4 | 0.4.2{d} |
r.4 2.3.4 1.2.4 | 3.2.2 1.2.4 | 2.3.4 0.2.4 0.3.4 | 2.3.2{d} |
(3.2 0.4).2 3.2.4 | (5.1 0.4).2 5.1.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 0.4).2{d} |
r.4 5.1.4 8.1.4 | (10.1 0.4).2 8.1.4 | (5.1 3.6).4 7.1.4 3.1.4 | (5.1 0.5).2{d}
`,
  }),
  e({
    id: 'eser-greensleeves',
    title: 'Greensleeves (Traditional)',
    level: 3,
    tempo: 84,
    goal: 'Lock in the dotted rhythm and bass + melody playing in 3/4.',
    description: 'Anonymous English tune (16th century) in A minor. Melody on strings 1–4 with bass notes on the downbeats. First section of the tune, arrangement.',
    tip: 'The dotted quarter + eighth pattern ("daa-da") comes back every bar; play only the melody first, then add the bass. Keep your finger ready for G# (3rd string, 1st fret).',
    bars: `
\\ts 3 4 r.2 2.3.4 | (1.2 0.5).2 3.2.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 3.6).2 0.2.4 |
(0.3 0.6).4{d} 2.3.8 0.2.4 | (1.2 0.5).2 2.3.4 | (2.3 0.5).4{d} 1.3.8 2.3.4 | (0.2 0.6).2 1.3.4 |
(0.1 0.6).2 2.3.4 | (1.2 0.5).2 3.2.4 | (0.1 3.5).4{d} 1.1.8 0.1.4 | (3.2 3.6).2 0.2.4 |
(0.3 0.6).4{d} 2.3.8 0.2.4 | (1.2 0.5).4{d} 0.2.8 2.3.4 | (1.3 0.6).4{d} 4.4.8 1.3.4 | (2.3 0.5).2{d}
`,
  }),
  e({
    id: 'eser-minuet-in-g',
    title: 'Minuet in G (Petzold)',
    level: 3,
    tempo: 92,
    goal: 'Play Baroque minuet eighth-note runs together with bass notes.',
    description: 'Christian Petzold, Minuet in G major (BWV Anh. 114, formerly attributed to Bach). G major, first position; the 16-bar first section, arrangement.',
    tip: 'In the eighth-note runs (G-A-B-C) keep one finger per fret. The F# in bar 7 is on the 4th string, 4th fret; fret it with your pinky.',
    bars: `
\\ts 3 4 (3.2 3.6).4 0.3.8 2.3.8 0.2.8 1.2.8 | (3.2 2.5).4 0.3.4 0.3.4 | (0.1 3.5).4 1.2.8 3.2.8 0.1.8 2.1.8 | (3.1 2.5).4 0.3.4 0.3.4 |
(1.2 0.5).4 3.2.8 1.2.8 0.2.8 2.3.8 | (0.2 3.6).4 1.2.8 0.2.8 2.3.8 0.3.8 | 4.4.4 0.3.8 2.3.8 0.2.8 0.3.8 | (2.3 0.4).2{d} |
(3.2 3.6).4 0.3.8 2.3.8 0.2.8 1.2.8 | (3.2 2.5).4 0.3.4 0.3.4 | (0.1 3.5).4 1.2.8 3.2.8 0.1.8 2.1.8 | (3.1 2.5).4 0.3.4 0.3.4 |
(1.2 0.5).4 3.2.8 1.2.8 0.2.8 2.3.8 | (0.2 3.6).4 1.2.8 0.2.8 2.3.8 0.3.8 | (2.3 0.4).4 0.2.8 2.3.8 0.3.8 4.4.8 | (0.3 3.6).2{d}
`,
  }),
  e({
    id: 'eser-pachelbel-canon',
    title: 'Canon in D (Pachelbel)',
    level: 3,
    tempo: 66,
    goal: 'Play a melody over a repeating bass line (bass + melody independence).',
    description: 'Johann Pachelbel, Canon in D major. First the eight-note bass (D-A-B-F#-G-D-G-A), then the first three variations of the famous melody on top. D major, arrangement.',
    tip: 'Memorize the bass in the first two bars; it stays the same when the melody comes in. In bar 6 get your hand ready in 4th position for the F# with the D bass (4th string 4th fret + 5th string 5th fret).',
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
    title: 'The Blue Danube (Strauss II)',
    level: 3,
    tempo: 120,
    goal: 'Feel the waltz rhythm (bass + two beats); jump between the low and high register.',
    description: 'Johann Strauss II, main waltz theme of "An der schönen blauen Donau". D major; the theme on the low strings, "pam pam" answers on the high strings. Arrangement.',
    tip: 'Count "one-two-three": in the answer bars beat one is the bass (open string), beats two and three are high notes. The B in bar 14 is on the 1st string, 7th fret; shift your hand early.',
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
    title: 'Can-Can (Offenbach)',
    level: 3,
    tempo: 92,
    goal: 'Play sixteenth notes cleanly and evenly in 5th position.',
    description: 'Jacques Offenbach, galop (Can-Can) theme from the operetta "Orpheus in the Underworld". C major, in 5th position (frets 5–8). Arrangement.',
    tip: 'Keep your hand fixed at the 5th fret: index on 5, middle on 6, ring on 7, pinky on 8. Play it at 60 BPM first; the target tempo is around 140.',
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
    goal: 'Play the E-D# oscillation in sixteenths together with the bass arpeggio.',
    description: 'Ludwig van Beethoven, "Für Elise" (WoO 59) A section in A minor. On guitar it sounds an octave lower as written (open 1st string E). Arrangement.',
    tip: 'Keep your pinky ready between E (open 1st string) and D# (2nd string 4th fret). Play the bass notes on the downbeat together with the melody. This tempo is in quarters; the target is around 80.',
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
    title: 'Romance Anónimo (Spanish Romance)',
    level: 3,
    tempo: 60,
    goal: 'Bring out the melody on the 1st string in a triplet arpeggio; shift to 7th and 12th position.',
    description: 'Anonymous Spanish romance ("Spanish Romance") in E minor. The first eight bars of the opening section and the closing chord: triplet arpeggio, melody on the 1st string. Arrangement.',
    tip: 'Three notes per beat: melody (a finger), open 2nd string (m), open 3rd string (i). Play the melody a little louder. In bar 5, don\'t stop in 7th position before going to the 12th fret; slide in one move.',
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
    goal: 'Balance bass, chord and melody at a slow tempo; let the notes ring.',
    description: 'Erik Satie, Gymnopédie No. 1. The first phrase of the famous melody over the Gmaj7 – D major sway; melody an octave lower, chords simplified. Arrangement.',
    tip: 'In each bar the bass is on beat one, the chord on beat two. Play melody notes a little louder than the chord and hold them for all three beats. Satie\'s marking: "slow and painful".',
    bars: `
\\ts 3 4 3.6.4 (4.4 4.3).2 | 0.4.4 (4.4 2.3).2 | 3.6.4 (4.4 4.3).2 | 0.4.4 (4.4 2.3).2 |
3.6.4 (2.1 4.4 4.3).4 5.1.4 | (3.1 0.4).4 (2.1 4.4 2.3).4 2.2.4 | (0.2 3.6).4 (2.2 4.4 4.3).4 3.2.4 | (2.3 0.4).4 4.4.2 |
(4.4 3.6).4 4.3.2 | (4.4 5.5).4 2.3.2 | (4.4 3.6).4 4.3.2 | (4.4 5.5).4 2.3.2 |
(3.6 0.4 0.3 0.2 2.1).2{d}
`,
  }),
  e({
    id: 'eser-dag-kralinin-salonu',
    title: 'In the Hall of the Mountain King (Grieg)',
    level: 4,
    tempo: 100,
    goal: 'Play the chromatic passages cleanly and evenly in eighth notes; the theme in two octaves.',
    description: 'Edvard Grieg, the "In the Hall of the Mountain King" theme from Peer Gynt. B minor; first on the low strings, then an octave higher. Arrangement.',
    tip: 'Play the notes short (staccato) and relax the fretting hand slightly after each note. The piece speeds up: once it\'s clean at 100 BPM go to 120, then 160.',
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
    goal: 'Play the chromatically descending melody while keeping the habanera bass rhythm (dotted eighth + sixteenth).',
    description: 'Georges Bizet, Habanera from the opera Carmen. D minor; the melody descends chromatically on the 1st string from the 10th fret, the open D and A strings play the habanera rhythm. The first phrase twice, instrumental arrangement.',
    tip: 'First memorize the bass rhythm in the first two bars: "D . A F A". The melody slides down the 1st string with one finger; don\'t rush the triplets (C-C-C).',
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
    goal: 'Alternate the melody with the open B string; shift to IV and IX position.',
    description: 'Francisco Tárrega, Lágrima ("Teardrop") prelude, the first eight bars of the E major section. Melody alternates with the open 2nd string in eighths, bass on the downbeats. Arrangement.',
    tip: 'Alternate i-m between the melody note (1st string) and the open B string. In bar 5 move to the 9th-fret barre in one move; connect the melody as if singing.',
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
    goal: 'Play the mazurka melody descending from the 12th fret together with the bass, shifting positions.',
    description: 'Francisco Tárrega, Adelita (mazurka), E minor section (8 bars, repeated). Ornaments (appoggiaturas) simplified. Arrangement.',
    tip: 'Place your hand early for the first note (12th fret); play E-D# legato. Mazurka rhythm: a light accent on beat two.',
    bars: `
\\ts 3 4 (12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (7.2 0.6).8 9.3.8 0.2.8 9.3.8 8.2.8 7.1.8 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (0.3 0.2 0.1 2.4).2 r.4 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (7.2 0.6).8 9.3.8 0.2.8 9.3.8 8.2.8 7.1.8 |
(12.1 0.6).8 11.1.8 8.1.2 | (10.1 0.5).8 8.1.8 7.2.2 | (8.1 7.6).8 7.1.8 8.3.4 8.2.4 | (0.3 0.2 0.1 2.4).2 r.4
`,
  }),
  e({
    id: 'eser-bourree-mi-minor',
    title: 'Bourrée in E Minor (Bach)',
    level: 4,
    tempo: 100,
    goal: 'Play melody and bass independently in two-voice Baroque writing.',
    description: 'Johann Sebastian Bach, Bourrée from Lute Suite BWV 996 in E minor; first section (bass and melody). The low D in the last bar is moved up an octave. Arrangement.',
    tip: 'Let the thumb (p) play only the bass and i-m only the melody. First play the bass voice alone, then the melody alone, and finally combine them. Target tempo 120.',
    bars: `
\\ts 2 2 r.2 r.4 (0.1 3.6).8 (2.1 2.6).8 | (3.1 0.6).4 (2.1 0.5).8 0.1.8 (4.2 2.5).4 (0.1 0.5).8 2.1.8 | (0.2 3.6).4 (2.2 2.6).8 4.2.8 (0.1 0.6).4 (3.2 2.6).8 1.2.8 |
(0.2 3.6).4 (2.3 0.5).8 0.3.8 (4.4 2.5).4 (0.3 0.5).8 2.3.8 | (0.2 3.6).8 2.3.8 (0.3 2.5).8 4.4.8 (2.4 0.6).8 2.6.8 (0.1 3.6).8 (2.1 2.6).8 |
(3.1 0.6).4 (2.1 0.5).8 0.1.8 (4.2 2.5).4 (0.1 0.5).8 2.1.8 | (0.2 3.6).4 (2.2 2.6).8 4.2.8 (0.1 0.6).4 (3.2 2.6).8 1.2.8 |
(0.2 3.6).4 (2.3 3.5).8 0.3.8 (4.4 5.5).4 0.4.8 0.3.8 | (0.3 3.6).2 r.2
`,
  }),
  e({
    id: 'eser-ay-isigi-sonati',
    title: 'Moonlight Sonata (Beethoven)',
    level: 4,
    tempo: 54,
    goal: 'Play the triplet arpeggio evenly and bring out the melody entering on top.',
    description: 'Ludwig van Beethoven, Piano Sonata No. 14 ("Moonlight"), 1st movement opening: triplet arpeggio and the entry of the melody. In D minor as in Tárrega\'s guitar arrangement. Arrangement.',
    tip: 'Count the triplets "trip-a-let", with each beat landing together with the bass. The melody (A, 1st string 5th fret) enters on the last beat of bar 5: play it louder than the arpeggio. Target tempo 60.',
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
    goal: 'Play a fast, clear melody, moving from G major triads to 5th position.',
    description: 'Wolfgang Amadeus Mozart, Serenade K. 525 "Eine kleine Nachtmusik", the first ten bars of the 1st movement (1st violin). G major, an octave lower; ornaments simplified. Arrangement.',
    tip: 'Play the opening "G-D" leaps short and lively. The four thirty-second notes in bar 6 are a trill: play them as eighths first, then speed up. Target tempo 132.',
    bars: `
:4 (3.1 0.2 0.4).4 r.8 3.2.8 3.1.4 r.8 3.2.8 | 3.1.8 3.2.8 3.1.8 7.1.8 10.1.4 r.4 | 8.1.4 r.8 5.1.8 8.1.4 r.8 5.1.8 | 8.1.8 5.1.8 7.2.8 5.1.8 7.3.4 r.4 |
(3.1 0.2 0.4).8 r.8 8.2.4{d} 7.1.8 5.1.8 8.2.8 | 5.1.32 8.2.32 5.1.32 8.2.32 7.2.8 7.2.4{d} 5.1.8 8.1.8 7.2.8 | 5.1.8 8.2.8 8.2.4{d} 7.1.8 5.1.8 8.2.8 | 5.1.32 8.2.32 5.1.32 8.2.32 7.2.8 7.2.4{d} 5.1.8 8.1.8 7.2.8 |
8.2.8 8.2.8 7.2.8 5.2.16 7.2.16 8.2.8 8.2.8 5.1.8 8.2.16 5.1.16 | 7.1.8 7.1.8 8.1.8 7.1.16 8.1.16 10.1.4 r.4 |
(3.6 2.5 0.4 0.3 0.2 3.1).1
`,
  }),
  e({
    id: 'eser-rondo-alla-turca',
    title: 'Turkish March (Mozart)',
    level: 4,
    tempo: 80,
    goal: 'Play sixteenth-note ornament figures and double stops in thirds quickly.',
    description: 'Wolfgang Amadeus Mozart, "Rondo alla Turca", the finale of Piano Sonata K. 331, main theme (first 8 bars). A minor, an octave lower; ornaments simplified. Arrangement.',
    tip: 'The B-A-G#-A figure is like a turn: fingers 4-2-1-2. Hold the double stops in bars 5–7 (A/F#, G/E) with two fingers in 5th position. Target tempo 120.',
    bars: `
\\ts 2 4 r.4 4.3.16 2.3.16 1.3.16 2.3.16 | (1.2 0.5).8 r.8 3.2.16 1.2.16 0.2.16 1.2.16 | (0.1 0.5).8 r.8 1.1.16 0.1.16 4.2.16 0.1.16 |
(7.1 0.5).16 5.1.16 4.1.16 5.1.16 7.1.16 5.1.16 4.1.16 5.1.16 | (8.1 0.5).4 5.1.8 8.1.8 |
(7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (5.1 7.2).8 | (7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (5.1 7.2).8 | (7.1 0.6).8 (5.1 7.2).8 (3.1 5.2).8 (2.1 4.2).8 | (0.1 0.6).4 r.4
`,
  }),
  e({
    id: 'eser-toccata-re-minor',
    title: 'Toccata in D Minor (Bach)',
    level: 4,
    tempo: 60,
    goal: 'Play the free opening motif and the fast sixteenth-note triplet figures.',
    description: 'Johann Sebastian Bach, Toccata and Fugue in D minor BWV 565, opening: the famous descending motif in two octaves, the diminished seventh chord and the "Prestissimo" triplet figures. Simplified guitar arrangement of the organ work.',
    tip: 'Play the opening motif freely, stretching it like a fermata. In the triplet figures (D-E-C#) keep the fretting hand still and speed up only the picking hand. Slow first, then target 80.',
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
    title: 'Korobeiniki (Russian folk song)',
    level: 5,
    tempo: 120,
    goal: 'Play the fast melody in 5th position together with open-string bass notes without losing tempo.',
    description: 'Anonymous Russian folk song "Korobeiniki" (The Peddlers) in A minor. Melody in 5th position, bass on the open strings. A fast dance tune chosen instead of the Tarantella; arrangement.',
    tip: 'Fretting hand fixed at the 5th fret: index 5, middle 6, ring 7, pinky 8. Bass with the thumb, melody with i-m. If it\'s clean at 120, go to 140, then 160 BPM.',
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
    goal: 'Play melody and bass in even, flowing eighths in a Baroque dance rhythm.',
    description: 'Johann Sebastian Bach, main theme of "Gavotte en Rondeau" from Violin Partita No. 3 BWV 1006, in E major, an octave lower. Chosen instead of Brahms\'s Hungarian Dance No. 5. Arrangement.',
    tip: 'The gavotte starts with a two-beat pickup: play the two quarters in the first bar lightly and accent the start of the first full bar. Play the sixteenths in bar 3 (F#-G#) legato. Target tempo 132.',
    bars: `
:4 r.2 (0.2 2.4).4 4.1.4 | (4.1 2.3).4 2.1.8 0.1.8 2.1.4 5.1.4 | (5.1 4.3).2 7.1.8 4.1.8 5.1.8 2.1.8 | 0.2.8 2.1.16 4.1.16 5.1.8 2.1.8 4.1.8 0.1.8 2.1.8 4.2.8 |
0.1.8 0.2.8 1.3.8 2.4.8 1.3.8 0.2.8 0.1.8 4.1.8 | 2.3.8 4.1.8 2.1.8 0.1.8 2.1.8 4.1.8 5.1.8 2.1.8 | (5.1 4.3).2 (0.2 2.4).4 4.1.4 | (2.2 2.3).4 2.1.4 (4.4 2.5).4 4.2.4 | (0.1 2.4).2 r.2
`,
  }),
  e({
    id: 'eser-bourree-mi-major',
    title: 'Bourrée in E Major (Bach)',
    level: 5,
    tempo: 104,
    goal: 'Use first position and the open strings cleanly in fast eighth-note runs.',
    description: 'Johann Sebastian Bach, Bourrée from Violin Partita No. 3 BWV 1006, the first nine bars, in E major, an octave lower. Chosen instead of Monti\'s Czardas. Arrangement.',
    tip: 'Alternate i-m on the eighths; never strike twice with the same finger. The ascending runs in bars 5–8 repeat the same pattern: practice them alone first. Target tempo half note = 80.',
    bars: `
\\ts 2 2 r.2 r.4 (2.4 0.2).4 | (2.3 2.2).4 2.3.8 0.2.8 2.2.8 4.2.8 0.1.4 | 1.3.8 0.2.8 0.1.4 0.1.8 4.2.8 0.1.4 | 4.4.8 1.3.8 2.3.8 0.2.8 2.2.8 2.3.8 0.2.4 |
2.3.8 1.3.8 4.4.8 1.3.8 2.4.4 4.1.8 0.1.8 | 2.1.8 4.2.8 0.2.8 2.2.8 4.2.8 0.1.8 2.1.8 5.1.8 | 4.1.8 0.1.8 0.2.8 4.2.8 0.1.8 2.1.8 4.1.8 7.1.8 |
2.1.8 4.2.8 0.2.8 2.2.8 4.2.8 0.1.8 2.1.8 5.1.8 | 4.1.8 0.1.8 0.2.8 4.2.8 0.1.8 2.1.8 4.1.8 7.1.8 | 0.1.8 4.2.8 2.2.8 4.2.8 0.1.8 4.2.8 2.2.8 0.2.8 |
(0.6 2.5 2.4 1.3 0.2 0.1).1
`,
  }),
  e({
    id: 'eser-prelude-do-major',
    title: 'Prelude in C Major (Bach)',
    level: 5,
    tempo: 66,
    goal: 'Play the wide-spread fingering in a sixteenth-note arpeggio while holding the chord shapes.',
    description: 'Johann Sebastian Bach, Prelude in C major BWV 846 from the Well-Tempered Clavier I, the first seven bars and the closing chord. C major, one chord per bar. Chosen instead of Rossini\'s William Tell Overture. Arrangement.',
    tip: 'Fret the whole chord at the start of each bar and hold it through the bar; the picking hand cycles p-i-m-a. In bar 5 (Am) the E is on the 2nd string, 5th fret. Target tempo 80.',
    bars: `
${preludeBar('3.5', '2.4', '0.3', '1.2', '0.1')} | ${preludeBar('3.5', '0.4', '2.3', '3.2', '1.1')} | ${preludeBar('2.5', '0.4', '0.3', '3.2', '1.1')} | ${preludeBar('3.5', '2.4', '0.3', '1.2', '0.1')} |
${preludeBar('3.5', '2.4', '2.3', '5.2', '5.1')} | ${preludeBar('3.5', '0.4', '4.4', '2.3', '3.2')} | ${preludeBar('2.5', '0.4', '0.3', '3.2', '3.1')} | (3.5 2.4 0.3 1.2 0.1).1
`,
  }),
  e({
    id: 'eser-paganini-kapris-24',
    title: 'Caprice No. 24 (Paganini)',
    level: 5,
    tempo: 76,
    goal: 'Play sixteenth-note figures with position jumps quickly and cleanly.',
    description: 'Niccolò Paganini, No. 24 from the 24 Caprices for violin, the A minor theme (16 bars with the repeat). The violin pitches are taken an octave lower. Arrangement.',
    tip: 'Every bar is the same pattern: long note, sixteenth rest, four sixteenths. Count the rest, don\'t shorten it. First at 60, then target 120 BPM.',
    bars: `
\\ts 2 4 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.8 r.16 2.4.16 2.4.16 1.3.16 4.4.16 2.4.16 | 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.4 2.4.8 r.8 |
2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.8 r.16 2.4.16 2.4.16 1.3.16 4.4.16 2.4.16 | 2.3.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 0.1.4 2.4.8 r.8 |
5.1.8 r.16 5.1.16 5.1.16 6.1.16 5.1.16 3.1.16 | 1.1.8 r.16 3.2.16 3.2.16 1.1.16 0.1.16 3.2.16 | 3.1.8 r.16 3.1.16 3.1.16 5.1.16 3.1.16 1.1.16 | 0.1.8 r.16 1.2.16 1.2.16 0.1.16 3.2.16 1.2.16 |
1.1.8 r.16 0.2.16 0.2.16 3.2.16 1.2.16 0.2.16 | 0.1.8 r.16 2.3.16 2.3.16 1.2.16 0.2.16 2.3.16 | 3.4.8 r.16 4.2.16 2.4.16 0.1.16 3.2.16 0.2.16 | 2.3.4 0.5.8 r.8
`,
  }),
  e({
    id: 'eser-cello-suit-prelud',
    title: 'Cello Suite No. 1 Prelude (Bach)',
    level: 5,
    tempo: 72,
    goal: 'Play a flowing arpeggio in continuous sixteenths using the bass note and open strings.',
    description: 'Johann Sebastian Bach, Cello Suite No. 1 BWV 1007, the first eight bars of the Prelude. In G major and at the same pitch as the cello; first position on guitar. Arrangement.',
    tip: 'Let the first note of each bar (the bass) ring until the next bar. Use the open strings a lot; the fretting hand only presses the changing note. Target tempo 90.',
    bars: `
${s16('3.6 0.4 0.2 2.3 0.2 0.4 0.2 0.4 3.6 0.4 0.2 2.3 0.2 0.4 0.2 0.4')} | ${s16('3.6 2.4 1.2 0.2 1.2 2.4 1.2 2.4 3.6 2.4 1.2 0.2 1.2 2.4 1.2 2.4')} |
${s16('3.6 4.4 1.2 0.2 1.2 4.4 1.2 4.4 3.6 4.4 1.2 0.2 1.2 4.4 1.2 4.4')} | ${s16('3.6 0.3 0.2 2.3 0.2 0.3 0.2 0.3 3.6 0.3 0.2 2.3 0.2 0.3 0.2 4.4')} |
${s16('3.6 2.4 0.2 2.3 0.2 0.3 4.4 0.3 2.4 0.3 4.4 0.3 2.5 0.4 4.5 2.5')} | ${s16('4.5 0.3 2.3 0.3 2.3 0.3 2.3 0.3 4.5 0.3 2.3 0.3 2.3 0.3 2.3 0.3')} |
${s16('4.4 2.3 3.2 2.2 3.2 2.3 0.3 2.3 4.4 2.3 0.3 2.3 0.4 4.4 2.4 0.4')} | ${s16('0.6 2.5 0.3 4.4 0.3 2.5 0.3 2.5 0.6 2.5 0.3 4.4 0.3 2.5 0.3 2.5')}
`,
  }),
  e({
    id: 'eser-recuerdos-de-la-alhambra',
    title: 'Recuerdos de la Alhambra (Tárrega)',
    level: 5,
    tempo: 50,
    goal: 'Play the melody seamlessly with p-a-m-i tremolo technique and the thumb arpeggio evenly.',
    description: 'Francisco Tárrega, "Recuerdos de la Alhambra", the first eight bars of the A minor opening: bass and arpeggio in the thumb, melody in the tremolo. Arrangement.',
    tip: 'Each group is four notes: thumb (p), then the same melody note three times with a-m-i. Even out the four-note group slowly first, then speed up. The tremolo should sound like a single line. Target tempo 76.',
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
    title: 'Summer, Presto (Vivaldi)',
    level: 5,
    tempo: 90,
    goal: 'Play the fast repeated sixteenths (tremolo) and the descending run cleanly.',
    description: 'Antonio Vivaldi, "Summer" (L\'estate) from The Four Seasons, 3rd movement Presto, storm opening (1st violin). G minor, an octave lower. Arrangement.',
    tip: 'On the repeated G notes alternate i-m and play lightly, accenting the note on the downbeat. Practice the descending run in bar 10 separately in 5th position. Target tempo 150.',
    bars: `
\\ts 3 4 ${s16('3.1' + ' 0.3'.repeat(11))} | ${s16('1.1' + ' 0.3'.repeat(11))} | ${s16('4.2' + ' 0.3'.repeat(11))} | ${s16('3.2' + ' 0.3'.repeat(7))} 0.3.8 r.8 | r.2{d} |
${s16('10.1' + ' 7.3'.repeat(11))} | ${s16('8.1' + ' 7.3'.repeat(11))} | ${s16('6.1' + ' 7.3'.repeat(11))} | ${s16('5.1' + ' 7.3'.repeat(7))} 7.3.8 r.8 |
r.16 ${s16('10.1 8.1 6.1 5.1 8.2 7.2 5.2 7.3 5.3 8.4 7.4')} | (3.6 0.4 0.3 3.3).2{d}
`,
  }),
  e({
    id: 'eser-partita-prelud',
    title: 'Partita No. 3 Prelude (Bach)',
    level: 5,
    tempo: 80,
    goal: 'Play "bariolage" with the open B string and 12th-position shifts in continuous sixteenths.',
    description: 'Johann Sebastian Bach, Violin Partita No. 3 BWV 1006, the first ten bars of the Preludio, in E major, an octave lower. Chosen instead of Albéniz\'s Asturias. Arrangement.',
    tip: 'In bars 3 and 5 every other note is the open B string: the fretting hand only presses the other note. Shift to 7th position in bar 8 and to frets 9–12 in bar 9. Target tempo 116.',
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
    title: 'Flight of the Bumblebee (Rimsky-Korsakov)',
    level: 5,
    tempo: 80,
    goal: 'Play the chromatic sixteenth-note run evenly and fast while shifting positions.',
    description: 'Nikolay Rimsky-Korsakov, "Flight of the Bumblebee", the two-octave descending chromatic run from the opening (twice). Starting on E in a guitar-friendly octave. Arrangement.',
    tip: 'Each bar is two groups of four: lightly accent the start of each group. Practice the position shifts (12 → 5 → 4 → 3rd fret) one at a time. If it\'s even at 80 go to 120, target 160 BPM.',
    bars: `
\\ts 2 4 ${s16('12.1 11.1 10.1 9.1 10.1 9.1 8.1 7.1')} | ${s16('8.1 7.1 6.1 5.1 9.2 8.2 7.2 6.2')} | ${s16('5.2 8.3 7.3 6.3 7.3 6.3 5.3 4.3')} | ${s16('5.3 4.3 8.4 7.4 6.4 5.4 4.4 3.4')} |
${s16('12.1 11.1 10.1 9.1 10.1 9.1 8.1 7.1')} | ${s16('8.1 7.1 6.1 5.1 9.2 8.2 7.2 6.2')} | ${s16('5.2 8.3 7.3 6.3 7.3 6.3 5.3 4.3')} | ${s16('5.3 4.3 8.4 7.4 6.4 5.4 4.4 3.4')} |
2.4.2
`,
  }),
];

export const ESERLER: BuiltinLessonDef[] = [...LEVEL_3, ...LEVEL_4, ...LEVEL_5];
