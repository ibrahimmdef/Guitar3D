import { useEffect, useMemo, useRef, useState } from 'react';
import { Ear, Play, SkipForward } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import {
  checkNeck, earTex, intervalDef, intervalQuestion, neckQuestion, noteLabelTr, placeNote, QUALITY_LABEL, qualityQuestion, questionGroups, shouldLevelUp,
  INTERVAL_LEVELS, QUALITY_LEVELS, type IntervalMode, type IntervalQuestion, type NeckQuestion, type QualityQuestion,
} from '../../music/ear';
import { accuracyPct, initialScore, scoreAnswer } from '../../music/fretGame';
import { getTuning } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, SegmentedControl } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';

type Game = 'interval' | 'quality' | 'neck';
type Q = IntervalQuestion | QualityQuestion | NeckQuestion;

const LEVEL_COUNT: Record<Game, number> = { interval: INTERVAL_LEVELS.length, quality: QUALITY_LEVELS.length, neck: 3 };
const NECK_LEVELS = ['Boş teller', 'Perde 0–5, aynı oktav', 'Perde 0–12, oktav serbest'];
const PROGRESS_KEY = 'guitar3d.ear.v1';

function loadLevels(): Record<Game, number> {
  try {
    return { interval: 1, quality: 1, neck: 1, ...JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') };
  } catch {
    return { interval: 1, quality: 1, neck: 1 };
  }
}

export function EarScreen() {
  const [settings] = useSettings();
  const tuning = getTuning(settings.tuningId);
  const player = useTexPlayer();
  const [game, setGame] = useState<Game>('interval');
  const [levels, setLevels] = useState(loadLevels);
  const level = levels[game];
  const [mode, setMode] = useState<IntervalMode | 'mixed'>('up');
  const [q, setQ] = useState<Q | null>(null);
  const [answered, setAnswered] = useState<null | { ok: boolean; text: string }>(null);
  const [score, setScore] = useState(initialScore);
  const [recent, setRecent] = useState<boolean[]>([]);
  const [marks, setMarks] = useState<FretNote[]>([]);
  const [beat, setBeat] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(levels));
    } catch {
      /* ignore */
    }
  }, [levels]);

  const play = (question: Q | null = q) => {
    if (!question) return;
    const tex = earTex(questionGroups(question), { tuning, program: settings.program });
    if (tex) player.play(tex);
  };

  const ask = () => {
    const modes: IntervalMode[] = mode === 'mixed' ? ['up', 'down', 'together'] : [mode];
    const next: Q = game === 'interval' ? intervalQuestion(level, Math.random, modes) : game === 'quality' ? qualityQuestion(level) : neckQuestion(level, tuning);
    setQ(next);
    setAnswered(null);
    setMarks([]);
    asked.current = performance.now();
    play(next);
  };

  // a new game or level starts fresh
  useEffect(() => {
    setQ(null);
    setAnswered(null);
    setRecent([]);
    setMarks([]);
  }, [game, level]);

  const judge = (ok: boolean, text: string) => {
    if (answered) return;
    setScore((s) => scoreAnswer(s, ok, performance.now() - asked.current).state);
    setRecent((r) => [...r, ok].slice(-10));
    setAnswered({ ok, text });
  };

  const answerInterval = (semi: number) => {
    if (!q || q.kind !== 'interval') return;
    const right = intervalDef(q.semitones).name;
    judge(semi === q.semitones, semi === q.semitones ? `Doğru: ${right}` : `Yanlış. Doğrusu: ${right}`);
  };
  const answerQuality = (t: string) => {
    if (!q || q.kind !== 'quality') return;
    const right = QUALITY_LABEL[q.quality];
    judge(t === q.quality, t === q.quality ? `Doğru: ${right}` : `Yanlış. Doğrusu: ${right}`);
  };
  const onFretClick = (string: number, fret: number) => {
    if (!q || q.kind !== 'neck' || answered) return;
    const ok = checkNeck(q, string, fret, tuning);
    const pos = placeNote(q.midi, tuning);
    setMarks(ok ? [{ string, fret, state: 'now' }] : [{ string, fret, state: 'now', muted: true }, ...(pos ? [{ ...pos, state: 'next' as const }] : [])]);
    setBeat((b) => b + 1);
    judge(ok, ok ? `Doğru: ${noteLabelTr(q.midi)}` : `Yanlış. Çalınan: ${noteLabelTr(q.midi)}`);
  };

  const canLevelUp = shouldLevelUp(recent) && level < LEVEL_COUNT[game];
  const levelOptions = useMemo(
    () => Array.from({ length: LEVEL_COUNT[game] }, (_, i) => ({ value: String(i + 1), label: `Seviye ${i + 1}`, hint: game === 'neck' ? NECK_LEVELS[i] : undefined })),
    [game],
  );

  return (
    <div className="screen">
      <ScreenHeader title="Kulak eğitimi" description="Dinle, tanı, cevapla. Kısa turlar; 10 sorudan 8'ini bilince bir üst seviye açılır." />
      <div className="p2-stack">
        <SegmentedControl<Game>
          aria-label="Oyun"
          value={game}
          onChange={setGame}
          options={[{ value: 'interval', label: 'Aralık' }, { value: 'quality', label: 'Akor türü' }, { value: 'neck', label: 'Sapta bul' }]}
        />
        <ChipGroup label="Seviye" value={String(level)} onChange={(v) => setLevels((l) => ({ ...l, [game]: Number(v) }))} options={levelOptions} />
        {game === 'interval' && (
          <ChipGroup
            label="Çalış"
            value={mode}
            onChange={(v) => setMode(v as IntervalMode | 'mixed')}
            options={[{ value: 'up', label: 'Yukarı' }, { value: 'down', label: 'Aşağı' }, { value: 'together', label: 'Birlikte' }, { value: 'mixed', label: 'Karışık' }]}
          />
        )}
      </div>

      <section className={game === 'neck' ? 'learn ear-section' : 'ear-section'} aria-label="Soru">
        {game === 'neck' && (
          <LearnStage notes={marks} beatId={beat} cameraMode="overview" label="Duyduğun notayı sapta bul ve tıkla" onFretClick={onFretClick} />
        )}
        <div className="learn-side">
          <div className="p2-row">
            <Button variant="primary" icon={q && !answered ? <Play size={15} fill="currentColor" /> : <Ear size={15} />} onClick={() => (q && !answered ? play() : ask())}>
              {!q ? 'Başla' : answered ? 'Sonraki soru' : 'Tekrar dinle'}
            </Button>
            {q && !answered && <Button variant="ghost" icon={<SkipForward size={15} />} onClick={ask}>Atla</Button>}
          </div>
          {q?.kind === 'interval' && (
            <div className="answer-grid" role="group" aria-label="Aralık seç">
              {q.options.map((s) => (
                <button key={s} type="button" className={`answer${answered && s === q.semitones ? ' is-right' : ''}`} disabled={!!answered} onClick={() => answerInterval(s)}>
                  <strong>{intervalDef(s).short}</strong>
                  <span>{intervalDef(s).name}</span>
                </button>
              ))}
            </div>
          )}
          {q?.kind === 'quality' && (
            <div className="answer-grid" role="group" aria-label="Akor türü seç">
              {q.options.map((t) => (
                <button key={t} type="button" className={`answer${answered && t === q.quality ? ' is-right' : ''}`} disabled={!!answered} onClick={() => answerQuality(t)}>
                  <strong>{QUALITY_LABEL[t]}</strong>
                </button>
              ))}
            </div>
          )}
          {q?.kind === 'neck' && !answered && <p className="muted">Notayı dinle ve gitarda yerine tıkla. {NECK_LEVELS[level - 1]}.</p>}
          <p className={`game-feedback${answered ? (answered.ok ? ' is-ok' : ' is-bad') : ''}`} role="status" aria-live="assertive">{answered?.text ?? ''}</p>
          <div className="stat-row">
            <div className="stat"><span className="stat-label">Puan</span><span className="stat-value num">{score.score}</span></div>
            <div className="stat"><span className="stat-label">Seri</span><span className="stat-value num">{score.streak}</span></div>
            <div className="stat"><span className="stat-label">İsabet</span><span className="stat-value num">{accuracyPct(score)}<small>%</small></span></div>
          </div>
          {canLevelUp && (
            <Button variant="secondary" onClick={() => setLevels((l) => ({ ...l, [game]: level + 1 }))}>Harika! Seviye {level + 1}'e geç</Button>
          )}
        </div>
      </section>
    </div>
  );
}
