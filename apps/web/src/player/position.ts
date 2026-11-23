import { useSyncExternalStore } from 'react';

/** Playback position. alphaTab reports it ~20 times a second while playing. */
export interface Position {
  timeMs: number;
  endMs: number;
  /** MIDI ticks (repeats unrolled) and the song's end tick. */
  tick: number;
  endTick: number;
  /** Fraction (0..1) of the current beat that has elapsed. */
  beatProgress: number;
}

export interface PositionStore {
  get(): Position;
  set(p: Position): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Keeps the fast-changing position out of React state, so a position event does not re-render
 * the whole player: only components that read it (with `usePosition`) update.
 */
export function createPositionStore(): PositionStore {
  let value: Position = { timeMs: 0, endMs: 0, tick: 0, endTick: 0, beatProgress: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(p) {
      value = p;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/**
 * Reads a value derived from the position; the component re-renders only when that value changes.
 * `select` must return a primitive (number, string, boolean), e.g. whole seconds rather than ms.
 */
export function usePosition<T extends number | string | boolean | null>(store: PositionStore, select: (p: Position) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
