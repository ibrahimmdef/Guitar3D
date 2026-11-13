import { useEffect } from 'react';
import { ListChecks, Pause, Play, SkipForward } from 'lucide-react';
import { IconButton, useToast } from '../../ui/kit';
import { routeHref, type Route } from '../../ui/router';
import { formatDuration } from '../progress/stats';
import { advanceRun, formatClock, pauseRun, resumeRun, STEP_LABEL, stepRemaining } from './routines';
import { finishRun, routineFor, setRun, useNow, useRun } from './routineStore';

/**
 * Keeps a running routine ticking on every screen: advances to the next step when the countdown
 * ends, records the routine when it is over, and shows a small floating bar outside #/routines.
 */
export function RoutineBar({ route }: { route: Route }) {
  const run = useRun();
  const toast = useToast();
  const now = useNow(!!run && run.runningSince != null);
  const routine = run ? routineFor(run.length, run.day) : null;
  const remaining = run && routine ? stepRemaining(routine, run, now) : 0;

  useEffect(() => {
    if (!run || !routine || run.runningSince == null || remaining > 0) return;
    const { state, finished } = advanceRun(routine, run, Date.now());
    if (finished) {
      const secs = finishRun(state);
      toast({ tone: 'success', title: 'Rutin bitti!', description: `${formatDuration(secs)} çalıştın. İlerleme ekranına kaydedildi.` });
    } else {
      setRun(state);
      const next = routine.steps[state.step];
      toast({ tone: 'info', title: `Sıradaki: ${STEP_LABEL[next.kind]}`, description: next.title });
    }
  }, [run, routine, remaining, toast]);

  if (!run || !routine || route.name === 'routines') return null;
  const step = routine.steps[run.step];
  if (!step) return null;
  const running = run.runningSince != null;
  return (
    <aside className="routine-bar" aria-label="Süren rutin">
      <a className="routine-bar-main" href={routeHref({ name: 'routines' })}>
        <ListChecks size={16} aria-hidden />
        <span className="routine-bar-text">
          <span className="routine-bar-step">{STEP_LABEL[step.kind]} · {run.step + 1}/{routine.steps.length}</span>
          <span className="routine-bar-title">{step.title}</span>
        </span>
        <span className="routine-bar-clock num" aria-label={`Kalan süre ${formatClock(remaining)}`}>{formatClock(remaining)}</span>
      </a>
      <IconButton size="sm" label={running ? 'Duraklat' : 'Devam et'} icon={running ? <Pause size={15} /> : <Play size={15} />} onClick={() => setRun(running ? pauseRun(run, Date.now()) : resumeRun(run, Date.now()))} />
      <IconButton
        size="sm"
        label="Sonraki adım"
        icon={<SkipForward size={15} />}
        onClick={() => {
          const { state, finished } = advanceRun(routine, run, Date.now());
          if (finished) finishRun(state);
          else setRun(state);
        }}
      />
    </aside>
  );
}
