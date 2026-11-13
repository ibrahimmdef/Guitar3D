import { useMemo, useState } from 'react';
import { Play, Search, Square } from 'lucide-react';
import { CHORD_TYPES, groupVoicings, searchChords, SHAPE_LABEL, solfegeName, voicingNotes, type ChordShape, type ChordType } from '../../music/chords';
import { SHARP_NAMES, SOLFEGE } from '../../music/notes';
import { chordTex } from '../../music/tex';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChordDiagram } from '../../ui/ChordDiagram';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, EmptyState, SegmentedControl } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';

const ROOT_OPTIONS = [{ value: 'all', label: 'Tümü' }, ...SHARP_NAMES.map((n, i) => ({ value: String(i), label: n, hint: SOLFEGE[i] }))];
const TYPE_OPTIONS = [{ value: 'all', label: 'Tümü' }, ...CHORD_TYPES.map((t) => ({ value: t.id, label: t.suffix || 'Majör', hint: t.label }))];

export function ChordsScreen() {
  const [settings] = useSettings();
  const [text, setText] = useState('');
  const [root, setRoot] = useState('all');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState('C');
  const [shape, setShape] = useState<ChordShape>('open');
  const [strum, setStrum] = useState(0);
  const player = useTexPlayer();

  const groups = useMemo(
    () => groupVoicings(searchChords({ text, root: root === 'all' ? null : Number(root), type: type === 'all' ? null : (type as ChordType) })),
    [text, root, type],
  );
  const all = useMemo(() => groupVoicings(searchChords({})), []);
  const group = all.find((g) => g.name === selected) ?? all[0];
  const voicing = group.voicings.find((v) => v.shape === shape) ?? group.voicings[0];
  const notes = useMemo(() => voicingNotes(voicing), [voicing]);

  const play = (v = voicing) => {
    setStrum((n) => n + 1);
    player.play(chordTex(v.frets, { program: settings.program, tempo: 90 }));
  };
  const pick = (name: string) => {
    setSelected(name);
    const g = all.find((x) => x.name === name);
    const v = g?.voicings.find((x) => x.shape === shape) ?? g?.voicings[0];
    if (v) {
      setShape(v.shape);
      play(v);
    }
  };

  return (
    <div className="screen">
      <ScreenHeader title="Akorlar" description="Açık ve bare akorlar kendi gitarında, parmak numaralarıyla. Seçince çalar." />

      <section className="learn" aria-label="Seçili akor">
        <LearnStage notes={notes} beatId={strum} cameraMode="follow" label={`${voicing.name} akoru gitarda`} />
        <div className="learn-side">
          <div className="learn-title-row">
            <div>
              <h2 className="learn-title">{voicing.name}</h2>
              <p className="muted small">{solfegeName(voicing)}</p>
            </div>
            <Button
              variant="primary"
              icon={player.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              onClick={() => (player.playing ? player.stop() : play())}
            >
              {player.playing ? 'Durdur' : 'Çal'}
            </Button>
          </div>
          {group.voicings.length > 1 && (
            <SegmentedControl<ChordShape>
              aria-label="Akor kalıbı"
              size="sm"
              value={voicing.shape}
              onChange={(s) => {
                setShape(s);
                const v = group.voicings.find((x) => x.shape === s);
                if (v) play(v);
              }}
              options={group.voicings.map((v) => ({ value: v.shape, label: SHAPE_LABEL[v.shape] }))}
            />
          )}
          <div className="chord-detail">
            <ChordDiagram voicing={voicing} size={132} />
            <dl className="chord-facts">
              <div><dt>Teller</dt><dd className="num">{voicing.frets.map((f) => (f < 0 ? '×' : f)).join(' ')}</dd></div>
              <div><dt>Parmaklar</dt><dd className="num">{voicing.fingers.map((f, i) => (voicing.frets[i] <= 0 ? '–' : f)).join(' ')}</dd></div>
              {voicing.barre && <div><dt>Bare</dt><dd>{voicing.barre.fret}. perde, işaret parmağı</dd></div>}
            </dl>
          </div>
          {settings.tuningId !== 'standard' && <p className="subtle small">Akor şekilleri standart akort içindir.</p>}
        </div>
      </section>

      <section className="learn-filters" aria-label="Akor ara">
        <label className="search">
          <Search size={16} className="search-ic" aria-hidden />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Akor ara: Am, F#m7, Sol7…" aria-label="Akor ara" />
        </label>
        <ChipGroup label="Kök" value={root} onChange={setRoot} options={ROOT_OPTIONS} />
        <ChipGroup label="Tür" value={type} onChange={setType} options={TYPE_OPTIONS} />
      </section>

      {groups.length === 0 ? (
        <EmptyState compact icon={<Search size={20} />} title="Akor bulunamadı" description="Başka bir yazım dene: Am, La minör, C7, sus4…" />
      ) : (
        <ul className="chord-grid" aria-label="Akorlar">
          {groups.map((g) => (
            <li key={g.name}>
              <button type="button" className={`chord-card${g.name === voicing.name ? ' is-on' : ''}`} aria-pressed={g.name === voicing.name} onClick={() => pick(g.name)}>
                <ChordDiagram voicing={g.voicings[0]} size={64} showFingers={false} title="" />
                <span className="chord-card-name">{g.name}</span>
                <span className="chord-card-sub">{g.voicings.map((v) => SHAPE_LABEL[v.shape]).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
