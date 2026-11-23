import { model } from '@coderline/alphatab';
import type { FretNote } from '@guitar3d/shared';
import type { NoteScore, Outcome } from './scorePass';

/** Tab colours of trainer mistakes (match the feedback sheet: red, yellow, blue). */
export const MARK_COLORS: Record<Exclude<Outcome, 'clean'>, string> = { missed: '#f2666b', wrong: '#f2666b', early: '#f5b83d', late: '#8fa3c7' };
const PARTS = [model.NoteSubElement.GuitarTabFretNumber, model.NoteSubElement.StandardNotationNoteHead, model.NoteSubElement.StandardNotationAccidentals];

/**
 * Colours the missed / wrong / early / late notes of a pass in the tab. Returns a function that
 * puts the previous colours back (auto-transcription marks survive). Caller re-renders.
 */
export function markPassNotes(track: model.Track, results: NoteScore[]): () => void {
  const saved: { note: model.Note; colors: (model.Color | undefined)[]; hadStyle: boolean }[] = [];
  const staff = track.staves[0];
  for (const r of results) {
    if (r.outcome === 'clean') continue;
    const c = model.Color.fromJson(MARK_COLORS[r.outcome]);
    const beat = staff?.bars[r.note.bar]?.voices[0]?.beats[r.note.beat];
    if (!c || !beat) continue;
    for (const note of beat.notes) {
      if (note.isTieDestination || note.isPercussion) continue;
      saved.push({ note, hadStyle: !!note.style, colors: PARTS.map((p) => note.style?.colors.get(p) ?? undefined) });
      note.style ??= new model.NoteStyle();
      for (const p of PARTS) note.style.colors.set(p, c);
    }
  }
  return () => {
    for (const s of saved.reverse()) {
      if (!s.hadStyle) {
        s.note.style = undefined;
        continue;
      }
      PARTS.forEach((p, i) => {
        const prev = s.colors[i];
        if (prev) s.note.style!.colors.set(p, prev);
        else s.note.style!.colors.delete(p);
      });
    }
  };
}

/** Up to `max` problem notes as fretboard markers (worst first: missed / wrong, then the latest / earliest). */
export function problemMarkers(results: NoteScore[], max = 4): FretNote[] {
  const rank = (r: NoteScore) => (r.outcome === 'missed' || r.outcome === 'wrong' ? 1000 : Math.abs(r.deltaMs ?? 0));
  const seen = new Set<string>();
  const out: FretNote[] = [];
  for (const r of results.filter((x) => x.outcome !== 'clean').sort((a, b) => rank(b) - rank(a))) {
    for (const f of r.note.frets) {
      const k = `${f.string}:${f.fret}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ string: f.string, fret: f.fret, state: 'now', tone: r.outcome === 'wrong' ? 'missed' : (r.outcome as 'missed' | 'late' | 'early') });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}
