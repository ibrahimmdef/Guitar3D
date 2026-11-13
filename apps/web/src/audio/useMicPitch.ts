import { useEffect, useRef, useState } from 'react';
import { detectPitch, type Pitch } from './pitch';

export type MicStatus = 'off' | 'asking' | 'on' | 'denied' | 'unsupported' | 'error';

/** Detector frames per second; YIN on 2048 samples is cheap enough for this on any laptop. */
const FPS = 25;
const MIN_CLARITY = 0.8;

/**
 * Microphone pitch stream. While `enabled`, asks for the microphone and calls `onFrame` about
 * 25×/s with the detected pitch (or null). Frames go through a ref, so they never re-render.
 */
export function useMicPitch(enabled: boolean, onFrame: (p: Pitch | null) => void): MicStatus {
  const [status, setStatus] = useState<MicStatus>('off');
  const cb = useRef(onFrame);
  cb.current = onFrame;

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
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const sr = ctx.sampleRate;
        timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const p = detectPitch(buf, sr);
          cb.current(p && p.clarity >= MIN_CLARITY ? p : null);
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
