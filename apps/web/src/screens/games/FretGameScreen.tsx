import { useCallback, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Play, Square, Trophy } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import { freqToMidi } from '../../audio/pitch';
import { useMicPitch } from '../../audio/useMicPitch';
import { MIC_STATUS_LABEL } from '../../audio/useMicOnsets';
import {
  accuracyPct, checkClick, checkPlayed, GAME_LEVELS, getLevel, initialScore, loadBest, nextQuestion, positionsOf, saveBest, scoreAnswer, type Question,
} from '../../music/fretGame';
import { SHARP_NAMES, SOLFEGE } from '../../music/notes';
import { getTuning } from '../../music/tunings';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, useToast } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { stableNote, useCountdown } from './useCountdown';

const ROUND = 60;
const BEST_KEY = 'guitar3d.fretgame.best.v1';

export const noteLabel = (p: number) => `${SOLFEGE[p]} (${SHARP_NAMES[p]})`;

export function FretGameScreen() {
  const [settings] = useSettings();
  const tuning = getTuning(settings.tuningId);
  const toast = useToast();
  const [levelId, setLevelId] = useState('l1');
  const level = getLevel(levelId);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [q, setQ] = useState<Question>(() => nextQuestion(level, tuning));
  const [score, setScore] = useState(initialScore);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [markers, setMarkers] = useState<FretNote[]>([]);
  const [beat, setBeat] = useState(0);
  const [mic, setMic] = useState(false);
  const [best, setBest] = useState(() => loadBest(BEST_KEY));
  const asked = useRef(performance.now());
  const lock = useRef(false);
  const heard = useRef<{ midi: number; frames: number } | null>(null);

  const finish = useCallback(() => {
    setRunning(false);
    const s = scoreRef.current;
    if (s.score > 0 && saveBest(BEST_KEY, levelId, s.score)) {
      toast({ title: `Yeni rekor: ${s.score} puan`, tone: 'success' });
      setBest(loadBest(BEST_KEY));
    }
  }, [levelId, toast]);
  const left = useCountdown(ROUND, running, runId, finish);

  const ask = (prev: Question | null) => {
    setQ(nextQuestion(level, tuning, Math.random, prev));
    asked.current = performance.now();
    lock.current = false;
  };

  const start = () => {
    setScore(initialScore());
    setFeedback(null);
    setMarkers([]);
    setRunning(true);
    setRunId((n) => n + 1);
    ask(null);
  };

  const answer = (ok: boolean, shown: FretNote[], text: string) => {
    if (lock.current) return;
    lock.current = true;
    const ms = performance.now() - asked.current;
    setScore((s) => scoreAnswer(s, ok, ms).state);
    setFeedback({ ok, text });
    setMarkers(shown);
    setBeat((b) => b + 1);
    window.setTimeout(() => ask(q), ok ? 450 : 1300);
  };

  const onFretClick = (string: number, fret: number) => {
    if (!running) {
      setMarkers([{ string, fret, state: 'now' }]);
      setBeat((b) => b + 1);
      return;
    }
    const ok = checkClick(q, { string, fret }, tuning, level);
    const right = positionsOf(q.pc, tuning, level.maxFret, q.string).map((p) => ({ ...p, state: 'next' as const }));
    answer(ok, ok ? [{ string, fret, state: 'now' }] : [{ string, fret, state: 'now', muted: true }, ...right], ok ? 'Doğru!' : `Yanlış: doğru yerler gösteriliyor`);
  };

  const micStatus = useMicPitch(mic && running, (p) => {
    const r = stableNote(heard.current, p ? freqToMidi(p.freq) : null);
    heard.current = r.state;
    if (r.stable == null || lock.current) return;
    const ok = checkPlayed(q, r.stable, tuning, level);
    if (ok) answer(true, [], 'Doğru! (duyuldu)');
    else setFeedback({ ok: false, text: `Duyulan: ${noteLabel(((r.stable % 12) + 12) % 12)}` });
  });

  const target = useMemo(() => (q.string ? `${q.string}. telde` : 'herhangi bir telde'), [q]);

  return (
    <div className="screen">
      <ScreenHeader
        title="Sap ezber oyunu"
        description="Sorulan notayı sapta bul: gitara tıkla ya da çal. 60 saniyede kaç doğru?"
        actions={
          <Button variant="primary" icon={running ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={() => (running ? finish() : start())}>
            {running ? 'Bitir' : 'Başla'}
          </Button>
        }
      />

      <section className="learn" aria-label="Oyun">
        <LearnStage notes={markers} beatId={beat} cameraMode="overview" label="Gitar sapı: notayı bulmak için tıkla" onFretClick={onFretClick}>
          {running && <span className="hud-chip num">{Math.ceil(left)} sn</span>}
        </LearnStage>
        <div className="learn-side">
          <div className="game-question" aria-live="polite">
            <span className="muted small">{running ? 'Bul:' : 'Hazır mısın?'}</span>
            <strong className="game-note">{running ? noteLabel(q.pc) : '—'}</strong>
            <span className="muted">{running ? target : `Perdeler 0–${level.maxFret}`}</span>
          </div>
          <p className={`game-feedback${feedback ? (feedback.ok ? ' is-ok' : ' is-bad') : ''}`} role="status" aria-live="assertive">
            {feedback?.text ?? (running ? '' : 'Başla düğmesine bas.')}
          </p>
          <div className="stat-row">
            <div className="stat"><span className="stat-label">Puan</span><span className="stat-value num">{score.score}</span></div>
            <div className="stat"><span className="stat-label">Seri</span><span className="stat-value num">{score.streak}<small>en iyi {score.bestStreak}</small></span></div>
            <div className="stat"><span className="stat-label">İsabet</span><span className="stat-value num">{accuracyPct(score)}<small>%</small></span></div>
          </div>
          <ChipGroup label="Zorluk" value={levelId} onChange={(v) => { setLevelId(v); setRunning(false); }} options={GAME_LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
          <div className="p2-row">
            <Button size="sm" variant={mic ? 'secondary' : 'ghost'} icon={mic ? <MicOff size={15} /> : <Mic size={15} />} onClick={() => setMic((v) => !v)}>
              {mic ? 'Mikrofonu kapat' : 'Çalarak cevapla'}
            </Button>
            {mic && <span className="subtle small">{MIC_STATUS_LABEL[running ? micStatus : 'off']}</span>}
          </div>
          <p className="subtle small"><Trophy size={13} aria-hidden /> Rekor: <span className="num">{best[levelId] ?? 0}</span> puan</p>
        </div>
      </section>
    </div>
  );
}
