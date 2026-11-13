import { useMemo, useState } from 'react';
import { AudioLines, Maximize2, Play, Square } from 'lucide-react';
import { noteName, SHARP_NAMES, SOLFEGE } from '../../music/notes';
import { degreeLabel, firstOctave, getScale, neckNotes, scaleExercise, scaleMarkers, scalePcs, scalePositions, SCALE_PATTERNS, SCALES, type ScaleId, type ScalePattern } from '../../music/scales';
import { sequenceTex } from '../../music/tex';
import { getTuning } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { setHandoff } from '../../ui/handoff';
import { navigate, playLesson } from '../../ui/router';
import { PREVIEW_LESSON_ID, setPreviewLesson } from '../library/lessons';
import { withTitle } from '../../tabs/textImport';
import { useBacking } from '../../audio/backing';
import { presetChords } from '../../music/backing';
import { BACKING_HANDOFF } from '../backing/BackingScreen';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { TuningSelect } from '../TuningSelect';

const KEY_OPTIONS = SHARP_NAMES.map((n, i) => ({ value: String(i), label: n, hint: SOLFEGE[i] }));
const MAX_FRET = 15;

export function ScalesScreen() {
  const [settings, set] = useSettings();
  const tuning = getTuning(settings.tuningId);
  const [root, setRoot] = useState(9);
  const [scaleId, setScaleId] = useState<ScaleId>('minor-pent');
  const [position, setPosition] = useState('all');
  const [tempo, setTempo] = useState(100);
  const [pattern, setPattern] = useState<ScalePattern>('updown');
  const player = useTexPlayer();
  const minorScale = getScale(scaleId).intervals.includes(3);
  const backingChords = useMemo(() => presetChords(minorScale ? 'minor-rock' : 'pop', root), [minorScale, root]);
  const backing = useBacking({ chords: backingChords, style: 'rock', bpm: tempo, pad: true, volume: 0.7 });

  const scale = getScale(scaleId);
  const positions = useMemo(() => scalePositions(root, scaleId, tuning), [root, scaleId, tuning]);
  const pos = position === 'all' ? null : positions[Number(position)] ?? null;
  const notes = useMemo(() => (pos ? pos.notes : neckNotes(root, scaleId, tuning, MAX_FRET)), [pos, root, scaleId, tuning]);
  const markers = useMemo(() => scaleMarkers(notes), [notes]);

  const changeScale = (id: ScaleId) => {
    setScaleId(id);
    setPosition('all');
  };
  const play = () => {
    if (player.playing) {
      player.stop();
      return;
    }
    player.play(sequenceTex(exercise(), { tempo, tuning, program: settings.program }));
  };
  const exercise = () => scaleExercise(pos ? pos.notes : firstOctave(notes), pattern);
  const openInPlayer = () => {
    player.stop();
    backing.stop();
    const title = `${noteName(root)} ${scale.label.toLocaleLowerCase('tr')} · ${pos ? `${pos.index + 1}. kutu` : 'bir oktav'} · ${SCALE_PATTERNS.find((p) => p.id === pattern)!.label.toLocaleLowerCase('tr')}`;
    const tex = sequenceTex(exercise(), { tempo, tuning, program: settings.program });
    setPreviewLesson(withTitle(tex, title), title);
    navigate(playLesson(PREVIEW_LESSON_ID));
  };

  const posLabel = pos ? `${pos.index + 1}. pozisyon, ${pos.minFret === 0 ? 'açık' : `${pos.minFret}.`}–${pos.maxFret}. perde` : `Tüm sap, 0–${MAX_FRET}. perde`;

  return (
    <div className="screen">
      <ScreenHeader title="Gamlar" description="Ton ve gam seç; notalar sapta yanar, kökler dolu işaretle gösterilir." />

      <section className="learn" aria-label="Sapta gam">
        <LearnStage notes={markers} beatId={root * 100 + SCALES.indexOf(scale)} cameraMode={pos ? 'follow' : 'neck'} label={`${noteName(root)} ${scale.label} gamı, ${posLabel}`}>
          <span className="hud-chip">{posLabel}</span>
        </LearnStage>
        <div className="learn-side">
          <div className="learn-title-row">
            <div>
              <h2 className="learn-title">{noteName(root)} {scale.label.toLocaleLowerCase('tr')}</h2>
              <p className="muted small">{SOLFEGE[root]} · {tuning.label} akort</p>
            </div>
            <Button variant="primary" icon={player.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={play}>
              {player.playing ? 'Durdur' : 'Çal'}
            </Button>
          </div>
          <div className="note-legend" aria-label="Gamın notaları">
            {scalePcs(root, scaleId).map((p, i) => (
              <span key={p} className={`note-pill${i === 0 ? ' is-root' : ''}`}>
                {noteName(p)} <small>{degreeLabel(scale.intervals[i])}</small>
              </span>
            ))}
          </div>
          <p className="subtle small">Çal: {pos ? 'bu kutu' : 'kökten bir oktav'}, {SCALE_PATTERNS.find((p) => p.id === pattern)!.label.toLocaleLowerCase('tr')}, {tempo} BPM.</p>
          <div className="learn-row">
            <Button variant="secondary" icon={<Maximize2 size={15} />} onClick={openInPlayer}>Tabda çal</Button>
            <span className="subtle small">Büyük ekranda tab, hız, döngü ve metronomla çalış.</span>
          </div>
          <div className="learn-row">
            <Button size="sm" icon={backing.playing ? <Square size={14} fill="currentColor" /> : <AudioLines size={14} />} pressed={backing.playing} onClick={backing.toggle}>
              {backing.playing ? 'Eşliği durdur' : 'Eşlikle doğaçla'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { backing.stop(); setHandoff(BACKING_HANDOFF, { key: root, minor: minorScale }); navigate({ name: 'backing' }); }}>
              Eşlik ayarları
            </Button>
          </div>
          <div className="learn-row">
            <label className="field">
              Tempo
              <select className="select" value={tempo} onChange={(e) => setTempo(Number(e.target.value))}>
                {[60, 80, 100, 120, 140].map((t) => <option key={t} value={t}>{t} BPM</option>)}
              </select>
            </label>
            <label className="field">
              Kalıp
              <select className="select" value={pattern} onChange={(e) => setPattern(e.target.value as ScalePattern)}>
                {SCALE_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <TuningSelect value={tuning.id} onChange={(id) => set({ tuningId: id })} />
          </div>
        </div>
      </section>

      <section className="learn-filters" aria-label="Gam seçimi">
        <ChipGroup label="Ton" value={String(root)} onChange={(v) => setRoot(Number(v))} options={KEY_OPTIONS} />
        <div className="chip-group">
          <label className="chip-group-label" htmlFor="scale-select">Gam</label>
          <select id="scale-select" className="select" value={scaleId} onChange={(e) => changeScale(e.target.value as ScaleId)}>
            <optgroup label="Temel">
              {SCALES.filter((s) => s.group === 'temel').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
            <optgroup label="Modlar">
              {SCALES.filter((s) => s.group === 'mod').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
          </select>
        </div>
        <ChipGroup
          label="Kutu"
          value={position}
          onChange={setPosition}
          options={[{ value: 'all', label: 'Tüm sap' }, ...positions.map((p) => ({ value: String(p.index), label: String(p.index + 1), hint: `${p.minFret}–${p.maxFret}. perde` }))]}
        />
      </section>
    </div>
  );
}
