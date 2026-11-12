import { useEffect, useRef, useState } from 'react';
import type { Pt } from './lib/image';

export interface Handle {
  p: Pt;
  label?: string;
  color?: string;
}

export interface PhotoCanvasProps {
  /** Photo to show (canvas, image or bitmap) with its pixel size. */
  source: CanvasImageSource & { width: number; height: number };
  /** Extra drawing in image pixel coordinates (the context is already scaled). `k` = screen px per image px. */
  overlay?: (ctx: CanvasRenderingContext2D, k: number) => void;
  handles?: Handle[];
  /** Click on the photo (not on a handle), image px. */
  onPick?: (p: Pt) => void;
  /** Drag of handle i to p (image px). */
  onDrag?: (i: number, p: Pt) => void;
  maxHeight?: number;
  cursor?: string;
}

/** Photo with an overlay, clickable points and draggable handles. Fits the container width. */
export function PhotoCanvas({ source, overlay, handles = [], onPick, onDrag, maxHeight = 640, cursor = 'crosshair' }: PhotoCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [boxW, setBoxW] = useState(600);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = Math.min(boxW / source.width, maxHeight / source.height);
  const w = Math.max(1, Math.round(source.width * k));
  const h = Math.max(1, Math.round(source.height * k));

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.clearRect(0, 0, source.width, source.height);
    g.drawImage(source, 0, 0, source.width, source.height);
    overlay?.(g, k);
    handles.forEach((hd, i) => {
      g.beginPath();
      g.arc(hd.p[0], hd.p[1], 6 / k, 0, Math.PI * 2);
      g.fillStyle = hd.color ?? '#4c8dff';
      g.fill();
      g.lineWidth = 2 / k;
      g.strokeStyle = '#fff';
      g.stroke();
      if (hd.label ?? i + 1) {
        g.font = `${12 / k}px system-ui, sans-serif`;
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = 3 / k;
        const t = String(hd.label ?? i + 1);
        g.strokeText(t, hd.p[0] + 9 / k, hd.p[1] - 9 / k);
        g.fillText(t, hd.p[0] + 9 / k, hd.p[1] - 9 / k);
      }
    });
  }, [source, overlay, handles, k, w, h]);

  const toImg = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * source.width, ((e.clientY - r.top) / r.height) * source.height];
  };

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      <canvas
        ref={canvas}
        style={{ width: w, height: h, display: 'block', cursor, touchAction: 'none', borderRadius: 'var(--gs-radius, 6px)' }}
        onPointerDown={(e) => {
          const p = toImg(e);
          const hit = handles.findIndex((hd) => Math.hypot(hd.p[0] - p[0], hd.p[1] - p[1]) * k < 12);
          if (hit >= 0 && onDrag) {
            drag.current = hit;
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          } else onPick?.(p);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) onDrag?.(drag.current, toImg(e));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
    </div>
  );
}
