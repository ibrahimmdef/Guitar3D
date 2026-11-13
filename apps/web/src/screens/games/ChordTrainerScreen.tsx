import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Mic, MicOff, Play, Square, Trophy } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import { MIC_STATUS_LABEL, useMicOnsets } from '../../audio/useMicOnsets';
import { acceptStrum, addResult, bestFor, leaderboard, loadHistory, pairKey, perMinute, sharedFingers, sharedText, SUGGESTED_PAIRS } from '../../music/chordTrainer';
import { groupVoicings, searchChords, voicingNotes, type ChordVoicing } from '../../music/chords';
import { chordTex } from '../../music/tex';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChordDiagram } from '../../ui/ChordDiagram';
import { Button, useToast } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { useCountdown } from './useCountdown';

const ROUND = 60;

function useChordList() {
  return useMemo(() => groupVoicings(searchChords({})).map((g) => g.voicings.find((v) => v.shape === 'open') ?? g.voicings[0]), []);
}

function ChordSelect({ label, value, onChange, list }: { label: string; value: string; onChange: (v: string) => void; list: ChordVoicing[] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
      </select>
    </label>
  );
}

export function ChordTrainerScreen() {
  const [settings] = useSettings();
  const toast = useToast();
  const list = useChordList();
  const [aName, setA] = useState('C');
  const [bName, setB] = useState('G');
  const a = list.find((v) => v.name === aName) ?? list[0];
  const b = list.find((v) => v.name === bName) ?? list[1];
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [changes, setChanges] = useState(0);
  const [onlyShared, setOnlyShared] = useState(false);
  const [mic, setMic] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const lastStrum = useRef(-Infinity);
  const changesRef = useRef(0);
  changesRef.current = changes;
  const player = useTexPlayer();

  const pair = pairKey(a.name, b.name);
  const shared = useMemo(() => sharedFingers(a, b), [a, b]);
  const onA = changes % 2 === 0;
  const cur = onA ? a : b;
  const next = onA ? b : a;

  const notes: FretNote[] = useMemo(() => {
    if (onlyShared) return shared.anchors.map((s) => ({ string: s.string, fret: s.fret, finger: s.finger, state: 'now' as const }));
    const now = voicingNotes(cur);
    const upcoming = voicingNotes(next).filter((n) => !n.muted).map((n) => ({ ...n, state: 'next' as const }));
    return [...now, ...upcoming];
  }, [cur, next, onlyShared, shared]);

  const finish = useCallback(() => {
    setRunning(false);
    const n = changesRef.current;
    if (!n) return;
    const prev = bestFor(loadHistory(), pair);
    setHistory(addResult({ pair, changes: n, seconds: ROUND, date: new Date().toISOString() }));
    if (!prev || n > perMinute(prev)) toast({ title: `Yeni rekor: dakikada ${n} geçiş`, tone: 'success' });
  }, [pair, toast]);
  const left = useCountdown(ROUND, running, runId, finish);

  const start = () => {
    setChanges(0);
    lastStrum.current = -Infinity;
    setRunning(true);
    setRunId((x) => x + 1);
  };
  const tap = useCallback(() => {
    if (running) setChanges((c) => c + 1);
  }, [running]);

  // Space / Enter count a change while running
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!running || (e.code !== 'Space' && e.code !== 'Enter')) return;
      if ((e.target as HTMLElement)?.closest('input, select, textarea')) return;
      e.preventDefault();
      tap();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [running, tap]);

  const first = useRef(true);
  const micStatus = useMicOnsets(mic && running, (t) => {
    if (!acceptStrum(lastStrum.current, t, 0.6)) return;
    lastStrum.current = t;
    // the first strum is the starting chord; every later one is a change
    if (first.current) first.current = false;
    else setChanges((c) => c + 1);
  });
  useEffect(() => {
    first.current = true;
  }, [runId]);

  const best = bestFor(history, pair);
  const board = leaderboard(history).slice(0, 6);
  const hints = sharedText(shared);

  return (
    <div className="screen">
      <ScreenHeader
        title="Akor geçiş antrenörü"
        description="İki akor arasında bir dakikada kaç kez geçebiliyorsun? Her geçişte düğmeye bas ya da mikrofon tokatlarını saysın."
        actions={
          <Button variant="primary" icon={running ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={() => (running ? finish() : start())}>
            {running ? 'Bitir' : 'Başla'}
          </Button>
        }
      />
      <section className="learn" aria-label="Akor geçişi">
        <LearnStage notes={notes} beatId={changes} cameraMode="follow" label={`${cur.name} akorundan ${next.name} akoruna geçiş`}>
          <span className="hud-chip">{cur.name} → {next.name}</span>
          {running && <span className="hud-chip num">{Math.ceil(left)} sn</span>}
        </LearnStage>
        <div className="learn-side">
          <div className="p2-row">
            <ChordSelect label="1. akor" value={a.name} onChange={setA} list={list} />
            <Button size="sm" variant="ghost" aria-label="Akorları değiştir" icon={<ArrowLeftRight size={15} />} onClick={() => { setA(b.name); setB(a.name); }} />
            <ChordSelect label="2. akor" value={b.name} onChange={setB} list={list} />
          </div>
          <div className="trainer-diagrams">
            {[a, b].map((v) => (
              <button key={v.id} type="button" className={`trainer-diagram${v === cur ? ' is-on' : ''}`} onClick={() => player.play(chordTex(v.frets, { program: settings.program }))} aria-label={`${v.name} akorunu çal`}>
                <ChordDiagram voicing={v} size={92} />
                <span>{v.name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="trainer-tap" onClick={tap} disabled={!running} aria-label={`Geçiş say. Şu ana kadar ${changes}`}>
            <span className="trainer-count num" aria-live="polite">{changes}</span>
            <span className="muted small">{running ? 'geçiş · dokun ya da Boşluk' : 'Başla, sonra her geçişte dokun'}</span>
          </button>
          <div className="p2-row">
            <Button size="sm" variant={mic ? 'secondary' : 'ghost'} icon={mic ? <MicOff size={15} /> : <Mic size={15} />} onClick={() => setMic((v) => !v)}>
              {mic ? 'Mikrofonu kapat' : 'Mikrofonla say'}
            </Button>
            {mic && <span className="subtle small">{MIC_STATUS_LABEL[running ? micStatus : 'off']} · her akoru bir kez vur</span>}
          </div>
          <div>
            <h2 className="section-title">Ortak parmaklar</h2>
            {hints.length ? (
              <ul className="plain-list small">{hints.map((h) => <li key={h}>{h}</li>)}</ul>
            ) : <p className="muted small">Bu iki akorda ortak parmak yok: hepsini birlikte kaldırıp koy.</p>}
            <label className="check small">
              <input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} disabled={!shared.anchors.length} /> Gitarda yalnızca ortak parmakları göster
            </label>
          </div>
          <p className="subtle small"><Trophy size={13} aria-hidden /> Bu ikilide rekor: <span className="num">{best ? perMinute(best) : 0}</span> / dk</p>
        </div>
      </section>

      <section className="trainer-lower">
        <div>
          <h2 className="section-title">Önerilen ikililer</h2>
          <div className="chip-row">
            {SUGGESTED_PAIRS.map(([x, y]) => (
              <button key={`${x}-${y}`} type="button" className={`chip${pairKey(x, y) === pair ? ' is-on' : ''}`} onClick={() => { setA(x); setB(y); }}>{x} ↔ {y}</button>
            ))}
          </div>
        </div>
        {board.length > 0 && (
          <div>
            <h2 className="section-title">En iyi skorlar</h2>
            <ol className="plain-list small">
              {board.map((r) => <li key={r.pair}><span>{r.pair.replace('|', ' ↔ ')}</span> <strong className="num">{perMinute(r)}</strong> / dk</li>)}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
