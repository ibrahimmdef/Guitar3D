import { useEffect, useState } from 'react';

/** Tiny hash router: #/library, #/play/<tabId|demo>, #/guitar, #/settings. */
export type Route =
  | { name: 'library' }
  | { name: 'player'; tabId: string | null }
  | { name: 'guitar' }
  | { name: 'settings' };

export const DEMO_ID = 'demo';

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'play':
      return { name: 'player', tabId: !parts[1] || parts[1] === DEMO_ID ? null : decodeURIComponent(parts[1]) };
    case 'guitar':
      return { name: 'guitar' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'library' };
  }
}

export function routeHref(r: Route): string {
  switch (r.name) {
    case 'player':
      return `#/play/${r.tabId ? encodeURIComponent(r.tabId) : DEMO_ID}`;
    case 'guitar':
      return '#/guitar';
    case 'settings':
      return '#/settings';
    default:
      return '#/library';
  }
}

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
