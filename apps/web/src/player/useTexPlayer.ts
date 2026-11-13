import { useCallback, useEffect, useRef, useState } from 'react';
import { AlphaTabApi, synth } from '@coderline/alphatab';

/**
 * Plays short alphaTex snippets (a strummed chord, a scale run) through alphaTab's synthesizer.
 * The score is rendered into an off-screen element; nothing of it is shown. The first call loads
 * the sound font, later calls start at once.
 */
export function useTexPlayer() {
  const apiRef = useRef<AlphaTabApi | null>(null);
  const pending = useRef(false);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:160px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(el);
    const api = new AlphaTabApi(el, {
      core: { fontDirectory: '/font/' },
      display: { layoutMode: 'horizontal', staveProfile: 'tab' },
      player: { playerMode: 'EnabledSynthesizer', soundFont: '/soundfont/sonivox.sf2', enableCursor: false, enableUserInteraction: false },
    } as never);
    apiRef.current = api;
    const start = () => {
      if (pending.current && readyRef.current) {
        pending.current = false;
        api.stop();
        api.play();
      }
    };
    api.playerReady.on(() => {
      readyRef.current = true;
      setReady(true);
      start();
    });
    api.midiLoaded.on(start);
    api.playerStateChanged.on((e) => setPlaying(e.state === synth.PlayerState.Playing));
    api.playerFinished.on(() => setPlaying(false));
    return () => {
      api.destroy();
      el.remove();
      apiRef.current = null;
    };
  }, []);

  /** Loads the snippet and plays it from the start (stops anything still sounding). */
  const play = useCallback((tex: string, speed = 1) => {
    const api = apiRef.current;
    if (!api) return;
    api.stop();
    api.playbackSpeed = speed;
    pending.current = true;
    api.tex(tex);
  }, []);

  const stop = useCallback(() => {
    pending.current = false;
    apiRef.current?.stop();
  }, []);

  return { play, stop, ready, playing };
}
