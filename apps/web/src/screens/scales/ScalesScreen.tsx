import { useMemo, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { noteName, SHARP_NAMES, SOLFEGE } from '../../music/notes';
import { ascendDescend, degreeLabel, firstOctave, getScale, neckNotes, scaleMarkers, scalePcs, scalePositions, SCALES, type ScaleId } from '../../music/scales';
import { sequenceTex } from '../../music/tex';
import { getTuning } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
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
  const player = useTexPlayer();

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
    const run = ascendDescend(pos ? pos.notes : firstOctave(notes));
    player.play(sequenceTex(run, { tempo, tuning, program: settings.program }));
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
          <p className="subtle small">Çal: {pos ? 'bu pozisyonu' : 'kökten bir oktav'} çıkıcı ve inici, {tempo} BPM.</p>
          <div className="learn-row">
            <label className="field">
              Tempo
              <select className="select" value={tempo} onChange={(e) => setTempo(Number(e.target.value))}>
                {[60, 80, 100, 120, 140].map((t) => <option key={t} value={t}>{t} BPM</option>)}
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
