import { useMemo, useState } from 'react';
import { Check, ExternalLink, Pause, Play, SkipForward, Square } from 'lucide-react';
import { searchChords, voicingNotes } from '../../music/chords';
import { getScale, scaleMarkers, scalePositions } from '../../music/scales';
import { noteName } from '../../music/notes';
import { getTuning } from '../../music/tunings';
import { ChordDiagram } from '../../ui/ChordDiagram';
import { Button, useToast } from '../../ui/kit';
import { navigate, playLesson } from '../../ui/router';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { formatDuration } from '../progress/stats';
import { advanceRun, dayNumber, formatClock, pauseRun, resumeRun, startRun, STEP_LABEL, stepElapsed, stepRemaining, type RoutineLength, type RoutineStep } from './routines';
import { finishRun, routineFor, setRun, useNow, useRun } from './routineStore';

const LENGTHS: { length: RoutineLength; blurb: string }[] = [
  { length: 10, blurb: 'Kısa ama her gün: seriyi bozma.' },
  { length: 20, blurb: 'Dengeli bir günlük pratik.' },
  { length: 30, blurb: 'Parçaya daha çok zaman.' },
];

export function RoutinesScreen() {
  const run = useRun();
  const today = dayNumber();
  return (
    <div className="screen">
      <ScreenHeader title="Rutinler" description="“Bugün ne çalışsam?” Hazır seans seç: ısınma → teknik → parça → serbest. Sayaç seni adım adım götürür." />
      {run ? <Runner /> : (
        <ul className="routine-grid">
          {LENGTHS.map(({ length, blurb }) => {
            const r = routineFor(length, today);
            return (
              <li key={length} className="routine-card">
                <div className="routine-card-head">
                  <span className="routine-min num">{length}<small>dk</small></span>
                  <p className="muted small">{blurb}</p>
                </div>
                <ol className="routine-steps">
                  {r.steps.map((s, i) => (
                    <li key={i}>
                      <span className="routine-step-kind">{STEP_LABEL[s.kind]}</span>
                      <span className="routine-step-title">{s.title}</span>
                      <span className="subtle small num">{Math.round(s.seconds / 60)} dk</span>
                    </li>
                  ))}
                </ol>
                <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => setRun(startRun(length, today, Date.now()))}>
                  Başlat
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Runner() {
  const run = useRun()!;
  const toast = useToast();
  const routine = routineFor(run.length, run.day);
  const running = run.runningSince != null;
  const now = useNow(running);
  const step = routine.steps[run.step];
  if (!step) return null;
  const remaining = stepRemaining(routine, run, now);
  const frac = Math.min(1, stepElapsed(run, now) / step.seconds);

  const next = () => {
    const { state, finished } = advanceRun(routine, run, Date.now());
    if (finished) {
      const secs = finishRun(state);
      toast({ tone: 'success', title: 'Rutin bitti!', description: `${formatDuration(secs)} çalıştın.` });
    } else setRun(state);
  };
  const stop = () => {
    const secs = finishRun(run);
    toast({ tone: 'info', title: 'Rutin bitirildi', description: secs >= 20 ? `${formatDuration(secs)} kaydedildi.` : 'Kaydedilecek kadar uzun değildi.' });
  };

  return (
    <div className="runner">
      <ol className="runner-steps" aria-label={routine.title}>
        {routine.steps.map((s, i) => (
          <li key={i} className={i < run.step ? 'done' : i === run.step ? 'current' : ''} aria-current={i === run.step ? 'step' : undefined}>
            <span className="flow-dot num" aria-hidden>{i < run.step ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            <span>
              <span className="routine-step-kind">{STEP_LABEL[s.kind]} · {Math.round(s.seconds / 60)} dk</span>
              <span className="routine-step-title">{s.title}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="runner-main" aria-labelledby="runner-title">
        <div className="runner-head">
          <div>
            <span className="eyebrow">{STEP_LABEL[step.kind]} · {run.step + 1}/{routine.steps.length}</span>
            <h2 id="runner-title" className="learn-title">{step.title}</h2>
            <p className="muted">{step.detail}</p>
          </div>
          <div className="runner-clock" role="timer" aria-label={`Kalan süre ${formatClock(remaining)}`}>
            <svg viewBox="0 0 120 120" aria-hidden>
              <circle cx="60" cy="60" r="52" className="rc-track" />
              <circle cx="60" cy="60" r="52" className="rc-fill" style={{ strokeDasharray: `${2 * Math.PI * 52}`, strokeDashoffset: `${2 * Math.PI * 52 * frac}` }} />
            </svg>
            <span className="num">{formatClock(remaining)}</span>
          </div>
        </div>
        <div className="learn-row">
          <Button variant="primary" icon={running ? <Pause size={15} /> : <Play size={15} fill="currentColor" />} onClick={() => setRun(running ? pauseRun(run, Date.now()) : resumeRun(run, Date.now()))}>
            {running ? 'Duraklat' : 'Devam et'}
          </Button>
          <Button icon={<Check size={15} />} onClick={next}>{run.step + 1 < routine.steps.length ? 'Bitti, sonraki' : 'Rutini bitir'}</Button>
          <Button variant="ghost" icon={<SkipForward size={15} />} onClick={next}>Atla</Button>
          <Button variant="ghost" icon={<Square size={14} />} onClick={stop}>Durdur ve kaydet</Button>
        </div>
        <StepContent step={step} />
      </section>
    </div>
  );
}

function StepContent({ step }: { step: RoutineStep }) {
  const [settings] = useSettings();
  const [chordIdx, setChordIdx] = useState(0);
  const t = step.target;
  const chords = useMemo(() => (t.type === 'chords' ? t.names.map((n) => searchChords({ text: n }).find((v) => v.name === n && v.shape === 'open') ?? searchChords({ text: n })[0]).filter(Boolean) : []), [t]);
  const scale = useMemo(() => {
    if (t.type !== 'scale') return null;
    const pos = scalePositions(t.root, t.scaleId, getTuning(settings.tuningId))[t.position];
    return pos ? scaleMarkers(pos.notes) : null;
  }, [t, settings.tuningId]);

  if (t.type === 'lesson') {
    return (
      <div className="runner-content">
        <p className="muted small">Ders oynatıcıda açılır; sayaç üstte küçük bir şeritte sürer.</p>
        <Button variant="primary" icon={<ExternalLink size={15} />} onClick={() => navigate(playLesson(t.id))}>Dersi aç</Button>
      </div>
    );
  }
  if (t.type === 'chords') {
    const sel = chords[chordIdx % Math.max(1, chords.length)];
    return (
      <div className="learn">
        {sel && <LearnStage notes={voicingNotes(sel)} beatId={chordIdx} label={`${sel.name} akoru`} />}
        <div className="learn-side">
          <div className="runner-chords" role="group" aria-label="Akorlar">
            {chords.map((v, i) => (
              <button key={v.id} type="button" className={`chord-card${i === chordIdx ? ' is-on' : ''}`} aria-pressed={i === chordIdx} onClick={() => setChordIdx(i)}>
                <ChordDiagram voicing={v} size={72} />
                <span className="chord-card-name">{v.name}</span>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => navigate({ name: 'chords' })}>Akor kütüphanesi</Button>
        </div>
      </div>
    );
  }
  if (t.type === 'scale') {
    return (
      <div className="learn">
        {scale && <LearnStage notes={scale} beatId={1} label={`${noteName(t.root)} ${getScale(t.scaleId).label}`} />}
        <div className="learn-side">
          <p className="muted small">Kökler dolu, diğer notalar halka işaretli. Kutuyu yukarı ve aşağı çal.</p>
          <Button size="sm" onClick={() => navigate({ name: 'scales' })}>Gamlar ekranı</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="runner-content">
      <p className="muted small">Kütüphaneden bir parça seç ya da bugünkü gamla doğaçla. Sayaç sürüyor.</p>
      <Button onClick={() => navigate({ name: 'library' })}>Kütüphane</Button>
    </div>
  );
}
