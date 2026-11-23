import { useMemo } from 'react';
import { Repeat } from 'lucide-react';
import type { TrainerPass } from '../../coach/useSpeedTrainer';
import type { NoteScore, Outcome } from '../../coach/scorePass';
import { pitchClassName } from '../../player/noteNames';

const noteName = (m: number) => `${pitchClassName(m)}${Math.floor(Math.round(m) / 12) - 1}`;
import { Button, Sheet } from '../../ui/kit';

const LABEL: Record<Outcome, string> = { clean: 'Clean', missed: 'Missed', wrong: 'Wrong note', late: 'Late', early: 'Early' };
const KINDS: Outcome[] = ['clean', 'missed', 'wrong', 'late', 'early'];
const HINT: Record<Outcome, string> = { clean: 'right note, on time', missed: 'nothing heard', wrong: 'another pitch', late: 'behind the beat', early: 'ahead of the beat' };

function describe(r: NoteScore) {
  const n = r.note;
  const what = n.strum ? 'Strum' : n.midi.length ? n.midi.map(noteName).join(' + ') : 'Muted note';
  const where = n.frets.length === 1 ? ` (string ${n.frets[0].string}, fret ${n.frets[0].fret})` : '';
  const timing = r.deltaMs != null && (r.outcome === 'late' || r.outcome === 'early') ? ` ${r.deltaMs > 0 ? '+' : '−'}${Math.abs(r.deltaMs)} ms` : '';
  const heard = r.outcome === 'wrong' && r.heardMidi != null ? ` — heard ${noteName(Math.round(r.heardMidi))}` : '';
  return `Bar ${n.bar + 1}, beat ${n.beatInBar + 1}: ${what}${where}${timing}${heard}`;
}

/** Details of one scored speed-trainer pass: verdict, tendencies, per bar and every missed / late / early note. */
export function TrainerFeedbackSheet({ open, onOpenChange, pass, threshold, onLoop }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pass: TrainerPass | null;
  threshold: number;
  onLoop: (r: [number, number]) => void;
}) {
  const s = pass?.score;
  const bars = useMemo(() => {
    const m = new Map<number, Record<Outcome, number>>();
    for (const r of s?.notes ?? []) {
      const c = m.get(r.note.bar) ?? { clean: 0, missed: 0, wrong: 0, late: 0, early: 0 };
      c[r.outcome]++;
      m.set(r.note.bar, c);
    }
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [s]);
  if (!pass || !s) return null;
  const problems = s.notes.filter((r) => r.outcome !== 'clean');
  const worst = bars.reduce<[number, number] | null>((w, [bar, c]) => {
    const bad = c.missed + c.wrong + c.late + c.early;
    return bad && (!w || bad > w[1]) ? [bar, bad] : w;
  }, null);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Pass at ${Math.round(pass.speed * 100)}% — ${s.score}%`}
      description={s.score >= threshold ? 'Clean pass: it counts toward the next tempo step.' : `Not clean yet: ${threshold}% of the notes need to be right and on time.`}
      footer={worst ? <Button variant="primary" icon={<Repeat size={15} />} onClick={() => onLoop([worst[0], worst[0]])}>Loop bar {worst[0] + 1}</Button> : undefined}
    >
      <div className="fb">
        {pass.tips.length > 0 && (
          <ul className="trainer-tips">
            {pass.tips.map((t) => <li key={t.text} className={`is-${t.kind}`}>{t.text}</li>)}
          </ul>
        )}
        <ul className="fb-kinds" aria-label="Notes by result">
          {KINDS.map((k) => (
            <li key={k}><span className={`fb-dot is-${k === 'wrong' ? 'missed' : k}`} aria-hidden />{LABEL[k]} <b className="num">{s.counts[k]}</b><small>{HINT[k]}</small></li>
          ))}
        </ul>
        {s.medianDeltaMs != null && <p className="subtle small num">Median timing {s.medianDeltaMs > 0 ? '+' : ''}{Math.round(s.medianDeltaMs)} ms (after removing latency){s.extra ? ` · ${s.extra} extra attack${s.extra === 1 ? '' : 's'}` : ''}.</p>}
        <h3 className="eyebrow">Bar by bar</h3>
        <ul className="fb-bars">
          {bars.map(([bar, c]) => {
            const total = KINDS.reduce((n, k) => n + c[k], 0);
            return (
              <li key={bar}>
                <button type="button" className="fb-bar" onClick={() => onLoop([bar, bar])} aria-label={`Bar ${bar + 1}: ${c.clean} of ${total} clean. Loop it`}>
                  <span className="fb-bar-no num">{bar + 1}</span>
                  <span className="fb-bar-track" aria-hidden>
                    {KINDS.map((k) => (c[k] ? <span key={k} className={`is-${k === 'wrong' ? 'missed' : k}`} style={{ flexGrow: c[k] }} /> : null))}
                  </span>
                  <span className="fb-bar-acc num">{Math.round((c.clean / total) * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
        {problems.length > 0 && (
          <>
            <h3 className="eyebrow">Notes to fix</h3>
            <ul className="trainer-notes small">
              {problems.slice(0, 24).map((r, i) => (
                <li key={i}><span className={`fb-dot is-${r.outcome === 'wrong' ? 'missed' : r.outcome}`} aria-hidden /> <b>{LABEL[r.outcome]}</b> · {describe(r)}</li>
              ))}
            </ul>
          </>
        )}
        <p className="subtle small">Marked in the tab: red = missed or wrong, yellow = early, blue = late.</p>
      </div>
    </Sheet>
  );
}
