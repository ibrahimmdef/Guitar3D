import { useMemo } from 'react';
import { Hand } from 'lucide-react';
import type { model } from '@coderline/alphatab';
import type { FretNote } from '@guitar3d/shared';
import { suggestFingering, type BeatPositions, type FingeringResult } from '../../music/fingering';
import { toTabString } from '../../player/beats';
import { Toggle } from '../../ui/kit';

export interface EasierBar {
  beats: model.Beat[];
  written: BeatPositions[];
  result: FingeringResult;
}

/** The current bar's beats as tab positions, and the easiest fingering for them. */
export function useEasierPosition(track: model.Track | null, bar: number, tuning: number[] | null, capo: number, enabled: boolean): EasierBar | null {
  return useMemo(() => {
    if (!enabled || !track || !tuning) return null;
    const staff = track.staves[0];
    const b = staff?.bars[bar];
    if (!b) return null;
    const n = staff.tuning.length || 6;
    const beats = b.voices[0].beats.filter((x) => !x.isEmpty);
    const written = beats.map((x) => (x.isRest ? [] : x.notes
      .filter((nt) => !nt.isPercussion && !nt.isTieDestination && !nt.isDead)
      .map((nt) => ({ string: toTabString(nt.string, n), fret: nt.fret }))));
    if (!written.some((w) => w.length)) return null;
    return { beats, written, result: suggestFingering(written, tuning, { maxFret: Math.max(5, 15 - capo) }) };
  }, [track, bar, tuning, capo, enabled]);
}

/** Ghost markers for the beat being played: the suggested positions that differ from the tab. */
export function ghostNotes(e: EasierBar | null, beat: model.Beat | null): FretNote[] {
  if (!e || !beat) return [];
  const i = e.beats.indexOf(beat);
  if (i < 0 || !e.result.changed.includes(i)) return [];
  return e.result.beats[i].map((p) => ({ string: p.string, fret: p.fret, finger: p.finger || undefined, state: 'next' as const }));
}

const pos = (b: BeatPositions) => b.map((p) => `${p.string}. tel ${p.fret}`).join(' + ');

export function EasierPositionPanel({ on, onToggle, bar, data }: { on: boolean; onToggle: (v: boolean) => void; bar: number; data: EasierBar | null }) {
  const r = data?.result;
  const saving = r ? Math.max(0, Math.round((1 - r.cost / Math.max(0.01, r.originalCost)) * 100)) : 0;
  return (
    <section className="easier" aria-label="Daha kolay pozisyon">
      <Toggle
        checked={on}
        onChange={onToggle}
        label={<span className="easier-title"><Hand size={15} aria-hidden /> Daha kolay pozisyon</span>}
        description="Bu ölçü için el hareketini en aza indiren tel, perde ve parmak önerisi. Farklı olanlar gitarda hayalet işaretlerle görünür."
      />
      {on && (
        !data ? <p className="muted small">{bar + 1}. ölçüde çalınacak nota yok.</p>
          : r!.changed.length === 0 ? <p className="muted small">{bar + 1}. ölçü zaten rahat bir pozisyonda yazılmış.</p>
            : (
              <div className="easier-body" aria-live="polite">
                <p className="small">{bar + 1}. ölçü: {r!.changed.length} vuruşta başka pozisyon öneriliyor{saving ? `, el hareketi yaklaşık %${saving} azalır` : ''}.</p>
                <ul className="plain-list small">
                  {r!.changed.slice(0, 6).map((i) => (
                    <li key={i}>
                      <span className="num">{i + 1}.</span> vuruş: {pos(data.written[i])} → <strong>{r!.beats[i].map((p) => `${p.string}. tel ${p.fret}${p.finger ? ` (${p.finger}. parmak)` : ''}`).join(' + ')}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )
      )}
    </section>
  );
}
