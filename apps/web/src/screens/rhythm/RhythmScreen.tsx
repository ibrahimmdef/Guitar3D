import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Mic, MicOff, Play, RotateCcw, Square } from 'lucide-react';
import { audioToPerf, click, StepScheduler, strumSound, unlockAudio } from '../../audio/clicks';
import { nearestExpected, offsetLabel, summarizeTiming, verdict, type TimingHit } from '../../audio/onset';
import { MIC_STATUS_LABEL, useMicOnsets } from '../../audio/useMicOnsets';
import { countLabels, getPattern, METERS, parseSteps, PATTERNS, stepSeconds, type Meter, type Step } from '../../music/rhythm';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, SegmentedControl, Slider, Toggle } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';

const CELL = 56;

export function StrokeGlyph({ s, size = 26 }: { s: Step; size?: number }) {
  if (!s) return <span className="stroke-rest" aria-hidden>·</span>;
  const Icon = s.dir === 'down' ? ArrowDown : ArrowUp;
  return (
    <span className={`stroke${s.accent ? ' is-accent' : ''}${s.muted ? ' is-muted' : ''}`} aria-hidden>
      <Icon size={size} strokeWidth={s.accent ? 3 : 2} />
      {s.muted && <span className="stroke-x">×</span>}
    </span>
  );
}

export function strokeName(s: Step) {
  if (!s) return 'boş';
  return `${s.muted ? 'susturmalı ' : ''}${s.accent ? 'vurgulu ' : ''}${s.dir === 'down' ? 'aşağı' : 'yukarı'}`;
}

export function RhythmScreen() {
  const [settings] = useSettings();
  const [meter, setMeter] = useState<Meter>('4/4');
  const [patternId, setPatternId] = useState('eighths');
  const pattern = getPattern(patternId);
  const steps = useMemo(() => parseSteps(pattern.steps), [pattern]);
  const counts = useMemo(() => countLabels(pattern), [pattern]);
  const [bpm, setBpm] = useState(70);
  const [guide, setGuide] = useState(true);
  const [metro, setMetro] = useState(true);
  const [running, setRunning] = useState(false);
  const [mic, setMic] = useState(false);
  const [latency, setLatency] = useState(40);
  const [hits, setHits] = useState<TimingHit[]>([]);
  const [last, setLast] = useState<{ text: string; tone: string } | null>(null);
  const [step, setStep] = useState(-1);

  const trackRef = useRef<HTMLDivElement>(null);
  const t0Perf = useRef(0);
  const sched = useRef<StepScheduler | null>(null);
  const stepSec = stepSeconds(pattern, bpm);
  const n = steps.length;

  const opts = useRef({ guide, metro, vol: settings.metronomeVolume });
  opts.current = { guide, metro, vol: settings.metronomeVolume };

  const stop = () => {
    sched.current?.stop();
    sched.current = null;
    setRunning(false);
    setStep(-1);
  };

  const start = async () => {
    const ctx = await unlockAudio();
    if (!ctx) return;
    sched.current?.stop();
    const s = new StepScheduler(ctx, {
      stepSec,
      leadIn: 0.4,
      onStep: (k, when) => {
        const i = k % n;
        const o = opts.current;
        if (o.metro) click(ctx, when, i === 0 ? 2 : i % pattern.perPulse === 0 ? 1 : 0, o.vol);
        const st = steps[i];
        if (o.guide && st) strumSound(ctx, when, st, o.vol * 0.8);
      },
    });
    const t0 = s.start();
    t0Perf.current = audioToPerf(ctx, t0);
    sched.current = s;
    setHits([]);
    setLast(null);
    setRunning(true);
  };

  // restart with the new timing when the pattern or tempo changes mid-run
  useEffect(() => {
    if (running) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternId, bpm]);
  useEffect(() => () => sched.current?.stop(), []);

  // scroll the lane
  useEffect(() => {
    let raf = 0;
    const bar = n * CELL;
    const loop = () => {
      const el = trackRef.current;
      if (el) {
        if (running) {
          const pos = (performance.now() / 1000 - t0Perf.current) / stepSec;
          const off = -bar + (pos < 0 ? -pos * CELL : -((pos * CELL) % bar));
          el.style.transform = `translate3d(${off}px,0,0)`;
          const k = pos < 0 ? -1 : Math.floor(pos + 0.5) % n;
          setStep((cur) => (cur === k ? cur : k));
        } else el.style.transform = 'translate3d(0,0,0)';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, stepSec, n]);

  const micStatus = useMicOnsets(mic && running, (perf) => {
    const rel = perf - t0Perf.current;
    if (rel < -0.2) return;
    const k = Math.round(rel / stepSec);
    const cand: number[] = [];
    const idx: number[] = [];
    for (let j = k - 2; j <= k + 2; j++) {
      if (j < 0 || !steps[((j % n) + n) % n]) continue;
      cand.push(j * stepSec);
      idx.push(j);
    }
    const h = nearestExpected(cand, rel, Math.min(160, stepSec * 500));
    if (!h) {
      setLast({ text: 'Fazla vuruş', tone: 'early' });
      return;
    }
    const hit = { index: idx[h.index], offsetMs: h.offsetMs };
    setHits((xs) => (xs.some((x) => x.index === hit.index) ? xs : [...xs, hit]));
    setLast({ text: offsetLabel(hit.offsetMs), tone: verdict(hit.offsetMs) });
  }, { latencyMs: latency });

  // strokes that have already passed (for the "missed" count)
  const elapsedStrokes = useMemo(() => {
    if (!running || !mic || !hits.length) return hits.length;
    const maxIdx = Math.max(...hits.map((h) => h.index));
    let c = 0;
    for (let j = 0; j <= maxIdx; j++) if (steps[j % n]) c++;
    return c;
  }, [hits, running, mic, steps, n]);
  const summary = summarizeTiming(hits, elapsedStrokes);

  const meterPatterns = PATTERNS.filter((p) => p.meter === meter);
  const copies = Math.ceil(1800 / (n * CELL)) + 2;
  const lane = Array.from({ length: copies }, (_, c) => steps.map((s, i) => ({ s, i, key: `${c}-${i}` }))).flat();

  return (
    <div className="screen">
      <ScreenHeader
        title="Ritim"
        description="Tokat desenleri: oklar çizgiye geldiğinde vur. Mikrofonu açarsan her vuruşun ne kadar erken ya da geç olduğunu gösterir."
        actions={
          <Button variant="primary" icon={running ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={() => (running ? stop() : void start())}>
            {running ? 'Durdur' : 'Başlat'}
          </Button>
        }
      />

      <section className="rhythm-lane-card" aria-label={`${pattern.name} deseni`}>
        <div className="rhythm-lane" role="img" aria-label={`Desen: ${steps.map(strokeName).join(', ')}`}>
          <div className="rhythm-hitline" aria-hidden />
          <div className="rhythm-track" ref={trackRef}>
            {lane.map(({ s, i, key }) => (
              <div key={key} className={`rhythm-cell${i === 0 ? ' is-bar' : ''}${i % pattern.perPulse === 0 ? ' is-pulse' : ''}${running && i === step ? ' is-now' : ''}`} style={{ width: CELL }}>
                <StrokeGlyph s={s} />
                <span className="rhythm-count num">{counts[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rhythm-static" aria-hidden>
          {steps.map((s, i) => (
            <span key={i} className={`rhythm-static-cell${running && i === step ? ' is-now' : ''}`}>
              <StrokeGlyph s={s} size={18} />
              <small className="num">{counts[i]}</small>
            </span>
          ))}
        </div>
        <p className="muted small">{pattern.hint}</p>
      </section>

      <div className="rhythm-grid">
        <section className="learn-side" aria-label="Desen seçimi">
          <SegmentedControl<Meter>
            aria-label="Ölçü"
            value={meter}
            onChange={(m) => {
              setMeter(m);
              setPatternId(PATTERNS.find((p) => p.meter === m)!.id);
            }}
            options={METERS.map((m) => ({ value: m.id, label: m.label }))}
          />
          <ChipGroup label="Desen" value={patternId} onChange={setPatternId} options={meterPatterns.map((p) => ({ value: p.id, label: p.name, hint: `Seviye ${p.level}` }))} />
          <Slider label={pattern.meter === '6/8' ? 'Tempo (noktalı dörtlük)' : 'Tempo'} value={bpm} min={40} max={160} onChange={setBpm} format={(v) => `${v} BPM`} />
          <Toggle checked={metro} onChange={setMetro} label="Metronom" />
          <Toggle checked={guide} onChange={setGuide} label="Rehber vuruş sesi" description="Her okta yumuşak bir tokat sesi." />
        </section>

        <section className="learn-side" aria-label="Zamanlama">
          <div className="learn-title-row">
            <div>
              <h2 className="section-title">Zamanlama</h2>
              <p className="muted small">{mic ? MIC_STATUS_LABEL[running ? micStatus : 'off'] : 'Mikrofonla vuruşların ölçülür.'}</p>
            </div>
            <Button size="sm" variant={mic ? 'secondary' : 'primary'} icon={mic ? <MicOff size={15} /> : <Mic size={15} />} onClick={() => setMic((v) => !v)}>
              {mic ? 'Kapat' : 'Mikrofon'}
            </Button>
          </div>
          <p className={`timing-last tone-${last?.tone ?? 'idle'}`} role="status" aria-live="polite">
            {last?.text ?? (mic ? (running ? 'Çalmaya başla' : 'Başlat ve çal') : '—')}
          </p>
          <div className="stat-row">
            <div className="stat"><span className="stat-label">Puan</span><span className="stat-value num">{summary.score}</span></div>
            <div className="stat"><span className="stat-label">Zamanında</span><span className="stat-value num">{summary.onTime}<small>/ {elapsedStrokes}</small></span></div>
            <div className="stat"><span className="stat-label">Erken / geç</span><span className="stat-value num">{summary.early} / {summary.late}</span></div>
            <div className="stat"><span className="stat-label">Eğilim</span><span className="stat-value num">{summary.hits ? `${summary.meanOffsetMs > 0 ? '+' : ''}${summary.meanOffsetMs}` : '–'}<small>ms</small></span></div>
          </div>
          <p className="subtle small">{summary.hits >= 4 ? (summary.meanOffsetMs < -20 ? 'Acele ediyorsun: metronomu dinle, vuruşu bekle.' : summary.meanOffsetMs > 20 ? 'Geride kalıyorsun: eli bir öncekinden hemen sonra hazırla.' : 'Tempo dengeli.') : 'Eksi değer erken, artı değer geç demektir.'}</p>
          <Slider label="Mikrofon gecikmesi" value={latency} min={0} max={200} step={5} onChange={setLatency} format={(v) => `${v} ms`} />
          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => { setHits([]); setLast(null); }}>Sıfırla</Button>
        </section>
      </div>
    </div>
  );
}
