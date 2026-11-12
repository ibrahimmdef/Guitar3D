import { useEffect, useState } from 'react';

/**
 * Tiny hash router:
 *   #/library · #/play/<tabId> · #/lesson/<lessonId> · #/guitar · #/settings
 * `#/play/demo` is kept as an alias of the warm-up lesson.
 */
export type PlaySource = { kind: 'tab' | 'lesson'; id: string };

export type Route =
  | { name: 'library' }
  | { name: 'player'; source: PlaySource }
  | { name: 'guitar' }
  | { name: 'settings' };

export const DEMO_LESSON_ID = 'warmup';

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const id = parts[1] ? safeDecode(parts[1]) : '';
  switch (parts[0]) {
    case 'play':
      return !id || id === 'demo' ? { name: 'player', source: { kind: 'lesson', id: DEMO_LESSON_ID } } : { name: 'player', source: { kind: 'tab', id } };
    case 'lesson':
      return { name: 'player', source: { kind: 'lesson', id: id || DEMO_LESSON_ID } };
    case 'guitar':
      return { name: 'guitar' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'library' };
  }
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function routeHref(r: Route): string {
  switch (r.name) {
    case 'player':
      return `#/${r.source.kind === 'lesson' ? 'lesson' : 'play'}/${encodeURIComponent(r.source.id)}`;
    case 'guitar':
      return '#/guitar';
    case 'settings':
      return '#/settings';
    default:
      return '#/library';
  }
}

export const playTab = (id: string): Route => ({ name: 'player', source: { kind: 'tab', id } });
export const playLesson = (id: string): Route => ({ name: 'player', source: { kind: 'lesson', id } });

export function navigate(r: Route) {
  window.location.hash = routeHref(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
