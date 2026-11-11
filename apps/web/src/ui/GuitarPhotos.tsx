import { useRef, useState } from 'react';
import { api } from '../api';
import { rectifyFretboard } from '../fretboard/textures';

type Pt = [number, number];
const STEPS = [
  { key: 'nutLow', label: 'Nut, kalın E teli kenarı' },
  { key: 'nutHigh', label: 'Nut, ince e teli kenarı' },
  { key: 'fretLow', label: '12. perde teli, kalın E kenarı' },
  { key: 'fretHigh', label: '12. perde teli, ince e kenarı' },
] as const;

export function GuitarPhotos({ textures, onChanged, onClose }: { textures: Record<string, string | null>; onChanged: () => void; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imgEl = useRef<HTMLImageElement>(null);
  const rectified = useRef<HTMLCanvasElement | null>(null);

  const pick = (file: File) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setPts([]);
      setPreview(null);
    };
    i.src = url;
  };

  const click = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!img || pts.length >= 4) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p: Pt = [((e.clientX - r.left) / r.width) * img.naturalWidth, ((e.clientY - r.top) / r.height) * img.naturalHeight];
    const next = [...pts, p];
    setPts(next);
    if (next.length === 4) {
      const c = rectifyFretboard(img, { nutLow: next[0], nutHigh: next[1], fretLow: next[2], fretHigh: next[3] });
      rectified.current = c;
      setPreview(c.toDataURL('image/jpeg', 0.85));
    }
  };

  const save = async () => {
    if (!rectified.current) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await new Promise<Blob>((res) => rectified.current!.toBlob((b) => res(b!), 'image/jpeg', 0.92));
      const r = await api.putTexture('fretboard', blob);
      if (!r.ok) throw new Error('Kaydedilemedi');
      onChanged();
      setImg(null);
      setPreview(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadTop = async (file: File) => {
    setBusy(true);
    await api.putTexture('top', file);
    setBusy(false);
    onChanged();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Gitarının fotoğrafları</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">✕</button>
        </div>

        <section>
          <h3>Fretboard</h3>
          <p className="muted">
            Sapı üstten, düz ve iyi ışıkta çek. Nut'tan en az 12. perdeye kadar görünsün. Sonra fotoğrafta sırayla 4 noktaya tıkla, uygulama perspektifi düzeltip desenleri 3D sapa birebir yerleştirir.
          </p>
          <div className="row">
            <label className="btn">
              Fotoğraf seç
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            </label>
            {textures.fretboard && (
              <button className="btn ghost" onClick={async () => { await api.deleteTexture('fretboard'); onChanged(); }}>Fotoğrafı kaldır</button>
            )}
          </div>
          {img && (
            <>
              <p className="step">
                {pts.length < 4 ? <>Adım {pts.length + 1}/4: <b>{STEPS[pts.length].label}</b></> : 'Önizleme hazır. Desenler perdelere oturduysa kaydet.'}
              </p>
              <div className="calib">
                <img ref={imgEl} src={img.src} onClick={click} alt="Fretboard fotoğrafı" />
                {pts.map((p, i) => (
                  <span key={i} className="calib-pt" style={{ left: `${(p[0] / img.naturalWidth) * 100}%`, top: `${(p[1] / img.naturalHeight) * 100}%` }}>{i + 1}</span>
                ))}
              </div>
              {preview && <img className="rectified" src={preview} alt="Düzeltilmiş fretboard" />}
              <div className="row">
                <button className="btn ghost" onClick={() => { setPts([]); setPreview(null); }}>Noktaları sıfırla</button>
                <button className="btn primary" disabled={!preview || busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Gitara uygula'}</button>
              </div>
            </>
          )}
        </section>

        <section>
          <h3>Gövde</h3>
          <p className="muted">Gövdenin tam önden çekilmiş, sap yukarı bakacak şekilde kırpılmış fotoğrafı. Gövde kenarları kareye değsin.</p>
          <div className="row">
            <label className="btn">
              Gövde fotoğrafı seç
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadTop(e.target.files[0])} />
            </label>
            {textures.top && <button className="btn ghost" onClick={async () => { await api.deleteTexture('top'); onChanged(); }}>Fotoğrafı kaldır</button>}
          </div>
        </section>
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
