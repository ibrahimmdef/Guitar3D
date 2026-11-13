import { useEffect, useSyncExternalStore } from 'react';
import type { GuitarProfile } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID } from '@guitar3d/shared';
import { preloadProfile } from '../fretboard/profile';
import { guitarsApi } from './api';

/**
 * App-wide "which guitar is on stage" store. The id lives on the server (/api/settings) with a
 * localStorage copy so it survives a missing server; the profile is cached per id so switching back
 * and forth is instant. Every StageGuitar subscribes, so a switch shows up everywhere at once.
 */
export interface ActiveGuitarState {
  id: string;
  profile: GuitarProfile | null;
  loading: boolean;
  error: string | null;
}

const KEY = 'guitar3d.activeGuitarId';
const listeners = new Set<() => void>();
const cache = new Map<string, GuitarProfile>();
let api = guitarsApi;
let state: ActiveGuitarState = { id: readLocal() ?? BUILTIN_GUITAR_ID, profile: null, loading: false, error: null };
let started = false;
let ticket = 0;

function readLocal(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeLocal(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: the server copy still works */
  }
}

function set(next: Partial<ActiveGuitarState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function fetchProfile(id: string, fresh = false): Promise<GuitarProfile> {
  if (!fresh && cache.has(id)) return cache.get(id)!;
  const p = await api.loadProfile(id);
  try {
    preloadProfile(p);
  } catch {
    /* preloading is an optimisation only */
  }
  cache.set(id, p);
  return p;
}

/** Shows `id` (falls back to the built-in guitar if it cannot be loaded). */
async function show(id: string, fresh = false) {
  const t = ++ticket;
  set({ id, loading: true, error: null, ...(cache.has(id) && !fresh ? { profile: cache.get(id)! } : {}) });
  try {
    const p = await fetchProfile(id, fresh);
    if (t === ticket) set({ profile: p, loading: false });
  } catch (e) {
    if (t !== ticket) return;
    if (id !== BUILTIN_GUITAR_ID) {
      writeLocal(BUILTIN_GUITAR_ID);
      return show(BUILTIN_GUITAR_ID);
    }
    set({ loading: false, error: (e as Error).message });
  }
}

/** First subscriber: ask the server which guitar is active (localStorage id meanwhile). */
function start() {
  if (started) return;
  started = true;
  const local = state.id;
  void show(local);
  api
    .getSettings()
    .then(({ activeGuitarId }) => {
      if (activeGuitarId && activeGuitarId !== state.id) {
        writeLocal(activeGuitarId);
        void show(activeGuitarId);
      }
    })
    .catch(() => {
      /* no server: keep the local choice */
    });
}

/** Makes `id` the active guitar everywhere; persists on the server with a localStorage fallback. */
export async function setActiveGuitar(id: string, profile?: GuitarProfile) {
  started = true;
  if (profile) cache.set(id, profile);
  writeLocal(id);
  const shown = show(id);
  try {
    await api.setActiveGuitar(id);
  } catch {
    /* server unavailable (or offline-only guitar): localStorage keeps the choice */
  }
  await shown;
}

/** Drops cached data for `id` (after rename/edit/delete) and reloads it when it is on stage. */
export function invalidateGuitar(id: string, deleted = false) {
  cache.delete(id);
  if (state.id !== id) return;
  if (deleted) void setActiveGuitar(BUILTIN_GUITAR_ID);
  else void show(id, true);
}

export const getActiveGuitar = () => state;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Active guitar id + profile; re-renders whenever the active guitar changes anywhere in the app. */
export function useActiveGuitar() {
  const s = useSyncExternalStore(subscribe, getActiveGuitar, getActiveGuitar);
  useEffect(start, []);
  return { ...s, setActive: setActiveGuitar, invalidate: invalidateGuitar };
}

/** Test hook: swap the API and reset the store. */
export function __resetActiveGuitar(next = guitarsApi) {
  api = next;
  cache.clear();
  started = false;
  ticket++;
  state = { id: readLocal() ?? BUILTIN_GUITAR_ID, profile: null, loading: false, error: null };
}
