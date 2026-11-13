import { Fragment, memo, useMemo } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { model } from '@coderline/alphatab';
import { struckNotes, toTabString, upcomingBeats, type BeatLike } from '../../player/beats';
import { chordName, cueLabel, stringLetters } from '../../player/noteNames';
import type { Section } from '../../player/sections';

interface Cue {
  label: string;
  chord: string | null;
}

function cueOf(beat: BeatLike, stringCount: number, letters: string[], held: boolean): Cue | null {
  const notes = held && !beat.isRest ? beat.notes.filter((n) => !n.isPercussion) : struckNotes(beat);
  if (!notes.length) return null;
  const label = cueLabel(notes.map((n) => ({ string: toTabString(n.string, stringCount), fret: n.fret, muted: n.isDead })), letters);
  const pitches = notes.filter((n) => !n.isDead && n.realValue != null).map((n) => n.realValue!);
  return { label, chord: chordName(pitches) };
}

interface Props {
  beat: model.Beat | null;
  track: model.Track | null;
  currentBar: number;
  barCount: number;
  sections: Section[];
  activeSection: number;
  loop: [number, number] | null;
  onSection: (index: number, loop: boolean) => void;
  /** Metronome pulse: counter, beat in bar; null when stopped. */
  pulse: { n: number; beat: number } | null;
  /** Wait-mode feedback and running score. */
  listen: { feedback: 'hit' | 'miss' | null; hits: number; firstTry: number; status: string } | null;
}

/** "Sıradaki" strip under the header: current and next notes as string·fret, sections and bar. */
export const CueStrip = memo(function CueStrip({ beat, track, currentBar, barCount, sections, activeSection, loop, onSection, pulse, listen }: Props) {
  const stringCount = track?.staves[0]?.tuning.length || 6;
  const letters = useMemo(() => stringLetters(track?.staves[0]?.tuning, stringCount), [track, stringCount]);
  const cues = useMemo(() => {
    if (!beat) return [];
    const now = cueOf(beat, stringCount, letters, true);
    const next = upcomingBeats(beat, 3).map((b) => cueOf(b, stringCount, letters, false));
    return [now, ...next];
  }, [beat, stringCount, letters]);

  const fb = listen?.feedback;
  return (
    <div className="cue" role="region" aria-label="Sıradaki notalar">
      <div className={`cue-notes${fb ? ` is-${fb}` : ''}`}>
        <span className="cue-eyebrow">Sıradaki</span>
        {cues.length === 0 ? (
          <span className="cue-empty">Çalınca notalar burada görünür</span>
        ) : (
          <ol className="cue-list" aria-live="off">
            {cues.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <li aria-hidden className="cue-arrow"><ArrowRight size={12} /></li>}
                <li className={`cue-item${i === 0 ? ' is-now' : ''}`} aria-label={i === 0 ? `Şimdi: ${c?.label ?? 'es'}` : `Sonra: ${c?.label}`}>
                  <span className="cue-frets num">{c?.label ?? '—'}</span>
                  {c?.chord && <span className="cue-chord">{c.chord}</span>}
                </li>
              </Fragment>
            ))}
          </ol>
        )}
        {listen && (
          <span className="cue-listen" role="status" aria-live="polite">
            {fb === 'hit' && <Check size={14} aria-label="Doğru" />}
            {fb === 'miss' && <X size={14} aria-label="Yanlış nota" />}
            <span className="num">{listen.status || `${listen.firstTry}/${listen.hits}`}</span>
          </span>
        )}
      </div>

      {sections.length > 1 && (
        <div className="cue-sections" role="group" aria-label="Bölümler (tıkla: atla, Shift+tıkla: döngü)">
          {sections.map((s, i) => {
            const looped = !!loop && loop[0] === s.startBar && loop[1] === s.endBar;
            const range = s.startBar === s.endBar ? `${s.startBar + 1}` : `${s.startBar + 1}–${s.endBar + 1}`;
            return (
              <button
                key={s.label}
                type="button"
                className={`sec-chip${i === activeSection ? ' is-active' : ''}${looped ? ' is-looped' : ''}`}
                aria-current={i === activeSection ? 'true' : undefined}
                aria-pressed={looped}
                title={`${s.name ? `${s.name} · ` : ''}Ölçü ${range} — Shift+tıkla: döngü`}
                aria-label={`Bölüm ${s.label}${s.name ? ` (${s.name})` : ''}, ölçü ${range}`}
                onClick={(e) => onSection(i, e.shiftKey)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="cue-bar num" aria-label={`Ölçü ${currentBar + 1} / ${barCount}`}>
        <span
          key={pulse?.n ?? -1}
          className={`pulse${pulse ? ' is-on' : ''}${pulse?.beat === 0 ? ' is-down' : ''}`}
          aria-hidden
        />
        Ölçü <b>{barCount ? currentBar + 1 : '–'}</b>
        <span className="subtle"> / {barCount || '–'}</span>
      </div>
    </div>
  );
});
