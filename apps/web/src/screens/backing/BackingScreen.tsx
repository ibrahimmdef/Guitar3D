import { useMemo, useState } from 'react';
import { Music2, Play, Square } from 'lucide-react';
import { useBacking } from '../../audio/backing';
import { chordLabel, improviseHint, parseProgression, PRESETS, presetChords, STYLE_LABEL, type BackingStyle } from '../../music/backing';
import { SHARP_NAMES, SOLFEGE } from '../../music/notes';
import { ChipGroup } from '../../ui/ChipGroup';
import { Button, SegmentedControl, Slider, Toggle } from '../../ui/kit';
import { takeHandoff } from '../../ui/handoff';
import { routeHref } from '../../ui/router';
import { ScreenHeader } from '../AppShell';

const KEY_OPTIONS = SHARP_NAMES.map((n, i) => ({ value: String(i), label: n, hint: SOLFEGE[i] }));

/** Handoff from the scales screen: `{ key, minor }`. */
export const BACKING_HANDOFF = 'backing';

export function BackingScreen() {
  const [initial] = useState(() => takeHandoff<{ key: number; minor: boolean }>(BACKING_HANDOFF));
  const [key, setKey] = useState(initial?.key ?? 9);
  const [presetId, setPresetId] = useState(initial ? (initial.minor ? 'minor-rock' : 'pop') : 'minor-rock');
  const [custom, setCustom] = useState('');
  const [style, setStyle] = useState<BackingStyle>('rock');
  const [bpm, setBpm] = useState(90);
  const [pad, setPad] = useState(true);
  const [volume, setVolume] = useState(0.8);

  const typed = custom.trim() ? parseProgression(custom) : null;
  const chords = useMemo(() => typed ?? presetChords(presetId, key), [typed, presetId, key]);
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const minor = typed ? typed[0].quality === 'm' || typed[0].quality === 'm7' : preset.minor;
  const hintKey = typed ? typed[0].root : key;
  const backing = useBacking({ chords, style, bpm, pad, volume });

  return (
    <div className="screen">
      <ScreenHeader
        title="Eşlik"
        description="Bir akor dizisi seç; davul, bas ve istersen pad döngüde çalar. Üstüne doğaçla."
        actions={
          <Button variant="primary" icon={backing.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={backing.toggle}>
            {backing.playing ? 'Durdur' : 'Çal'}
          </Button>
        }
      />

      <ol className="bk-chords" aria-label="Akor dizisi">
        {chords.map((c, i) => (
          <li key={i} className={`bk-chord${backing.bar === i ? ' is-now' : ''}`} aria-current={backing.bar === i ? 'step' : undefined}>
            {chordLabel(c)}
          </li>
        ))}
      </ol>
      <p className="subtle small">
        Doğaçlama için: <strong>{improviseHint(hintKey, minor)}</strong>. <a href={routeHref({ name: 'scales' })}><Music2 size={13} aria-hidden /> Gamlar ekranında gör</a>
      </p>

      <section className="learn-filters" aria-label="Eşlik ayarları">
        <ChipGroup label="Ton" value={String(key)} onChange={(v) => setKey(Number(v))} options={KEY_OPTIONS} />
        <ChipGroup label="Dizi" value={presetId} onChange={(v) => { setPresetId(v); setCustom(''); }} options={PRESETS.map((p) => ({ value: p.id, label: p.label, hint: p.minor ? 'Minör' : 'Majör' }))} />
        <label className="field">
          Ya da akorları yaz
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Am F C G" aria-invalid={!!custom.trim() && !typed} />
        </label>
        {custom.trim() && !typed && <p className="ti-err small">Akorlar okunamadı. Örnek: Am F C G, Lam Fa Do Sol, Dm7 G7 Cmaj7</p>}
        <div className="bk-row">
          <SegmentedControl<BackingStyle>
            aria-label="Ritim"
            value={style}
            onChange={setStyle}
            options={(Object.keys(STYLE_LABEL) as BackingStyle[]).map((s) => ({ value: s, label: STYLE_LABEL[s] }))}
          />
          <div className="bk-slider"><Slider label="Tempo" value={bpm} min={50} max={180} onChange={setBpm} format={(v) => `${v} BPM`} /></div>
          <div className="bk-slider"><Slider label="Ses" value={Math.round(volume * 100)} min={0} max={100} onChange={(v) => setVolume(v / 100)} format={(v) => `%${v}`} /></div>
        </div>
        <Toggle checked={pad} onChange={setPad} label="Pad (akor sesi)" description="Davul ve basın üstüne yumuşak bir akor katmanı." />
      </section>
    </div>
  );
}
