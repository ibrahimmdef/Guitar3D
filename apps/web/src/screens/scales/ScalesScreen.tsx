import { useMemo, useState } from 'react';
import { AudioLines, Maximize2, Play, Square } from 'lucide-react';
import { noteName, SHARP_NAMES } from '../../music/notes';
import { degreeLabel, firstOctave, getScale, neckNotes, scaleExercise, scaleMarkers, scalePcs, scalePositions, SCALE_PATTERNS, SCALES, type ScaleId, type ScalePattern } from '../../music/scales';
import { sequenceTex } from '../../music/tex';
import { getTuning } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { navigate, playLesson } from '../../ui/router';
import { PREVIEW_LESSON_ID, setPreviewLesson } from '../library/lessons';
import { withTitle } from '../../tabs/textImport';
import { useBacking } from '../../audio/backing';
import { presetChords } from '../../music/backing';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';
import { TuningSelect } from '../TuningSelect';

const KEY_OPTIONS = SHARP_NAMES.map((n, i) => ({ value: String(i), label: n }));
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
    const title = `${noteName(root)} ${scale.label.toLowerCase()} · ${pos ? `box ${pos.index + 1}` : 'one octave'} · ${SCALE_PATTERNS.find((p) => p.id === pattern)!.label.toLowerCase()}`;
    const tex = sequenceTex(exercise(), { tempo, tuning, program: settings.program });
    setPreviewLesson(withTitle(tex, title), title);
    navigate(playLesson(PREVIEW_LESSON_ID));
  };

  const posLabel = pos ? `Position ${pos.index + 1}, frets ${pos.minFret === 0 ? 'open' : pos.minFret}–${pos.maxFret}` : `Whole neck, frets 0–${MAX_FRET}`;

  return (
    <div className="screen">
      <ScreenHeader title="Scales" description="Pick a key and scale; the notes light up on the neck and roots are shown as filled markers." />

      <section className="learn" aria-label="Scale on the neck">
        <LearnStage notes={markers} beatId={root * 100 + SCALES.indexOf(scale)} cameraMode={pos ? 'follow' : 'neck'} label={`${noteName(root)} ${scale.label} scale, ${posLabel}`}>
          <span className="hud-chip">{posLabel}</span>
        </LearnStage>
        <div className="learn-side">
          <div className="learn-title-row">
            <div>
              <h2 className="learn-title">{noteName(root)} {scale.label.toLowerCase()}</h2>
              <p className="muted small">{tuning.label} tuning</p>
            </div>
            <Button variant="primary" icon={player.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={play}>
              {player.playing ? 'Stop' : 'Play'}
            </Button>
          </div>
          <div className="note-legend" aria-label="Notes of the scale">
            {scalePcs(root, scaleId).map((p, i) => (
              <span key={p} className={`note-pill${i === 0 ? ' is-root' : ''}`}>
                {noteName(p)} <small>{degreeLabel(scale.intervals[i])}</small>
              </span>
            ))}
          </div>
          <p className="subtle small">Plays: {pos ? 'this box' : 'one octave from the root'}, {SCALE_PATTERNS.find((p) => p.id === pattern)!.label.toLowerCase()}, {tempo} BPM.</p>
          <div className="learn-row">
            <Button variant="secondary" icon={<Maximize2 size={15} />} onClick={openInPlayer}>Play as tab</Button>
            <span className="subtle small">Practice on the big screen with tab, speed, loop and metronome.</span>
          </div>
          <div className="learn-row">
            <Button size="sm" icon={backing.playing ? <Square size={14} fill="currentColor" /> : <AudioLines size={14} />} pressed={backing.playing} onClick={backing.toggle}>
              {backing.playing ? 'Stop backing' : 'Improvise with backing'}
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
              Pattern
              <select className="select" value={pattern} onChange={(e) => setPattern(e.target.value as ScalePattern)}>
                {SCALE_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <TuningSelect value={tuning.id} onChange={(id) => set({ tuningId: id })} />
          </div>
        </div>
      </section>

      <section className="learn-filters" aria-label="Scale selection">
        <ChipGroup label="Key" value={String(root)} onChange={(v) => setRoot(Number(v))} options={KEY_OPTIONS} />
        <div className="chip-group">
          <label className="chip-group-label" htmlFor="scale-select">Scale</label>
          <select id="scale-select" className="select" value={scaleId} onChange={(e) => changeScale(e.target.value as ScaleId)}>
            <optgroup label="Basic">
              {SCALES.filter((s) => s.group === 'temel').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
            <optgroup label="Modes">
              {SCALES.filter((s) => s.group === 'mod').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
          </select>
        </div>
        <ChipGroup
          label="Box"
          value={position}
          onChange={setPosition}
          options={[{ value: 'all', label: 'Whole neck' }, ...positions.map((p) => ({ value: String(p.index), label: String(p.index + 1), hint: `frets ${p.minFret}–${p.maxFret}` }))]}
        />
      </section>
    </div>
  );
}
