import { useMemo, useState } from 'react';
import { Play, Search, Square } from 'lucide-react';
import { CHORD_TYPES, groupVoicings, longName, searchChords, SHAPE_LABEL, voicingNotes, type ChordShape, type ChordType } from '../../music/chords';
import { SHARP_NAMES } from '../../music/notes';
import { chordTex } from '../../music/tex';
import { useTexPlayer } from '../../player/useTexPlayer';
import { ChordDiagram } from '../../ui/ChordDiagram';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, EmptyState, SegmentedControl } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';

const ROOT_OPTIONS = [{ value: 'all', label: 'All' }, ...SHARP_NAMES.map((n, i) => ({ value: String(i), label: n }))];
const TYPE_OPTIONS = [{ value: 'all', label: 'All' }, ...CHORD_TYPES.map((t) => ({ value: t.id, label: t.suffix || 'Major', hint: t.label }))];

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
      <ScreenHeader title="Chords" description="Open and barre chords on your own guitar, with finger numbers. Plays when selected." />

      <section className="learn" aria-label="Selected chord">
        <LearnStage notes={notes} beatId={strum} cameraMode="follow" label={`${voicing.name} chord on the guitar`} />
        <div className="learn-side">
          <div className="learn-title-row">
            <div>
              <h2 className="learn-title">{voicing.name}</h2>
              <p className="muted small">{longName(voicing)}</p>
            </div>
            <Button
              variant="primary"
              icon={player.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              onClick={() => (player.playing ? player.stop() : play())}
            >
              {player.playing ? 'Stop' : 'Play'}
            </Button>
          </div>
          {group.voicings.length > 1 && (
            <SegmentedControl<ChordShape>
              aria-label="Chord shape"
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
              <div><dt>Strings</dt><dd className="num">{voicing.frets.map((f) => (f < 0 ? '×' : f)).join(' ')}</dd></div>
              <div><dt>Fingers</dt><dd className="num">{voicing.fingers.map((f, i) => (voicing.frets[i] <= 0 ? '–' : f)).join(' ')}</dd></div>
              {voicing.barre && <div><dt>Barre</dt><dd>Fret {voicing.barre.fret}, index finger</dd></div>}
            </dl>
          </div>
          {settings.tuningId !== 'standard' && <p className="subtle small">Chord shapes are for standard tuning.</p>}
        </div>
      </section>

      <section className="learn-filters" aria-label="Search chords">
        <label className="search">
          <Search size={16} className="search-ic" aria-hidden />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search chords: Am, F#m7, G7…" aria-label="Search chords" />
        </label>
        <ChipGroup label="Root" value={root} onChange={setRoot} options={ROOT_OPTIONS} />
        <ChipGroup label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />
      </section>

      {groups.length === 0 ? (
        <EmptyState compact icon={<Search size={20} />} title="No chords found" description="Try another spelling: Am, A minor, C7, sus4…" />
      ) : (
        <ul className="chord-grid" aria-label="Chords">
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
