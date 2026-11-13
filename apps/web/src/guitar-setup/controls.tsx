/** Form pieces shared by the template editor and the photo wizard (styled in styles/guitar.css). */
import { useId, type ReactNode } from 'react';
import type { GuitarFinish } from '@guitar3d/shared';
import { Slider, Toggle } from '../ui/kit';
import { SIZE_PRESETS } from './lib/customize';

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <div className={`gs-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id} className="gs-label">{label}</label>
      {children(id)}
      {error ? <p className="gs-field-error" role="alert">{error}</p> : hint ? <p className="gs-hint">{hint}</p> : null}
    </div>
  );
}

export function NumberInput({ id, value, onChange, step = 0.1, min, max, unit, width = 96 }: {
  id?: string;
  value: number | '';
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  width?: number;
}) {
  return (
    <span className="gs-input-wrap" style={{ width }}>
      <input
        id={id}
        className="gs-input num"
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {unit && <span className="gs-unit">{unit}</span>}
    </span>
  );
}

/** Overall length: 36"–42" chips plus a free cm value. */
export function SizePresets({ totalCm, onTotal }: { totalCm: number; onTotal: (cm: number) => void }) {
  return (
    <div className="gs-chips" role="radiogroup" aria-label="Hazır boylar">
      {SIZE_PRESETS.map((p) => {
        const on = Math.abs(totalCm - p.cm) < 0.05;
        return (
          <button key={p.inches} type="button" role="radio" aria-checked={on} className={`gs-chip${on ? ' is-on' : ''}`} onClick={() => onTotal(p.cm)}>
            {p.label}
            <span className="gs-chip-sub num">{p.cm.toLocaleString('tr-TR')}</span>
          </button>
        );
      })}
    </div>
  );
}

export type FinishKey = 'top' | 'sides' | 'neck' | 'fretboard' | 'binding' | 'pickguard' | 'headstock';
export const FINISH_LABELS: Record<FinishKey, string> = {
  top: 'Kapak',
  sides: 'Yanlar ve arka',
  neck: 'Sap',
  fretboard: 'Klavye',
  binding: 'Biye',
  pickguard: 'Pena koruyucu',
  headstock: 'Kafa',
};

/** Colour swatches for the finish + gloss; optional parts (binding, pickguard) can be switched off. */
export function FinishEditor({ finish, onChange, keys = ['top', 'sides', 'neck', 'fretboard', 'binding', 'pickguard'], pickFromPhoto, picking }: {
  finish: GuitarFinish;
  onChange: (f: GuitarFinish) => void;
  keys?: FinishKey[];
  /** When given, each swatch gets an eyedropper toggle (the caller handles the photo click). */
  pickFromPhoto?: (k: FinishKey | null) => void;
  picking?: FinishKey | null;
}) {
  const setColor = (k: FinishKey, v: string | null) => {
    const next = { ...finish, [k]: v } as GuitarFinish;
    if (k === 'sides' && v) next.back = v;
    onChange(next);
  };
  return (
    <div className="gs-finish">
      <div className="gs-swatches">
        {keys.map((k) => {
          const v = finish[k] as string | null;
          const optional = k === 'binding' || k === 'pickguard';
          return (
            <div key={k} className={`gs-swatch${picking === k ? ' is-picking' : ''}`}>
              <label className="gs-swatch-color" style={{ background: v ?? 'transparent' }} title={`${FINISH_LABELS[k]} rengi`}>
                <input type="color" value={v ?? '#888888'} onChange={(e) => setColor(k, e.target.value)} aria-label={`${FINISH_LABELS[k]} rengi`} />
                {!v && <span className="gs-swatch-none" aria-hidden>—</span>}
              </label>
              <span className="gs-swatch-label">{FINISH_LABELS[k]}</span>
              <span className="gs-swatch-actions">
                {pickFromPhoto && (
                  <button type="button" className="gs-link" aria-pressed={picking === k} onClick={() => pickFromPhoto(picking === k ? null : k)}>
                    {picking === k ? 'Fotoğrafa tıkla…' : 'Fotoğraftan'}
                  </button>
                )}
                {optional && (
                  <button type="button" className="gs-link" onClick={() => setColor(k, v ? null : k === 'binding' ? '#e9dfc6' : '#1a1a1a')}>
                    {v ? 'Yok' : 'Ekle'}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <Slider label="Parlaklık" value={finish.gloss} min={0} max={1} step={0.05} onChange={(gloss) => onChange({ ...finish, gloss })} format={(g) => (g < 0.3 ? 'Mat' : g < 0.7 ? 'Saten' : 'Parlak')} />
    </div>
  );
}

export function MakeActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <Toggle checked={checked} onChange={onChange} label="Kaydettikten sonra bu gitarı kullan" description="Çalar ekranında ve her yerde bu gitar görünür." />;
}
