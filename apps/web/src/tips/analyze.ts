import type { SimpleBar, SimpleNote } from './model';

export type IssueKind = 'shift' | 'stretch' | 'barre' | 'speed' | 'hammer' | 'slide' | 'bend' | 'palmMute' | 'chordChange';

export interface Issue {
  kind: IssueKind;
  bar: number;
  message: string;
  weight: number;
}

export interface BarReport {
  bar: number;
  difficulty: number;
  issues: Issue[];
  notesPerSecond: number;
}

export interface Report {
  bars: BarReport[];
  hardestBars: number[];
  suggestedStartSpeed: number;
  summary: string[];
}

const fretted = (notes: SimpleNote[]) => notes.filter((n) => n.fret > 0);
const minFret = (notes: SimpleNote[]) => Math.min(...fretted(notes).map((n) => n.fret));

const TECHNIQUES: { key: keyof SimpleNote; kind: IssueKind; weight: number; text: string }[] = [
  { key: 'hammer', kind: 'hammer', weight: 1, text: 'Hammer-on / pull-off var: ikinci notayı pena vurmadan, parmağı tel üstüne sertçe indirerek çal.' },
  { key: 'slide', kind: 'slide', weight: 1, text: 'Slide var: kayarken parmak baskısını hafifçe azalt ama teli bırakma.' },
  { key: 'bend', kind: 'bend', weight: 2, text: 'Bend var: tek parmakla değil, arkasına iki parmak daha koyarak bük ve hedef perdenin sesiyle karşılaştır.' },
  { key: 'palmMute', kind: 'palmMute', weight: 0.5, text: 'Palm mute var: sağ elin yan kenarını köprünün hemen önüne hafifçe koy.' },
];

export function analyzeBar(bar: SimpleBar, prevLastNotes: SimpleNote[] | null): BarReport {
  const issues: Issue[] = [];
  const add = (kind: IssueKind, weight: number, message: string) => {
    if (!issues.some((i) => i.kind === kind)) issues.push({ kind, bar: bar.index, message, weight });
  };

  const totalQuarters = bar.beats.reduce((s, b) => s + b.quarters, 0) || 1;
  const noteEvents = bar.beats.filter((b) => b.notes.some((n) => !n.tied)).length;
  const seconds = (totalQuarters * 60) / bar.tempo;
  const nps = noteEvents / seconds;
  if (nps >= 5.5) {
    add('speed', 2 + (nps - 5.5) * 0.6, `Hızlı pasaj (saniyede ~${nps.toFixed(1)} nota): önce %60 hızda döngüye al, her temiz turda %5 artır.`);
  }

  let prev = prevLastNotes;
  let maxShift = 0;
  let shiftTarget = 0;
  for (const beat of bar.beats) {
    const f = fretted(beat.notes);
    if (f.length === 0) continue;
    const lo = minFret(beat.notes);
    const hi = Math.max(...f.map((n) => n.fret));

    if (hi - lo >= 4) {
      add('stretch', 1.5 + (hi - lo - 4), `Geniş açılım (${lo}–${hi}. perdeler): bileği öne it, başparmağı sapın arkasında ortaya indir.`);
    }

    if (beat.notes.length >= 2 && prev && fretted(prev).length > 0) {
      const same = beat.notes.length === prev.length && beat.notes.every((n) => prev!.some((p) => p.string === n.string && p.fret === n.fret));
      if (!same) add('chordChange', 1, 'Akor geçişi var: bir önceki vuruşta sol eli gevşet ve yeni şekli havada hazırla.');
    }

    if (prev && fretted(prev).length > 0) {
      const d = Math.abs(lo - minFret(prev));
      if (d > maxShift) {
        maxShift = d;
        shiftTarget = lo;
      }
    }
    prev = beat.notes;
  }
  if (maxShift >= 5) {
    add('shift', 1.5 + (maxShift - 5) * 0.3, `Pozisyon kayması (~${maxShift} perde, ${shiftTarget}. perdeye): gözünü hedef perdeye kaydırmadan önce çevir ve kaydırırken baskıyı bırak.`);
  }

  const lowStrings = new Map<number, Set<number>>();
  for (const n of bar.beats.flatMap((b) => fretted(b.notes))) {
    if (!lowStrings.has(n.fret)) lowStrings.set(n.fret, new Set());
    lowStrings.get(n.fret)!.add(n.string);
  }
  const allFretted = bar.beats.flatMap((b) => fretted(b.notes));
  if (allFretted.length > 0) {
    const barMin = Math.min(...allFretted.map((n) => n.fret));
    const strings = lowStrings.get(barMin)!;
    if (strings.size >= 2 && (strings.has(6) || strings.has(5)) && [...strings].some((s) => s <= 2)) {
      add('barre', 2, `Barre (${barMin}. perde): işaret parmağını perdeye çok yakın ve hafif yan yatırarak bas; güç parmaktan değil kolun ağırlığından gelsin.`);
    }
  }

  const all = bar.beats.flatMap((b) => b.notes);
  for (const t of TECHNIQUES) if (all.some((n) => n[t.key])) add(t.kind, t.weight, t.text);

  const difficulty = issues.reduce((s, i) => s + i.weight, 0);
  return { bar: bar.index, difficulty, issues, notesPerSecond: nps };
}

export function analyze(bars: SimpleBar[]): Report {
  const reports: BarReport[] = [];
  let prevLast: SimpleBar['beats'][number]['notes'] | null = null;
  for (const bar of bars) {
    reports.push(analyzeBar(bar, prevLast));
    const lastWithNotes = [...bar.beats].reverse().find((b) => b.notes.length > 0);
    if (lastWithNotes) prevLast = lastWithNotes.notes;
  }

  const hardestBars = reports
    .filter((r) => r.difficulty >= 2)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 4)
    .map((r) => r.bar)
    .sort((a, b) => a - b);

  const maxNps = Math.max(0, ...reports.map((r) => r.notesPerSecond));
  const suggestedStartSpeed = maxNps >= 7 ? 0.5 : maxNps >= 5.5 ? 0.6 : maxNps >= 4 ? 0.75 : 0.9;

  const summary: string[] = [];
  if (hardestBars.length) {
    summary.push(`Önce şu ölçülere odaklan: ${hardestBars.map((b) => b + 1).join(', ')}. Her birini ayrı ayrı döngüye al.`);
  }
  summary.push(`Başlangıç hızı önerisi: %${Math.round(suggestedStartSpeed * 100)}. Üst üste 3 temiz tur çalınca %5 artır.`);
  const kinds = new Set(reports.flatMap((r) => r.issues.map((i) => i.kind)));
  if (kinds.has('barre')) summary.push('Barre akorlar var: her gün 2 dakika sadece barre şeklini basıp tek tek telleri kontrol et.');
  if (kinds.has('shift')) summary.push('Pozisyon kaymaları var: kaymaları metronomla, sadece iki nota (kalkış ve varış) olarak ayrıca çalış.');
  return { bars: reports, hardestBars, suggestedStartSpeed, summary };
}
