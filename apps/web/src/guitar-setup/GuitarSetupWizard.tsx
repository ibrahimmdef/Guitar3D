import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GuitarFinish, GuitarProfile } from '@guitar3d/shared';
import { GUITAR_SIZE_PRESETS } from '@guitar3d/shared';
import {
  assembleProfile,
  buildHeadstock,
  circleFromClicks,
  colorDistance,
  detectFrets,
  detectSoundhole,
  downscale,
  extractBody,
  fretboardWidths,
  luminance,
  maskedMedianColor,
  otsuThreshold,
  rectifyBodyTop,
  sampleBackground,
  sampleColorAt,
  scaleFrame,
  segmentGuitar,
  solveFrame,
  toHex,
  toImage,
  warpFretboard,
  DEFAULT_FINISH,
  type BodyMeasurements,
  type FrameSolution,
  type FretLine,
  type HeadstockResult,
  type Landmarks,
  type Pt,
  type RGBAImage,
  type SegmentResult,
  type SizeSpec,
  type SoundholeGuess,
} from './lib';
import { canvasToBlob, loadPhoto, maskOverlay, rgbaToCanvas, type LoadedPhoto } from './dom';
import { PhotoCanvas, type Handle } from './PhotoCanvas';
import { guitarsApi } from './api';

export interface GuitarSetupWizardProps {
  /** Called with the stored profile (texture URLs filled in) after saving. */
  onSaved?: (profile: GuitarProfile) => void;
  onCancel?: () => void;
  /** Injected API (tests / storybook). */
  api?: typeof guitarsApi;
}

const STEPS = ['Ön fotoğraf', 'Ölçü noktaları', 'Fretboard', 'Headstock', 'Renkler', 'Kaydet'] as const;
const SEG_DIM = 900;
const LANDMARKS = [
  { key: 'headTip', label: 'Headstock ucu' },
  { key: 'nut', label: 'Nut (sapın başı, ortası)' },
  { key: 'fret', label: 'Bilinen perde teli (ortası)' },
  { key: 'saddle', label: 'Köprüdeki eğer (saddle)' },
  { key: 'bodyEnd', label: 'Gövdenin alt ucu' },
] as const;
const FB_POINTS = ['Nut, kalın E kenarı', 'Nut, ince e kenarı', 'Son perde, kalın E kenarı', 'Son perde, ince e kenarı'];

type HeadMode = 'low' | 'high' | 'tunersLow' | 'tunersHigh';
type ColorKey = 'top' | 'neck' | 'binding' | 'fretboard' | 'headstock';

/**
 * Step-by-step "create your guitar from photos" wizard. Plain markup, styled only through CSS
 * variables (`--gs-*` with app-token fallbacks) so the UI workstream can restyle it.
 */
export function GuitarSetupWizard({ onSaved, onCancel, api = guitarsApi }: GuitarSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // a. front photo + segmentation
  const [front, setFront] = useState<LoadedPhoto | null>(null);
  const [small, setSmall] = useState<{ image: RGBAImage; scale: number; distance: Float32Array; otsu: number } | null>(null);
  const [threshold, setThreshold] = useState(60);
  const [seed, setSeed] = useState<Pt | null>(null);
  const [seg, setSeg] = useState<SegmentResult | null>(null);

  // b. landmarks + size
  const [marks, setMarks] = useState<Pt[]>([]);
  const [fretN, setFretN] = useState(12);
  const [size, setSize] = useState<SizeSpec>({ kind: 'total', cm: 106.7 });
  const [lefty, setLefty] = useState(false);
  const [solution, setSolution] = useState<FrameSolution | null>(null);
  const [body, setBody] = useState<BodyMeasurements | null>(null);
  const [hole, setHole] = useState<SoundholeGuess | { x: number; y: number; radiusCm: number } | null>(null);
  const [holeClicks, setHoleClicks] = useState<Pt[] | null>(null);

  // c. fretboard
  const [neck, setNeck] = useState<LoadedPhoto | null>(null);
  const [fbClicks, setFbClicks] = useState<Pt[]>([]);
  const [lastFret, setLastFret] = useState(12);
  const [frets, setFrets] = useState<FretLine[] | null>(null);
  const [fbPreview, setFbPreview] = useState<HTMLCanvasElement | null>(null);
  const [nutWidth, setNutWidth] = useState(4.3);
  const [endWidth, setEndWidth] = useState(5.6);
  const [fretCount, setFretCount] = useState(20);

  // d. headstock
  const [headSrc, setHeadSrc] = useState<'neck' | 'front'>('neck');
  const [headMode, setHeadMode] = useState<HeadMode>('low');
  const [headPts, setHeadPts] = useState<Record<HeadMode, Pt[]>>({ low: [], high: [], tunersLow: [], tunersHigh: [] });
  const [head, setHead] = useState<HeadstockResult | null>(null);
  const [headPreview, setHeadPreview] = useState<HTMLCanvasElement | null>(null);

  // e. finish
  const [finish, setFinish] = useState<GuitarFinish>(DEFAULT_FINISH);
  const [colorPick, setColorPick] = useState<ColorKey | null>(null);

  // f. save
  const [name, setName] = useState('Gitarım');
  const [makeActive, setMakeActive] = useState(true);

  const run = useCallback(async (label: string, fn: () => void | Promise<void>) => {
    setBusy(label);
    setError(null);
    await new Promise((r) => setTimeout(r, 20)); // let the busy label paint
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  // ---------- a. segmentation ----------
  const pickFront = (file: File) =>
    run('Fotoğraf okunuyor…', async () => {
      const ph = await loadPhoto(file);
      const ds = downscale(ph.rgba, SEG_DIM);
      const distance = colorDistance(ds.image, sampleBackground(ds.image));
      const otsu = otsuThreshold(distance);
      setFront(ph);
      setSmall({ ...ds, distance, otsu });
      setThreshold(Math.round(otsu));
      setSeed(null);
      setMarks([]);
      setSolution(null);
      setBody(null);
      setHole(null);
    });

  useEffect(() => {
    if (!small) return;
    const t = setTimeout(() => {
      try {
        setSeg(segmentGuitar(small.image, { threshold, seed: seed ? [seed[0] * small.scale, seed[1] * small.scale] : undefined }, small.distance));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [small, threshold, seed]);

  const maskCanvas = useMemo(() => (seg ? maskOverlay(seg.mask) : null), [seg]);

  // ---------- b. landmarks ----------
  const landmarks = (): Landmarks | null =>
    marks.length < 5 ? null : { headTip: marks[0], nut: marks[1], fret: { n: fretN, p: marks[2] }, saddle: marks[3], bodyEnd: marks[4] };

  const measure = () =>
    run('Gövde ölçülüyor…', () => {
      const lm = landmarks();
      if (!lm || !seg || !small || !front) throw new Error('Önce beş noktanın hepsini işaretle.');
      const sol = solveFrame(lm, size, lefty ? 'right' : 'left');
      const f = scaleFrame(sol.frame, small.scale);
      const b = extractBody(seg.mask, f, sol.scaleLengthCm);
      const sh = detectSoundhole(luminance(small.image), f, sol.scaleLengthCm);
      setSolution(sol);
      setBody(b);
      setHole(sh);
      setFinish((o) => ({ ...o, top: toHex(maskedMedianColor(small.image, b.bodyMask)) }));
    });

  const frontHandles: Handle[] = useMemo(() => {
    if (step === 1 && holeClicks) return holeClicks.map((p, i) => ({ p, label: i ? 'kenar' : 'merkez', color: '#f5a524' }));
    if (step === 1) return marks.map((p, i) => ({ p, label: LANDMARKS[i].label.split(' (')[0] }));
    if (step === 0 && seed) return [{ p: seed, label: 'gövde', color: '#f5a524' }];
    return [];
  }, [step, marks, seed, holeClicks]);

  const frontOverlay = useCallback(
    (g: CanvasRenderingContext2D, k: number) => {
      if (!front) return;
      if (step === 0 && maskCanvas) g.drawImage(maskCanvas, 0, 0, front.rgba.width, front.rgba.height);
      if (step === 1 && solution && body) {
        g.lineWidth = 2 / k;
        g.strokeStyle = '#4c8dff';
        g.beginPath();
        body.outline.forEach(([x, y], i) => {
          const p = toImage(solution.frame, [x, y]);
          if (i) g.lineTo(p[0], p[1]);
          else g.moveTo(p[0], p[1]);
        });
        g.closePath();
        g.stroke();
        if (hole) {
          const c = toImage(solution.frame, [hole.x, hole.y]);
          g.strokeStyle = '#f5a524';
          g.beginPath();
          g.arc(c[0], c[1], hole.radiusCm * solution.frame.pxPerCm, 0, Math.PI * 2);
          g.stroke();
        }
      }
      if (step === 3 && headSrc === 'front') drawHeadPts(g, k, headPts);
    },
    [front, step, maskCanvas, solution, body, hole, headSrc, headPts],
  );

  const pickFrontPoint = (p: Pt) => {
    if (step === 0) return setSeed(p);
    if (step === 1) {
      if (holeClicks) {
        const next = [...holeClicks, p];
        if (next.length === 2 && solution) {
          setHole(circleFromClicks(solution.frame, next[0], next[1]));
          setHoleClicks(null);
        } else setHoleClicks(next);
        return;
      }
      if (marks.length < 5) setMarks([...marks, p]);
      return;
    }
    if (step === 3 && headSrc === 'front') addHeadPt(p);
    if (step === 4 && colorPick && front) pickColor(front.rgba, p);
  };

  // ---------- c. fretboard ----------
  const neckPhoto = neck ?? front;
  const pickNeck = (file: File) =>
    run('Fotoğraf okunuyor…', async () => {
      setNeck(await loadPhoto(file));
      setFbClicks([]);
      setFrets(null);
      setFbPreview(null);
    });

  const detect = () =>
    run('Perdeler aranıyor…', () => {
      if (!neckPhoto || fbClicks.length < 4) throw new Error('Dört köşeyi işaretle.');
      const lines = detectFrets(luminance(neckPhoto.rgba), { nut: { low: fbClicks[0], high: fbClicks[1] }, last: { n: lastFret, low: fbClicks[2], high: fbClicks[3] } });
      setFrets(lines);
    });

  useEffect(() => {
    if (!frets || !neckPhoto) return;
    const t = setTimeout(() => {
      setFbPreview(rgbaToCanvas(warpFretboard(neckPhoto.rgba, frets, lastFret, 1024, 128)));
      if (solution) {
        const w = fretboardWidths(frets, solution.scaleLengthCm, fretCount);
        if (w.nutWidthCm > 3.5 && w.nutWidthCm < 6) setNutWidth(w.nutWidthCm);
        if (w.endWidthCm > 4 && w.endWidthCm < 7.5) setEndWidth(w.endWidthCm);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [frets, neckPhoto, lastFret, solution, fretCount]);

  const fbHandles: Handle[] = useMemo(() => {
    if (frets) return frets.flatMap((l) => [
      { p: l.low, label: String(l.n), color: l.confidence > 0.3 ? '#4c8dff' : '#e5484d' },
      { p: l.high, label: '', color: l.confidence > 0.3 ? '#4c8dff' : '#e5484d' },
    ]);
    return fbClicks.map((p, i) => ({ p, label: String(i + 1) }));
  }, [frets, fbClicks]);

  const fbOverlay = useCallback(
    (g: CanvasRenderingContext2D, k: number) => {
      if (step === 3 && headSrc === 'neck') return drawHeadPts(g, k, headPts);
      if (!frets) return;
      g.lineWidth = 2 / k;
      for (const l of frets) {
        g.strokeStyle = l.confidence > 0.3 ? 'rgba(76,141,255,0.9)' : 'rgba(229,72,77,0.9)';
        g.beginPath();
        g.moveTo(l.low[0], l.low[1]);
        g.lineTo(l.high[0], l.high[1]);
        g.stroke();
      }
    },
    [frets, step, headSrc, headPts],
  );

  // ---------- d. headstock ----------
  const addHeadPt = (p: Pt) => setHeadPts((o) => ({ ...o, [headMode]: [...o[headMode], p] }));
  const headPhoto = headSrc === 'neck' ? neckPhoto : front;
  const buildHead = () =>
    run('Headstock düzleştiriliyor…', () => {
      if (!headPhoto) throw new Error('Fotoğraf yok.');
      let ppc: number;
      if (headSrc === 'front' || !neck) {
        if (!solution) throw new Error('Önce ölçü adımını tamamla.');
        ppc = solution.frame.pxPerCm;
      } else {
        if (fbClicks.length < 2) throw new Error('Ölçek için fretboard adımında nut uçlarını işaretle.');
        ppc = Math.hypot(fbClicks[0][0] - fbClicks[1][0], fbClicks[0][1] - fbClicks[1][1]) / nutWidth;
      }
      const res = buildHeadstock(headPhoto.rgba, {
        lowSide: headPts.low,
        highSide: headPts.high,
        tunersLowE: headPts.tunersLow,
        tunersHighE: headPts.tunersHigh,
        pxPerCmAcross: ppc,
      }, 256, 512);
      setHead(res);
      setHeadPreview(rgbaToCanvas(res.texture));
    });

  // ---------- e. colours ----------
  const pickColor = (img: RGBAImage, p: Pt) => {
    if (!colorPick) return;
    const hex = toHex(sampleColorAt(img, p, 5));
    setFinish((o) => ({ ...o, [colorPick]: hex, ...(colorPick === 'top' ? { sides: o.sides } : {}) }));
    setColorPick(null);
  };

  // ---------- f. save ----------
  const save = () =>
    run('Kaydediliyor…', async () => {
      if (!front || !solution || !body || !hole) throw new Error('Ölçü adımı tamamlanmadı.');
      const profile = assembleProfile({
        name,
        totalLengthCm: solution.totalLengthCm,
        scaleLengthCm: solution.scaleLengthCm,
        body,
        soundhole: hole,
        saddleX: -solution.scaleFromSaddleCm,
        fretCount,
        nutWidthCm: nutWidth,
        endWidthCm: endWidth,
        headstock: head ?? undefined,
        finish,
      });
      let saved = await api.create(profile);
      const top = rectifyBodyTop(front.rgba, solution.frame, body.outline, body.bounds, 16);
      saved = await api.putTexture(saved.id, 'bodyTop', await canvasToBlob(rgbaToCanvas(top), 'image/png'));
      if (frets && neckPhoto) {
        const fb = warpFretboard(neckPhoto.rgba, frets, lastFret, 2048, 256);
        saved = await api.putTexture(saved.id, 'fretboard', await canvasToBlob(rgbaToCanvas(fb), 'image/jpeg', 0.9), lastFret);
      }
      if (head) saved = await api.putTexture(saved.id, 'headstock', await canvasToBlob(rgbaToCanvas(head.texture), 'image/jpeg', 0.9));
      if (makeActive) await api.setActiveGuitar(saved.id);
      onSaved?.(saved);
    });

  const canNext = [!!seg, !!body && !!hole, true, true, true, false][step];

  return (
    <div className="guitar-setup" style={S.root}>
      <ol style={S.steps}>
        {STEPS.map((s, i) => (
          <li key={s} style={{ ...S.stepItem, ...(i === step ? S.stepActive : {}) }}>
            <button type="button" style={S.linkBtn} disabled={i > step && !canNext} onClick={() => setStep(i)}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section style={S.section}>
          <p style={S.muted}>
            Gitarın tamamını önden, düz bir zeminin önünde çek. Kenarlar kadraja değmesin. Sonra gövdenin içine bir kez tıkla; mavi alan gitarı
            kaplayana kadar eşiği ayarla.
          </p>
          <FileButton label={front ? 'Başka fotoğraf seç' : 'Ön fotoğraf seç'} onFile={pickFront} />
          {front && (
            <>
              <label style={S.row}>
                Eşik
                <input type="range" min={5} max={250} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                <span style={S.muted}>{threshold}{small ? ` (otomatik ${Math.round(small.otsu)})` : ''}</span>
              </label>
              <PhotoCanvas source={front.canvas} overlay={frontOverlay} handles={frontHandles} onPick={pickFrontPoint} />
            </>
          )}
        </section>
      )}

      {step === 1 && front && (
        <section style={S.section}>
          <p style={S.muted}>
            {holeClicks
              ? holeClicks.length === 0 ? 'Ses deliğinin merkezine tıkla.' : 'Ses deliğinin kenarına tıkla.'
              : marks.length < 5
                ? <>Sırayla işaretle: <b>{LANDMARKS[marks.length].label}</b> ({marks.length + 1}/5). Noktaları sürükleyerek düzeltebilirsin.</>
                : 'Noktalar tamam. Boyu seç ve ölç.'}
          </p>
          <div style={S.row}>
            <label>Perde no <input type="number" min={1} max={20} value={fretN} onChange={(e) => setFretN(Number(e.target.value) || 12)} style={S.num} /></label>
            {GUITAR_SIZE_PRESETS.map((p) => (
              <button key={p.label} type="button" style={{ ...S.btn, ...(size.kind === 'total' && size.cm === p.cm ? S.btnOn : {}) }} onClick={() => setSize({ kind: 'total', cm: p.cm })}>
                {p.label}
              </button>
            ))}
            <label>Toplam <input type="number" step={0.1} value={size.kind === 'total' ? size.cm : ''} placeholder="cm" onChange={(e) => setSize({ kind: 'total', cm: Number(e.target.value) })} style={S.num} /> cm</label>
            <label>ya da tel boyu <input type="number" step={0.1} value={size.kind === 'scale' ? size.cm : ''} placeholder="64.8" onChange={(e) => setSize({ kind: 'scale', cm: Number(e.target.value) })} style={S.num} /> cm</label>
            <label><input type="checkbox" checked={lefty} onChange={(e) => setLefty(e.target.checked)} /> Solak gitar</label>
          </div>
          <div style={S.row}>
            <button type="button" style={S.btn} onClick={() => setMarks(marks.slice(0, -1))} disabled={!marks.length}>Son noktayı geri al</button>
            <button type="button" style={S.btnPrimary} onClick={measure} disabled={marks.length < 5}>Ölç</button>
            {body && <button type="button" style={S.btn} onClick={() => setHoleClicks([])}>Ses deliğini elle işaretle</button>}
          </div>
          {solution && body && (
            <p style={S.muted}>
              Toplam {solution.totalLengthCm.toFixed(1)} cm · tel boyu {solution.scaleLengthCm.toFixed(1)} cm · gövde {body.lengthCm.toFixed(1)} cm · üst/bel/alt{' '}
              {body.bouts.upperCm.toFixed(1)}/{body.bouts.waistCm.toFixed(1)}/{body.bouts.lowerCm.toFixed(1)} cm
              {hole && ` · ses deliği Ø ${(hole.radiusCm * 2).toFixed(1)} cm${'confident' in hole && !hole.confident ? ' (emin değilim, elle işaretle)' : ''}`}
            </p>
          )}
          {solution?.warnings.map((w) => <p key={w} style={S.warn}>{w}</p>)}
          <PhotoCanvas
            source={front.canvas}
            overlay={frontOverlay}
            handles={frontHandles}
            onPick={pickFrontPoint}
            onDrag={holeClicks ? undefined : (i, p) => setMarks((m) => m.map((q, j) => (j === i ? p : q)))}
          />
        </section>
      )}

      {step === 2 && (
        <section style={S.section}>
          <p style={S.muted}>
            Sapı üstten, iyi ışıkta ve olabildiğince düz çek (ön fotoğraf da kullanılabilir ama yakın çekim daha net olur). Dört köşeyi işaretle, sonra
            perdeleri bul. Kırmızı çizgiler tahmin; uçlarını sürükleyerek düzelt.
          </p>
          <div style={S.row}>
            <FileButton label={neck ? 'Başka fotoğraf seç' : 'Sap fotoğrafı seç'} onFile={pickNeck} />
            <label>Son işaretlenen perde <input type="number" min={3} max={24} value={lastFret} onChange={(e) => setLastFret(Number(e.target.value) || 12)} style={S.num} /></label>
            <button type="button" style={S.btn} onClick={() => { setFbClicks([]); setFrets(null); setFbPreview(null); }}>Sıfırla</button>
            <button type="button" style={S.btnPrimary} onClick={detect} disabled={fbClicks.length < 4}>Perdeleri bul</button>
          </div>
          {!frets && fbClicks.length < 4 && <p style={S.muted}>Adım {fbClicks.length + 1}/4: <b>{FB_POINTS[fbClicks.length]}</b></p>}
          {neckPhoto && (
            <PhotoCanvas
              source={neckPhoto.canvas}
              overlay={fbOverlay}
              handles={fbHandles}
              onPick={(p) => !frets && fbClicks.length < 4 && setFbClicks([...fbClicks, p])}
              onDrag={(i, p) => {
                if (frets) setFrets(frets.map((l, j) => (j === i >> 1 ? { ...l, confidence: 1, ...(i % 2 ? { high: p } : { low: p }) } : l)));
                else setFbClicks(fbClicks.map((q, j) => (j === i ? p : q)));
              }}
            />
          )}
          {fbPreview && <PhotoCanvas source={fbPreview} maxHeight={120} cursor="default" />}
          <div style={S.row}>
            <label>Nut genişliği <input type="number" step={0.05} value={nutWidth} onChange={(e) => setNutWidth(Number(e.target.value))} style={S.num} /> cm</label>
            <label>Son perdede genişlik <input type="number" step={0.05} value={endWidth} onChange={(e) => setEndWidth(Number(e.target.value))} style={S.num} /> cm</label>
            <label>Perde sayısı <input type="number" min={12} max={24} value={fretCount} onChange={(e) => setFretCount(Number(e.target.value) || 20)} style={S.num} /></label>
          </div>
        </section>
      )}

      {step === 3 && (
        <section style={S.section}>
          <p style={S.muted}>
            Headstock kenarlarını nut’tan uca doğru birkaç noktayla işaretle, sonra burguların (tuner) millerine tıkla. Bu adımı atlarsan tipik bir
            headstock kullanılır.
          </p>
          <div style={S.row}>
            <label>
              Fotoğraf{' '}
              <select value={headSrc} onChange={(e) => setHeadSrc(e.target.value as 'neck' | 'front')} style={S.num}>
                <option value="neck">Sap fotoğrafı</option>
                <option value="front">Ön fotoğraf</option>
              </select>
            </label>
            {(['low', 'high', 'tunersLow', 'tunersHigh'] as HeadMode[]).map((m) => (
              <button key={m} type="button" style={{ ...S.btn, ...(headMode === m ? S.btnOn : {}) }} onClick={() => setHeadMode(m)}>
                {{ low: 'Kalın E kenarı', high: 'İnce e kenarı', tunersLow: 'Kalın taraf burgular', tunersHigh: 'İnce taraf burgular' }[m]} ({headPts[m].length})
              </button>
            ))}
            <button type="button" style={S.btn} onClick={() => setHeadPts((o) => ({ ...o, [headMode]: o[headMode].slice(0, -1) }))}>Geri al</button>
            <button type="button" style={S.btnPrimary} onClick={buildHead} disabled={headPts.low.length < 2 || headPts.high.length < 2}>Düzleştir</button>
          </div>
          {headPhoto && (
            <PhotoCanvas
              source={headPhoto.canvas}
              overlay={headSrc === 'neck' ? fbOverlay : frontOverlay}
              onPick={addHeadPt}
            />
          )}
          {head && headPreview && (
            <div style={S.row}>
              <PhotoCanvas source={headPreview} maxHeight={240} cursor="default" />
              <p style={S.muted}>Uzunluk {head.lengthCm.toFixed(1)} cm · burgular {head.tunersLowE.length}+{head.tunersHighE.length}</p>
            </div>
          )}
        </section>
      )}

      {step === 4 && front && (
        <section style={S.section}>
          <p style={S.muted}>Renkleri fotoğraftan almak için bir alan seçip fotoğrafa tıkla ya da elle değiştir.</p>
          <div style={S.row}>
            {(['top', 'neck', 'fretboard', 'headstock', 'binding'] as ColorKey[]).map((k) => (
              <label key={k} style={S.row}>
                {{ top: 'Kapak', neck: 'Sap', fretboard: 'Klavye', headstock: 'Headstock', binding: 'Biye' }[k]}
                <input type="color" value={(finish[k] as string | null) ?? '#ffffff'} onChange={(e) => setFinish({ ...finish, [k]: e.target.value })} />
                <button type="button" style={{ ...S.btn, ...(colorPick === k ? S.btnOn : {}) }} onClick={() => setColorPick(colorPick === k ? null : k)}>Fotoğraftan</button>
              </label>
            ))}
          </div>
          <div style={S.row}>
            <label>Yanlar/arka <input type="color" value={finish.sides} onChange={(e) => setFinish({ ...finish, sides: e.target.value, back: e.target.value })} /></label>
            <label>
              Donanım{' '}
              <select value={finish.hardware} onChange={(e) => setFinish({ ...finish, hardware: e.target.value as GuitarFinish['hardware'] })} style={S.num}>
                <option value="chrome">Krom</option>
                <option value="gold">Altın</option>
                <option value="black">Siyah</option>
              </select>
            </label>
            <label style={S.row}>
              Parlaklık
              <input type="range" min={0} max={1} step={0.05} value={finish.gloss} onChange={(e) => setFinish({ ...finish, gloss: Number(e.target.value) })} />
              <span style={S.muted}>{finish.gloss < 0.3 ? 'mat' : finish.gloss < 0.7 ? 'saten' : 'parlak'}</span>
            </label>
          </div>
          <PhotoCanvas source={front.canvas} onPick={(p) => pickColor(front.rgba, p)} cursor={colorPick ? 'copy' : 'default'} maxHeight={480} />
        </section>
      )}

      {step === 5 && (
        <section style={S.section}>
          <label style={S.row}>Ad <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={{ ...S.num, width: 240 }} /></label>
          <label style={S.row}><input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Kaydettikten sonra bu gitarı kullan</label>
          <ul style={S.muted}>
            <li>Ölçüler: {solution ? `${solution.totalLengthCm.toFixed(1)} cm, tel boyu ${solution.scaleLengthCm.toFixed(1)} cm` : 'eksik'}</li>
            <li>Gövde konturu ve dokusu: {body ? 'hazır' : 'eksik'}</li>
            <li>Fretboard dokusu: {frets ? `nut → ${lastFret}. perde` : 'yok (düz renk kullanılır)'}</li>
            <li>Headstock: {head ? 'fotoğraftan' : 'tipik şekil'}</li>
          </ul>
          <button type="button" style={S.btnPrimary} onClick={save} disabled={!body || !!busy}>Kaydet</button>
        </section>
      )}

      {busy && <p style={S.muted} aria-live="polite">{busy}</p>}
      {error && <p style={S.error} role="alert">{error}</p>}

      <div style={{ ...S.row, justifyContent: 'space-between' }}>
        <div style={S.row}>
          {onCancel && <button type="button" style={S.btn} onClick={onCancel}>Vazgeç</button>}
          {step > 0 && <button type="button" style={S.btn} onClick={() => setStep(step - 1)}>Geri</button>}
        </div>
        {step < STEPS.length - 1 && (
          <button type="button" style={S.btnPrimary} disabled={!canNext || !!busy} onClick={() => setStep(step + 1)}>
            {step === 2 && !frets ? 'Atla' : step === 3 && !head ? 'Atla' : 'İleri'}
          </button>
        )}
      </div>
    </div>
  );
}

function drawHeadPts(g: CanvasRenderingContext2D, k: number, pts: Record<HeadMode, Pt[]>) {
  const colors: Record<HeadMode, string> = { low: '#4c8dff', high: '#30a46c', tunersLow: '#f5a524', tunersHigh: '#f5a524' };
  for (const m of Object.keys(pts) as HeadMode[]) {
    g.strokeStyle = g.fillStyle = colors[m];
    g.lineWidth = 2 / k;
    if (m === 'low' || m === 'high') {
      g.beginPath();
      pts[m].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
    }
    for (const p of pts[m]) {
      g.beginPath();
      g.arc(p[0], p[1], 5 / k, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function FileButton({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label style={S.btn}>
      {label}
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

const border = '1px solid var(--gs-border, var(--border, #555))';
const S: Record<string, React.CSSProperties> = {
  root: { display: 'grid', gap: 16, color: 'var(--gs-fg, var(--fg, inherit))' },
  steps: { display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 },
  stepItem: { opacity: 0.6 },
  stepActive: { opacity: 1, fontWeight: 600 },
  section: { display: 'grid', gap: 12 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  muted: { margin: 0, fontSize: 13, color: 'var(--gs-muted, var(--muted, #8a8f98))' },
  warn: { margin: 0, fontSize: 13, color: 'var(--gs-warn, #f5a524)' },
  error: { margin: 0, color: 'var(--gs-error, var(--danger, #e5484d))' },
  btn: { cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--gs-radius, 6px)', border, background: 'transparent', color: 'inherit', font: 'inherit' },
  btnOn: { background: 'var(--gs-accent-weak, rgba(76,141,255,0.2))' },
  btnPrimary: { cursor: 'pointer', padding: '6px 14px', borderRadius: 'var(--gs-radius, 6px)', border: '1px solid transparent', background: 'var(--gs-accent, var(--accent, #4c8dff))', color: 'var(--gs-on-accent, #fff)', font: 'inherit' },
  linkBtn: { background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 },
  num: { width: 72, background: 'transparent', color: 'inherit', border, borderRadius: 4, padding: '2px 4px', font: 'inherit' },
};
