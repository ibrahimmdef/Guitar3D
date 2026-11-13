import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Undo2, Wand2 } from 'lucide-react';
import type { GuitarFinish, GuitarProfile } from '@guitar3d/shared';
import { Button, SegmentedControl, Slider, Toggle } from '../ui/kit';
import { StageGuitar } from '../screens/player/StageGuitar';
import {
  assembleProfile,
  autoLandmarks,
  buildHeadstock,
  circleFromClicks,
  detectFrets,
  detectSoundhole,
  downscale,
  extractBody,
  fretboardWidths,
  luminance,
  maskedMedianColor,
  rectifyBodyTop,
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
import { setActiveGuitar } from './activeGuitar';
import { Field, FinishEditor, MakeActiveToggle, NumberInput, SizePresets, type FinishKey } from './controls';

export interface GuitarSetupWizardProps {
  /** 'photo': full step-by-step flow; 'quick': one front photo + size, landmarks guessed. */
  mode?: 'photo' | 'quick';
  /** Called with the stored profile (texture URLs filled in) after saving. */
  onSaved?: (profile: GuitarProfile) => void;
  onCancel?: () => void;
  /** Injected API (tests / storybook). */
  api?: typeof guitarsApi;
}

type StepKey = 'front' | 'marks' | 'size' | 'fretboard' | 'headstock' | 'colors' | 'preview';
const STEP_LABEL: Record<StepKey, string> = {
  front: 'Ön fotoğraf',
  marks: 'Noktalar',
  size: 'Boy',
  fretboard: 'Klavye',
  headstock: 'Kafa',
  colors: 'Renkler',
  preview: 'Önizleme',
};
const FLOWS: Record<'photo' | 'quick', StepKey[]> = {
  photo: ['front', 'marks', 'size', 'fretboard', 'headstock', 'colors', 'preview'],
  quick: ['front', 'size', 'preview'],
};
const OPTIONAL: StepKey[] = ['fretboard', 'headstock'];

const SEG_DIM = 900;
const LANDMARKS = [
  { label: 'Kafanın ucu', help: 'Kafanın (headstock) en üst noktasına, ortadan tıkla.' },
  { label: 'Eşik (nut)', help: 'Tellerin kafadan sapa geçtiği beyaz çubuğun ortasına tıkla.' },
  { label: 'Perde teli', help: 'Bildiğin bir perde telinin ortasına tıkla (12. perde genelde iki noktayla işaretlidir). Emin değilsen atla.' },
  { label: 'Köprü eşiği (saddle)', help: 'Köprüdeki ince beyaz çubuğun ortasına tıkla.' },
  { label: 'Gövdenin alt ucu', help: 'Gövdenin en alt noktasına, ortadan tıkla.' },
] as const;
const FB_POINTS = ['Eşikte kalın E kenarı', 'Eşikte ince e kenarı', 'Son perdede kalın E kenarı', 'Son perdede ince e kenarı'];
type HeadMode = 'low' | 'high' | 'tunersLow' | 'tunersHigh';
const HEAD_LABEL: Record<HeadMode, string> = { low: 'Kalın E kenarı', high: 'İnce e kenarı', tunersLow: 'Kalın taraf burgular', tunersHigh: 'İnce taraf burgular' };
const ACCENT = '#f5b83d';
const BLUE = '#6aa8ff';

type Click = { kind: 'fg' | 'bg'; p: Pt };
type Hole = SoundholeGuess | { x: number; y: number; radiusCm: number };

const fmt = (v: number, d = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * "Add your guitar from photos". Full mode: front photo → segmentation → landmark clicks → size →
 * optional fretboard / headstock photos → colours → 3D preview → save. Quick mode: front photo +
 * size, landmarks guessed from the silhouette (still draggable).
 */
export function GuitarSetupWizard({ mode = 'photo', onSaved, onCancel, api = guitarsApi }: GuitarSetupWizardProps) {
  const flow = FLOWS[mode];
  const [stepIdx, setStepIdx] = useState(0);
  const step = flow[stepIdx];
  const [visited, setVisited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // front photo + segmentation
  const [front, setFront] = useState<LoadedPhoto | null>(null);
  const [small, setSmall] = useState<{ image: RGBAImage; scale: number } | null>(null);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [clickKind, setClickKind] = useState<'fg' | 'bg'>('fg');
  const [threshold, setThreshold] = useState<number | null>(null);
  const [seg, setSeg] = useState<SegmentResult | null>(null);
  const distCache = useRef<{ key: string; distance: Float32Array } | null>(null);

  // landmarks + size
  const [marks, setMarks] = useState<(Pt | null)[]>([]);
  const [fretN, setFretN] = useState(12);
  const [sizeKind, setSizeKind] = useState<SizeSpec['kind']>('total');
  const [sizeCm, setSizeCm] = useState(104.1);
  const [lefty, setLefty] = useState(false);
  const [solution, setSolution] = useState<FrameSolution | null>(null);
  const [body, setBody] = useState<BodyMeasurements | null>(null);
  const [hole, setHole] = useState<Hole | null>(null);
  const [manualHole, setManualHole] = useState<Hole | null>(null);
  const [holeClicks, setHoleClicks] = useState<Pt[] | null>(null);

  // fretboard
  const [neck, setNeck] = useState<LoadedPhoto | null>(null);
  const [fbClicks, setFbClicks] = useState<Pt[]>([]);
  const [lastFret, setLastFret] = useState(12);
  const [frets, setFrets] = useState<FretLine[] | null>(null);
  const [fbPreview, setFbPreview] = useState<HTMLCanvasElement | null>(null);
  const [nutWidth, setNutWidth] = useState(4.3);
  const [endWidth, setEndWidth] = useState(5.6);
  const [fretCount, setFretCount] = useState(20);

  // headstock
  const [headPhotoFile, setHeadPhotoFile] = useState<LoadedPhoto | null>(null);
  const [headMode, setHeadMode] = useState<HeadMode>('low');
  const [headPts, setHeadPts] = useState<Record<HeadMode, Pt[]>>({ low: [], high: [], tunersLow: [], tunersHigh: [] });
  const [head, setHead] = useState<HeadstockResult | null>(null);
  const [headPreview, setHeadPreview] = useState<HTMLCanvasElement | null>(null);

  // finish + save
  const [finish, setFinish] = useState<GuitarFinish>(DEFAULT_FINISH);
  const [topFromPhoto, setTopFromPhoto] = useState(true);
  const [picking, setPicking] = useState<FinishKey | null>(null);
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

  // ---------- front photo + segmentation ----------
  const pickFront = (file: File) =>
    run('Fotoğraf okunuyor…', async () => {
      const ph = await loadPhoto(file).catch(() => {
        throw new Error('Bu dosya bir fotoğraf olarak açılamadı. JPEG ya da PNG dene.');
      });
      if (Math.min(ph.rgba.width, ph.rgba.height) < 300) throw new Error('Fotoğraf çok küçük; en az 300 piksel olmalı.');
      setFront(ph);
      setSmall(downscale(ph.rgba, SEG_DIM));
      distCache.current = null;
      setClicks([]);
      setThreshold(null);
      setMarks([]);
      setSolution(null);
      setBody(null);
      setHole(null);
      setManualHole(null);
    });

  useEffect(() => {
    if (!small) return;
    const t = setTimeout(() => {
      try {
        const s = (p: Pt): Pt => [p[0] * small.scale, p[1] * small.scale];
        const fgSeeds = clicks.filter((c) => c.kind === 'fg').map((c) => s(c.p));
        const bgSeeds = clicks.filter((c) => c.kind === 'bg').map((c) => s(c.p));
        const key = JSON.stringify([fgSeeds, bgSeeds]);
        const cached = distCache.current?.key === key ? distCache.current.distance : undefined;
        const r = segmentGuitar(small.image, { fgSeeds, bgSeeds, threshold: threshold ?? undefined }, cached);
        distCache.current = { key, distance: r.distance };
        setSeg(r);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [small, clicks, threshold]);

  const maskCanvas = useMemo(() => (seg ? maskOverlay(seg.mask, [245, 184, 61, 105]) : null), [seg]);
  const share = seg && small ? seg.area / (small.image.width * small.image.height) : 0;
  const modelMode = !!seg && seg.foreground.length > 0;

  // ---------- landmarks ----------
  const guessMarks = useCallback(() => {
    if (!seg || !small) return null;
    const a = autoLandmarks(seg.mask);
    if (!a) return null;
    const up = (p: Pt): Pt => [p[0] / small.scale, p[1] / small.scale];
    return [up(a.headTip), up(a.nut), null, up(a.saddle), up(a.bodyEnd)] as (Pt | null)[];
  }, [seg, small]);

  const landmarks: Landmarks | null = useMemo(() => {
    if (marks.length < 5 || !marks[0] || !marks[1] || !marks[3] || !marks[4]) return null;
    return { headTip: marks[0], nut: marks[1], fret: marks[2] ? { n: fretN, p: marks[2] } : undefined, saddle: marks[3], bodyEnd: marks[4] };
  }, [marks, fretN]);

  // ---------- measurement (size step) ----------
  const sizeError = !Number.isFinite(sizeCm)
    ? 'Bir boy seç ya da gir.'
    : sizeKind === 'total'
      ? sizeCm < 80 || sizeCm > 125 ? 'Toplam boy 80–125 cm arasında olmalı.' : null
      : sizeCm < 45 || sizeCm > 72 ? 'Tel boyu 45–72 cm arasında olmalı.' : null;

  useEffect(() => {
    if (step !== 'size' && step !== 'preview') return;
    if (!landmarks || !seg || !small || !front || sizeError) return;
    const t = setTimeout(() => {
      try {
        const sol = solveFrame(landmarks, { kind: sizeKind, cm: sizeCm }, { lowESide: lefty ? 'right' : 'left', imageLongSidePx: Math.max(front.rgba.width, front.rgba.height) });
        const f = scaleFrame(sol.frame, small.scale);
        const b = extractBody(seg.mask, f, sol.scaleLengthCm);
        setSolution(sol);
        setBody(b);
        setHole(detectSoundhole(luminance(small.image), f, sol.scaleLengthCm));
        if (topFromPhoto) setFinish((o) => ({ ...o, top: toHex(maskedMedianColor(small.image, b.bodyMask)) }));
        setError(null);
      } catch (e) {
        setSolution(null);
        setBody(null);
        setError((e as Error).message);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [step, landmarks, seg, small, front, sizeKind, sizeCm, lefty, sizeError, topFromPhoto]);

  const shownHole = manualHole ?? hole;

  // ---------- fretboard ----------
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
      if (!neckPhoto || fbClicks.length < 4) throw new Error('Önce klavyenin dört köşesini işaretle.');
      if (lastFret < 3 || lastFret > 24) throw new Error('Son perde 3 ile 24 arasında olmalı.');
      setFrets(detectFrets(luminance(neckPhoto.rgba), { nut: { low: fbClicks[0], high: fbClicks[1] }, last: { n: lastFret, low: fbClicks[2], high: fbClicks[3] } }));
    });
  useEffect(() => {
    if (!frets || !neckPhoto) return;
    const t = setTimeout(() => {
      setFbPreview(rgbaToCanvas(warpFretboard(neckPhoto.rgba, frets, lastFret, 1024, 128)));
      if (solution) {
        const w = fretboardWidths(frets, solution.scaleLengthCm, fretCount);
        if (w.nutWidthCm > 3.5 && w.nutWidthCm < 6) setNutWidth(Math.round(w.nutWidthCm * 100) / 100);
        if (w.endWidthCm > 4 && w.endWidthCm < 7.5) setEndWidth(Math.round(w.endWidthCm * 100) / 100);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [frets, neckPhoto, lastFret, solution, fretCount]);

  // ---------- headstock ----------
  const headPhoto = headPhotoFile ?? neck ?? front;
  const pickHead = (file: File) =>
    run('Fotoğraf okunuyor…', async () => {
      setHeadPhotoFile(await loadPhoto(file));
      setHeadPts({ low: [], high: [], tunersLow: [], tunersHigh: [] });
      setHead(null);
      setHeadPreview(null);
    });
  const buildHead = () =>
    run('Kafa düzleştiriliyor…', () => {
      if (!headPhoto) throw new Error('Fotoğraf yok.');
      if (headPts.low.length < 2 || headPts.high.length < 2) throw new Error('Her iki kenar için en az ikişer nokta işaretle.');
      // scale across: the first edge points sit at the nut, which is nutWidth wide
      const ppc = Math.hypot(headPts.low[0][0] - headPts.high[0][0], headPts.low[0][1] - headPts.high[0][1]) / nutWidth;
      const res = buildHeadstock(headPhoto.rgba, { lowSide: headPts.low, highSide: headPts.high, tunersLowE: headPts.tunersLow, tunersHighE: headPts.tunersHigh, pxPerCmAcross: ppc }, 256, 512);
      if (res.lengthCm < 8 || res.lengthCm > 30) throw new Error(`Kafa ${fmt(res.lengthCm)} cm çıktı; ilk noktaların eşikte olduğundan emin ol.`);
      setHead(res);
      setHeadPreview(rgbaToCanvas(res.texture));
    });

  // ---------- clicks on the front photo ----------
  const onFrontPick = (p: Pt) => {
    if (!front) return;
    if (step === 'front') return setClicks((c) => [...c, { kind: clickKind, p }]);
    if (step === 'marks') {
      if (marks.length < 5) setMarks((m) => [...m, p]);
      return;
    }
    if (step === 'size' && holeClicks && solution) {
      const next = [...holeClicks, p];
      if (next.length === 2) {
        setManualHole(circleFromClicks(solution.frame, next[0], next[1]));
        setHoleClicks(null);
      } else setHoleClicks(next);
      return;
    }
    if (step === 'colors' && picking) {
      const hex = toHex(sampleColorAt(front.rgba, p, 5));
      setFinish((o) => ({ ...o, [picking]: hex, ...(picking === 'sides' ? { back: hex } : {}) }));
      if (picking === 'top') setTopFromPhoto(false);
      setPicking(null);
    }
  };

  const markHandles: { h: Handle; i: number }[] = marks.flatMap((p, i) => (p ? [{ h: { p, label: LANDMARKS[i].label, color: ACCENT }, i }] : []));
  const frontHandles: Handle[] = useMemo(() => {
    if (step === 'front') return clicks.map((c) => ({ p: c.p, label: c.kind === 'fg' ? 'gitar' : 'arka plan', color: c.kind === 'fg' ? ACCENT : BLUE }));
    if (step === 'size' && holeClicks) return holeClicks.map((p) => ({ p, label: 'merkez', color: BLUE }));
    if (step === 'marks' || step === 'size') return markHandles.map((m) => m.h);
    return [];
  }, [step, clicks, holeClicks, markHandles]);

  const frontOverlay = useCallback(
    (g: CanvasRenderingContext2D, k: number) => {
      if (!front) return;
      if (step === 'front' && maskCanvas) g.drawImage(maskCanvas, 0, 0, front.rgba.width, front.rgba.height);
      if ((step === 'size' || step === 'marks') && marks.length > 1) {
        // centre line through the clicks
        g.lineWidth = 1.5 / k;
        g.strokeStyle = 'rgba(245,184,61,0.6)';
        g.setLineDash([6 / k, 6 / k]);
        g.beginPath();
        marks.filter((p): p is Pt => !!p).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
        g.setLineDash([]);
      }
      if (step === 'size' && solution && body) {
        g.lineWidth = 2.5 / k;
        g.strokeStyle = BLUE;
        g.beginPath();
        body.outline.forEach(([x, y], i) => {
          const p = toImage(solution.frame, [x, y]);
          if (i) g.lineTo(p[0], p[1]);
          else g.moveTo(p[0], p[1]);
        });
        g.closePath();
        g.stroke();
        if (shownHole) {
          const c = toImage(solution.frame, [shownHole.x, shownHole.y]);
          const e = toImage(solution.frame, [shownHole.x + shownHole.radiusCm, shownHole.y]);
          g.strokeStyle = ACCENT;
          g.beginPath();
          g.arc(c[0], c[1], Math.hypot(e[0] - c[0], e[1] - c[1]), 0, Math.PI * 2);
          g.stroke();
        }
      }
    },
    [front, step, maskCanvas, marks, solution, body, shownHole],
  );

  const onFrontDrag = (hi: number, p: Pt) => {
    if (step === 'marks' || step === 'size') {
      const i = markHandles[hi]?.i;
      if (i != null) setMarks((m) => m.map((q, j) => (j === i ? p : q)));
    } else if (step === 'front') setClicks((c) => c.map((q, j) => (j === hi ? { ...q, p } : q)));
  };

  // ---------- preview profile ----------
  const draft = useMemo(() => {
    if (!solution || !body || !shownHole) return null;
    try {
      return assembleProfile({
        name: name.trim() || 'Gitarım',
        totalLengthCm: solution.totalLengthCm,
        scaleLengthCm: solution.scaleLengthCm,
        body,
        soundhole: shownHole,
        saddleX: -solution.scaleFromSaddleCm,
        fretCount,
        nutWidthCm: nutWidth,
        endWidthCm: endWidth,
        headstock: head ?? undefined,
        finish,
      });
    } catch {
      return null;
    }
  }, [solution, body, shownHole, name, fretCount, nutWidth, endWidth, head, finish]);

  // photo textures for the preview (object URLs, revoked when they change)
  const [previewTex, setPreviewTex] = useState<GuitarProfile['textures']>({});
  useEffect(() => {
    if (step !== 'preview') return;
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const t: GuitarProfile['textures'] = {};
      if (frets && neckPhoto) {
        const u = URL.createObjectURL(await canvasToBlob(rgbaToCanvas(warpFretboard(neckPhoto.rgba, frets, lastFret, 1024, 128)), 'image/jpeg'));
        urls.push(u);
        t.fretboard = { url: u, toFret: lastFret };
      }
      if (head) {
        const u = URL.createObjectURL(await canvasToBlob(rgbaToCanvas(head.texture), 'image/jpeg'));
        urls.push(u);
        t.headstock = u;
      }
      if (alive) setPreviewTex(t);
    })().catch(() => {});
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [step, frets, neckPhoto, lastFret, head]);
  const previewProfile = useMemo(() => (draft ? ({ ...draft, id: 'wizard-preview', textures: previewTex } as GuitarProfile) : null), [draft, previewTex]);

  // ---------- save ----------
  const save = () =>
    run('Kaydediliyor…', async () => {
      if (!name.trim()) throw new Error('Gitarına bir ad ver.');
      if (!front || !solution || !body || !draft) throw new Error('Ölçüm tamamlanmadı; boy adımına dön.');
      let saved = await api.create({ ...draft, name: name.trim() });
      setBusy('Dokular yükleniyor…');
      const top = rectifyBodyTop(front.rgba, solution.frame, body.outline, body.bounds, 16);
      saved = await api.putTexture(saved.id, 'bodyTop', await canvasToBlob(rgbaToCanvas(top), 'image/png'));
      if (frets && neckPhoto) {
        const fb = warpFretboard(neckPhoto.rgba, frets, lastFret, 2048, 256);
        saved = await api.putTexture(saved.id, 'fretboard', await canvasToBlob(rgbaToCanvas(fb), 'image/jpeg', 0.9), lastFret);
      }
      if (head) saved = await api.putTexture(saved.id, 'headstock', await canvasToBlob(rgbaToCanvas(head.texture), 'image/jpeg', 0.9));
      if (makeActive) await setActiveGuitar(saved.id, saved);
      onSaved?.(saved);
    });

  // ---------- navigation ----------
  const problem = (k: StepKey): string | null => {
    switch (k) {
      case 'front':
        if (!front) return 'Önce gitarın tamamını gösteren bir ön fotoğraf yükle.';
        if (!seg || seg.area === 0) return 'Gitar algılanamadı. Gövdeye tıkla ya da eşiği düşür.';
        if (share < 0.02) return 'Seçili alan çok küçük. Gitarın üzerine tıkla ya da eşiği düşür.';
        if (share > 0.7) return 'Arka plan da seçilmiş görünüyor. “Arka plan” modunda taşan yere tıkla ya da eşiği yükselt.';
        return null;
      case 'marks':
        if (!landmarks) return `Eksik nokta: ${LANDMARKS[Math.min(marks.length, 4)].label}.`;
        return null;
      case 'size':
        if (sizeError) return sizeError;
        if (!landmarks) return 'Gitarın şekli tanınamadı. Tam modda noktaları elle işaretle.';
        if (!solution || !body) return 'Ölçüm bekleniyor…';
        return null;
      default:
        return null;
    }
  };

  const goTo = (i: number) => {
    setError(null);
    setPicking(null);
    setHoleClicks(null);
    const target = flow[i];
    if (target === 'size' && mode === 'quick' && marks.length === 0) {
      const g = guessMarks();
      if (g) setMarks(g);
    }
    setStepIdx(i);
    setVisited((v) => Math.max(v, i));
  };
  const next = () => {
    const p = problem(step);
    if (p) return setError(p);
    goTo(stepIdx + 1);
  };
  const optionalDone = step === 'fretboard' ? !!frets : step === 'headstock' ? !!head : true;
  const nextLabel = OPTIONAL.includes(step) && !optionalDone ? 'Atla' : 'İleri';

  const markIdx = marks.length;
  const progress = ((stepIdx + 1) / flow.length) * 100;

  return (
    <div className="gs-wizard">
      <div className="gs-progress">
        <div className="gs-progress-head">
          <span className="gs-progress-label">Adım {stepIdx + 1} / {flow.length} · <b>{STEP_LABEL[step]}</b>{OPTIONAL.includes(step) && <span className="gs-optional">isteğe bağlı</span>}</span>
        </div>
        <div className="gs-progress-bar" role="progressbar" aria-valuemin={1} aria-valuemax={flow.length} aria-valuenow={stepIdx + 1} aria-label="İlerleme">
          <span style={{ width: `${progress}%` }} />
        </div>
        <ol className="gs-steps">
          {flow.map((k, i) => (
            <li key={k}>
              <button type="button" className={`gs-step${i === stepIdx ? ' is-current' : ''}${i < stepIdx ? ' is-done' : ''}`} disabled={i > visited} onClick={() => goTo(i)}>
                {STEP_LABEL[k]}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {step === 'front' && (
        <section className="gs-section">
          <p className="gs-lead">
            Gitarın <b>tamamını önden</b>, sade bir zeminin önünde çek; kafa da gövdenin altı da kadrajda olsun. Turuncu alan gitarı kaplamalı.
          </p>
          <div className="gs-row">
            <FileButton label={front ? 'Başka fotoğraf seç' : 'Ön fotoğraf seç'} onFile={pickFront} primary={!front} />
            {front && (
              <>
                <SegmentedControl
                  size="sm"
                  aria-label="Tıklama modu"
                  value={clickKind}
                  onChange={setClickKind}
                  options={[{ value: 'fg', label: 'Gitar' }, { value: 'bg', label: 'Arka plan' }]}
                />
                <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!clicks.length} onClick={() => setClicks((c) => c.slice(0, -1))}>Son tıklamayı geri al</Button>
              </>
            )}
          </div>
          {front && (
            <>
              <p className="gs-hint">
                {clickKind === 'fg' ? 'Eksik kalan gitar parçasına tıkla (örneğin gövdeye ya da sapa).' : 'Gitar dışında turuncu kalan yere tıkla.'}
                {seg && <> · Seçili alan: <span className="num">%{fmt(share * 100, 0)}</span></>}
              </p>
              {seg && (
                <Slider
                  label="Eşik"
                  min={modelMode ? 120 : 5}
                  max={modelMode ? 360 : 250}
                  value={threshold ?? Math.round(seg.threshold)}
                  onChange={(v) => setThreshold(v)}
                  format={(v) => `${v}${threshold == null ? ' (otomatik)' : ''}`}
                />
              )}
              <PhotoCanvas source={front.canvas} overlay={frontOverlay} handles={frontHandles} onPick={onFrontPick} onDrag={onFrontDrag} maxHeight={520} />
            </>
          )}
        </section>
      )}

      {step === 'marks' && front && (
        <section className="gs-section">
          <div className="gs-instruction" aria-live="polite">
            {markIdx < 5 ? (
              <>
                <span className="gs-instruction-n num">{markIdx + 1}/5</span>
                <div>
                  <b>{LANDMARKS[markIdx].label}</b>
                  <p>{LANDMARKS[markIdx].help}</p>
                </div>
              </>
            ) : (
              <div>
                <b>Noktalar tamam.</b>
                <p>Yanlış olanı sürükleyerek düzeltebilirsin.</p>
              </div>
            )}
          </div>
          <div className="gs-row">
            <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!marks.length} onClick={() => setMarks((m) => m.slice(0, -1))}>Son noktayı geri al</Button>
            {markIdx === 2 && <Button size="sm" onClick={() => setMarks((m) => [...m, null])}>Perde noktasını atla</Button>}
            <Button size="sm" variant="ghost" icon={<Wand2 size={14} />} onClick={() => { const g = guessMarks(); if (g) setMarks(g); else setError('Şekilden tahmin edilemedi; noktaları elle işaretle.'); }}>Otomatik yerleştir</Button>
            {marks[2] && (
              <label className="gs-inline">
                Perde no
                <NumberInput value={fretN} onChange={(v) => setFretN(Math.max(1, Math.min(20, Math.round(v) || 12)))} step={1} min={1} max={20} width={64} />
              </label>
            )}
          </div>
          <PhotoCanvas source={front.canvas} overlay={frontOverlay} handles={frontHandles} onPick={onFrontPick} onDrag={onFrontDrag} maxHeight={560} />
        </section>
      )}

      {step === 'size' && front && (
        <section className="gs-section">
          {mode === 'quick' && (
            <p className="gs-lead">Noktalar gitarın şeklinden tahmin edildi. Yanlış görünen varsa sürükle; ölçüler hemen güncellenir.</p>
          )}
          <SegmentedControl
            size="sm"
            aria-label="Hangi ölçüyü biliyorsun?"
            value={sizeKind}
            onChange={(k) => {
              setSizeKind(k);
              setSizeCm(k === 'total' ? 104.1 : 64.8);
            }}
            options={[{ value: 'total', label: 'Toplam boy' }, { value: 'scale', label: 'Tel boyu' }]}
          />
          {sizeKind === 'total' ? (
            <Field label="Toplam boy" hint="Kafanın ucundan gövdenin altına. Emin değilsen 41″ çoğu akustik gitara uyar." error={sizeError}>
              {(id) => (
                <div className="gs-row">
                  <SizePresets totalCm={sizeCm} onTotal={setSizeCm} />
                  <NumberInput id={id} value={Number.isFinite(sizeCm) ? sizeCm : ''} onChange={setSizeCm} unit="cm" />
                </div>
              )}
            </Field>
          ) : (
            <Field label="Tel boyu (scale)" hint="Eşik (nut) ile köprü eşiği arasındaki mesafe; çoğu akustikte 64–65,5 cm." error={sizeError}>
              {(id) => <NumberInput id={id} value={Number.isFinite(sizeCm) ? sizeCm : ''} onChange={setSizeCm} unit="cm" />}
            </Field>
          )}
          <Toggle checked={lefty} onChange={setLefty} label="Solak gitar" description="Kalın E teli fotoğrafta sağda." />
          {solution && body && (
            <dl className="gs-stats">
              <div><dt>Toplam</dt><dd className="num">{fmt(solution.totalLengthCm)} cm</dd></div>
              <div><dt>Tel boyu</dt><dd className="num">{fmt(solution.scaleLengthCm)} cm</dd></div>
              <div><dt>Gövde</dt><dd className="num">{fmt(body.lengthCm)} cm</dd></div>
              <div><dt>Üst / bel / alt</dt><dd className="num">{fmt(body.bouts.upperCm, 0)} / {fmt(body.bouts.waistCm, 0)} / {fmt(body.bouts.lowerCm, 0)} cm</dd></div>
              {shownHole && <div><dt>Ses deliği</dt><dd className="num">Ø {fmt(shownHole.radiusCm * 2)} cm</dd></div>}
            </dl>
          )}
          {solution?.warnings.map((w) => <p key={w} className="gs-warn">{w}</p>)}
          {hole && 'confident' in hole && !hole.confident && !manualHole && <p className="gs-warn">Ses deliğinden emin değilim; gerekirse elle işaretle.</p>}
          <div className="gs-row">
            {body && (
              <Button size="sm" variant="ghost" onClick={() => setHoleClicks(holeClicks ? null : [])}>
                {holeClicks ? (holeClicks.length ? 'Şimdi ses deliğinin kenarına tıkla' : 'Ses deliğinin merkezine tıkla') : 'Ses deliğini elle işaretle'}
              </Button>
            )}
            {manualHole && <Button size="sm" variant="ghost" onClick={() => setManualHole(null)}>Otomatik ses deliği</Button>}
          </div>
          <PhotoCanvas source={front.canvas} overlay={frontOverlay} handles={frontHandles} onPick={onFrontPick} onDrag={onFrontDrag} maxHeight={520} />
        </section>
      )}

      {step === 'fretboard' && (
        <section className="gs-section">
          <p className="gs-lead">
            Klavyeyi yakından, üstten ve iyi ışıkta çek (yoksa ön fotoğraf kullanılır). Dört köşeyi işaretle, sonra perdeleri bul. Kırmızı çizgiler
            tahmindir; uçlarını sürükleyerek düzelt. Atlarsan düz renkli bir klavye kullanılır.
          </p>
          <div className="gs-row">
            <FileButton label={neck ? 'Başka fotoğraf seç' : 'Klavye fotoğrafı seç'} onFile={pickNeck} />
            <label className="gs-inline">
              İşaretlenen son perde
              <NumberInput value={lastFret} onChange={(v) => setLastFret(Math.round(v) || 12)} step={1} min={3} max={24} width={64} />
            </label>
            <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!fbClicks.length || !!frets} onClick={() => setFbClicks((c) => c.slice(0, -1))}>Geri al</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFbClicks([]); setFrets(null); setFbPreview(null); }}>Sıfırla</Button>
            <Button size="sm" variant="primary" onClick={detect} disabled={fbClicks.length < 4}>Perdeleri bul</Button>
          </div>
          {!frets && fbClicks.length < 4 && (
            <div className="gs-instruction"><span className="gs-instruction-n num">{fbClicks.length + 1}/4</span><div><b>{FB_POINTS[fbClicks.length]}</b></div></div>
          )}
          {neckPhoto && (
            <PhotoCanvas
              source={neckPhoto.canvas}
              overlay={(g, k) => {
                if (!frets) return;
                g.lineWidth = 2 / k;
                for (const l of frets) {
                  g.strokeStyle = l.confidence > 0.3 ? 'rgba(106,168,255,0.9)' : 'rgba(242,102,107,0.95)';
                  g.beginPath();
                  g.moveTo(l.low[0], l.low[1]);
                  g.lineTo(l.high[0], l.high[1]);
                  g.stroke();
                }
              }}
              handles={frets ? frets.flatMap((l) => [{ p: l.low, label: String(l.n), color: l.confidence > 0.3 ? BLUE : '#f2666b' }, { p: l.high, color: l.confidence > 0.3 ? BLUE : '#f2666b' }]) : fbClicks.map((p, i) => ({ p, label: String(i + 1), color: ACCENT }))}
              onPick={(p) => !frets && fbClicks.length < 4 && setFbClicks([...fbClicks, p])}
              onDrag={(i, p) => {
                if (frets) setFrets(frets.map((l, j) => (j === i >> 1 ? { ...l, confidence: 1, ...(i % 2 ? { high: p } : { low: p }) } : l)));
                else setFbClicks(fbClicks.map((q, j) => (j === i ? p : q)));
              }}
              maxHeight={480}
            />
          )}
          {fbPreview && <PhotoCanvas source={fbPreview} maxHeight={90} cursor="default" />}
          <div className="gs-row">
            <label className="gs-inline">Eşikte genişlik <NumberInput value={nutWidth} onChange={setNutWidth} step={0.05} unit="cm" /></label>
            <label className="gs-inline">Son perdede <NumberInput value={endWidth} onChange={setEndWidth} step={0.05} unit="cm" /></label>
            <label className="gs-inline">Perde sayısı <NumberInput value={fretCount} onChange={(v) => setFretCount(Math.max(12, Math.min(24, Math.round(v) || 20)))} step={1} width={64} /></label>
          </div>
        </section>
      )}

      {step === 'headstock' && (
        <section className="gs-section">
          <p className="gs-lead">
            Kafanın ön yüzünü yakından çek (ya da mevcut fotoğrafı kullan). Her kenarı <b>eşikten başlayarak</b> uca doğru birkaç noktayla, sonra burgu
            millerini işaretle. Atlarsan tipik bir 3+3 kafa kullanılır.
          </p>
          <div className="gs-row">
            <FileButton label={headPhotoFile ? 'Başka fotoğraf seç' : 'Kafa fotoğrafı seç'} onFile={pickHead} />
            <SegmentedControl
              size="sm"
              aria-label="Ne işaretliyorsun?"
              value={headMode}
              onChange={setHeadMode}
              options={(Object.keys(HEAD_LABEL) as HeadMode[]).map((m) => ({ value: m, label: `${HEAD_LABEL[m]} (${headPts[m].length})` }))}
            />
            <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!headPts[headMode].length} onClick={() => setHeadPts((o) => ({ ...o, [headMode]: o[headMode].slice(0, -1) }))}>Geri al</Button>
            <Button size="sm" variant="primary" onClick={buildHead} disabled={headPts.low.length < 2 || headPts.high.length < 2}>Düzleştir</Button>
          </div>
          {headPhoto && <PhotoCanvas source={headPhoto.canvas} overlay={(g, k) => drawHeadPts(g, k, headPts)} onPick={(p) => setHeadPts((o) => ({ ...o, [headMode]: [...o[headMode], p] }))} maxHeight={480} />}
          {head && headPreview && (
            <div className="gs-row">
              <PhotoCanvas source={headPreview} maxHeight={200} cursor="default" />
              <p className="gs-hint">Uzunluk <span className="num">{fmt(head.lengthCm)}</span> cm · burgular {head.tunersLowE.length}+{head.tunersHighE.length}</p>
            </div>
          )}
        </section>
      )}

      {step === 'colors' && front && (
        <section className="gs-section">
          <p className="gs-lead">Kapak rengi fotoğraftan alındı. Bir rengi değiştirmek için kutusuna tıkla ya da “Fotoğraftan” deyip fotoğrafa tıkla.</p>
          <FinishEditor
            finish={finish}
            onChange={(f) => {
              if (f.top !== finish.top) setTopFromPhoto(false);
              setFinish(f);
            }}
            keys={['top', 'sides', 'neck', 'fretboard', 'headstock', 'binding', 'pickguard']}
            pickFromPhoto={setPicking}
            picking={picking}
          />
          <PhotoCanvas source={front.canvas} onPick={onFrontPick} cursor={picking ? 'copy' : 'default'} maxHeight={360} />
        </section>
      )}

      {step === 'preview' && (
        <section className="gs-section">
          <div className="gs-preview">
            {previewProfile ? (
              <StageGuitar profile={previewProfile} className="gs-preview-canvas" notes={[]} beatId={0} beatProgress={0} view="player" cameraMode="overview" />
            ) : (
              <div className="gs-preview-empty">{problem('size') ?? 'Önizleme hazırlanıyor…'}</div>
            )}
          </div>
          <Field label="Ad" error={name.trim() ? null : 'Gitarına bir ad ver.'}>
            {(id) => <input id={id} className="gs-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <ul className="gs-summary">
            <li>Ölçüler: {solution ? `${fmt(solution.totalLengthCm)} cm, tel boyu ${fmt(solution.scaleLengthCm)} cm` : 'eksik'}</li>
            <li>Gövde konturu ve kapak fotoğrafı: {body ? 'hazır' : 'eksik'}</li>
            <li>Klavye: {frets ? `fotoğraftan (eşik → ${lastFret}. perde)` : 'düz renk'}</li>
            <li>Kafa: {head ? 'fotoğraftan' : 'tipik 3+3 şekil'}</li>
          </ul>
          <MakeActiveToggle checked={makeActive} onChange={setMakeActive} />
        </section>
      )}

      {busy && <p className="gs-hint" aria-live="polite">{busy}</p>}
      {error && <p className="gs-error" role="alert">{error}</p>}

      <div className="gs-footer">
        <div className="gs-row">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>}
          {stepIdx > 0 && <Button onClick={() => goTo(stepIdx - 1)}>Geri</Button>}
        </div>
        {step === 'preview' ? (
          <Button variant="primary" onClick={save} disabled={!draft || !!busy || !name.trim()}>Gitarı kaydet</Button>
        ) : (
          <Button variant={nextLabel === 'Atla' ? 'secondary' : 'primary'} disabled={!!busy} onClick={next}>{nextLabel}</Button>
        )}
      </div>
    </div>
  );
}

function drawHeadPts(g: CanvasRenderingContext2D, k: number, pts: Record<HeadMode, Pt[]>) {
  const colors: Record<HeadMode, string> = { low: BLUE, high: '#4cc38a', tunersLow: ACCENT, tunersHigh: ACCENT };
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

function FileButton({ label, onFile, primary }: { label: string; onFile: (f: File) => void; primary?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" variant={primary ? 'primary' : 'secondary'} icon={<ImagePlus size={14} />} onClick={() => ref.current?.click()}>{label}</Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </>
  );
}
