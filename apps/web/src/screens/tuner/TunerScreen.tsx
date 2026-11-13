import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mic, MicOff, Volume2 } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import type { Pitch } from '../../audio/pitch';
import { useMicPitch } from '../../audio/useMicPitch';
import { sequenceTex } from '../../music/tex';
import { IN_TUNE_CENTS, median, needleAngle, readTuner, type TunerReading } from '../../music/tuner';
import { getTuning, tunerTargets } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { Button } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { TuningSelect } from '../TuningSelect';

const WINDOW = 5;
/** Frames (25/s) a string must stay in tune to get its check mark. */
const HOLD_FRAMES = 10;
/** Frames of silence before the reading fades out. */
const SILENT_FRAMES = 30;

const MIC_TEXT: Record<string, string> = {
  asking: 'Mikrofon izni bekleniyor…',
  denied: 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar dene.',
  unsupported: 'Bu tarayıcı mikrofonu desteklemiyor.',
  error: 'Mikrofon açılamadı.',
};

export function TunerScreen() {
  const [settings, set] = useSettings();
  const tuning = getTuning(settings.tuningId);
  const targets = useMemo(() => tunerTargets(tuning), [tuning]);
  const [on, setOn] = useState(false);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [stale, setStale] = useState(true);
  const [tuned, setTuned] = useState<Set<number>>(new Set());
  const [pinned, setPinned] = useState<number | null>(null);
  const buf = useRef<number[]>([]);
  const silent = useRef(0);
  const okFrames = useRef(0);
  const live = useRef({ tuning, pinned });
  live.current = { tuning, pinned };
  const ref = useTexPlayer();

  const onFrame = useCallback((p: Pitch | null) => {
    if (!p) {
      silent.current += 1;
      if (silent.current === SILENT_FRAMES) {
        setStale(true);
        buf.current = [];
        okFrames.current = 0;
      }
      return;
    }
    silent.current = 0;
    buf.current = [...buf.current.slice(-(WINDOW - 1)), p.freq];
    const { tuning: t, pinned: pin } = live.current;
    // A pinned string is always the target, whatever is nearest.
    const target = readTuner(median(buf.current), t, 0, 440, pin ?? undefined);
    if (!target) return;
    setReading(target);
    setStale(false);
    okFrames.current = target.direction === 'ok' ? okFrames.current + 1 : 0;
    if (okFrames.current === HOLD_FRAMES) setTuned((s) => new Set(s).add(target.string));
  }, []);

  const status = useMicPitch(on, onFrame);
  const active = reading && !stale ? reading : null;
  const angle = active ? needleAngle(active.stringCents) : 0;
  const marker: FretNote[] = useMemo(() => {
    const s = active?.string ?? pinned;
    return s ? [{ string: s, fret: 0, state: 'now' }] : [];
  }, [active?.string, pinned]);

  const playRef = (string: number) => {
    setPinned(string);
    ref.play(sequenceTex([{ string, fret: 0 }], { tuning, program: settings.program, tempo: 40 }));
  };

  const dirText = !active
    ? on ? (status === 'on' ? 'Bir teli çal' : MIC_TEXT[status] ?? '') : 'Mikrofonu aç ve bir teli çal'
    : active.direction === 'ok' ? 'Akortlu' : active.direction === 'up' ? 'Sık: ses pes' : 'Gevşet: ses tiz';

  return (
    <div className="screen">
      <ScreenHeader
        title="Akort"
        description="Kromatik akort aleti. Teli tek tek çal; ibre ortada ve yeşilse tamamdır."
        actions={
          <Button variant={on ? 'secondary' : 'primary'} icon={on ? <MicOff size={16} /> : <Mic size={16} />} onClick={() => setOn((v) => !v)}>
            {on ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
          </Button>
        }
      />

      <section className="learn" aria-label="Akort">
        <div className={`tuner${active?.direction === 'ok' ? ' is-ok' : ''}${active ? '' : ' is-idle'}`}>
          <svg className="tuner-gauge" viewBox="0 0 240 140" aria-hidden>
            <path d={arcPath(-50, 50)} className="tg-arc" />
            <path d={arcPath(-IN_TUNE_CENTS, IN_TUNE_CENTS)} className="tg-zone" />
            {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
              const a = (needleAngle(c) - 90) * (Math.PI / 180);
              const r1 = c % 50 === 0 ? 84 : 92;
              return <line key={c} x1={120 + Math.cos(a) * r1} y1={120 + Math.sin(a) * r1} x2={120 + Math.cos(a) * 100} y2={120 + Math.sin(a) * 100} className="tg-tick" />;
            })}
            <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '120px 120px' }} className="tg-needle-g">
              <line x1={120} y1={120} x2={120} y2={30} className="tg-needle" />
            </g>
            <circle cx={120} cy={120} r={5} className="tg-hub" />
          </svg>
          <div className="tuner-note" aria-live="polite">
            <span className="tuner-name">{active ? active.name : '–'}</span>
            <span className="tuner-sub num">
              {active ? `${active.stringCents > 0 ? '+' : ''}${Math.round(active.stringCents)} sent · ${active.freq.toFixed(1)} Hz · hedef ${active.targetName}` : ' '}
            </span>
          </div>
          <p className="tuner-dir" aria-live="polite">
            {active?.direction === 'up' && <ArrowUp size={16} aria-hidden />}
            {active?.direction === 'down' && <ArrowDown size={16} aria-hidden />}
            {active?.direction === 'ok' && <Check size={16} aria-hidden />}
            <span>{dirText}</span>
          </p>
        </div>

        <div className="learn-side">
          <TuningSelect value={tuning.id} onChange={(id) => { set({ tuningId: id }); setTuned(new Set()); setPinned(null); }} />
          <div>
            <h2 className="eyebrow">Teller</h2>
            <ul className="tuner-strings" aria-label="Teller, kalından inceye">
              {targets.map((t) => {
                const isActive = active?.string === t.string;
                return (
                  <li key={t.string}>
                    <button
                      type="button"
                      className={`tuner-string${isActive ? ' is-active' : ''}${pinned === t.string ? ' is-pinned' : ''}`}
                      aria-pressed={pinned === t.string}
                      onClick={() => (pinned === t.string ? setPinned(null) : playRef(t.string))}
                      aria-label={`${t.string}. tel, ${t.name}${tuned.has(t.string) ? ', akortlu' : ''}. Referans sesini çal`}
                    >
                      <span className="ts-num num">{t.string}</span>
                      <span className="ts-name">{t.name}</span>
                      <span className="ts-state" aria-hidden>{tuned.has(t.string) ? <Check size={14} /> : <Volume2 size={14} />}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="subtle small">Bir tele tıklamak referans sesini çalar ve hedefi o tele sabitler. Tekrar tıkla: otomatik.</p>
          </div>
        </div>
      </section>

      <LearnStage notes={marker} beatId={active?.string ?? 0} cameraMode="overview" label={active ? `${active.string}. tel vurgulanıyor` : 'Gitar'} />
    </div>
  );
}

function arcPath(fromCents: number, toCents: number) {
  const p = (c: number) => {
    const a = (needleAngle(c) - 90) * (Math.PI / 180);
    return `${120 + Math.cos(a) * 100} ${120 + Math.sin(a) * 100}`;
  };
  return `M ${p(fromCents)} A 100 100 0 0 1 ${p(toCents)}`;
}
