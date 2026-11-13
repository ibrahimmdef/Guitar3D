import { useEffect, useRef, useState } from 'react';
import { initialOnset, onsetStep, type OnsetOptions } from './onset';
import { rms } from './pitch';
import type { MicStatus } from './useMicPitch';

/** Frames per second of the level envelope (10 ms frames give ±10 ms timing). */
const FPS = 100;

/**
 * Microphone attack detector. While `enabled`, calls `onOnset` with the performance.now() time
 * (seconds) of every detected pick or strum attack. `latencyMs` is subtracted (input latency).
 */
export function useMicOnsets(enabled: boolean, onOnset: (perfSec: number, level: number) => void, opts: OnsetOptions & { latencyMs?: number } = {}): MicStatus {
  const [status, setStatus] = useState<MicStatus>('off');
  const cb = useRef(onOnset);
  cb.current = onOnset;
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AC) {
      setStatus('unsupported');
      return;
    }
    let alive = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer = 0;
    setStatus('asking');
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let st = initialOnset();
        timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const level = rms(buf);
          const now = performance.now() / 1000;
          const r = onsetStep(st, level, now, o.current);
          st = r.state;
          if (r.onset) cb.current(now - (o.current.latencyMs ?? 0) / 1000 - analyser.fftSize / ctx!.sampleRate / 2, level);
        }, 1000 / FPS);
        setStatus('on');
      })
      .catch((e: DOMException) => {
        if (alive) setStatus(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'error');
      });
    return () => {
      alive = false;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [enabled]);

  return status;
}

export const MIC_STATUS_LABEL: Record<MicStatus, string> = {
  off: 'Mikrofon kapalı',
  asking: 'Mikrofon izni bekleniyor…',
  on: 'Mikrofon dinliyor',
  denied: 'Mikrofon izni verilmedi',
  unsupported: 'Tarayıcı mikrofonu desteklemiyor',
  error: 'Mikrofon açılamadı',
};
