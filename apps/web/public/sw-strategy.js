/* Guitar3D service worker: which cache strategy a request gets. Classic script (importScripts) so
 * it also runs in browsers without module workers; tested in src/pwa/sw.test.ts. */
(function (g) {
  var VERSION = 'g3d-v1';
  var CACHES = { shell: VERSION + '-shell', assets: VERSION + '-assets', media: VERSION + '-media', api: VERSION + '-api', fonts: VERSION + '-fonts' };

  /** Static files worth having offline from the first visit (hashed bundle files are added from precache-manifest.json). */
  var PRECACHE = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/soundfont/sonivox.sf2',
    '/font/Bravura.woff2',
    '/font/Bravura.woff',
    '/guitar/veston.profile.json',
    '/guitar/fretboard.jpg',
    '/guitar/fretboard-inlay.png',
    '/guitar/headstock.jpg',
    '/guitar/headstock-face.jpg',
    '/guitar/headstock.json',
    '/guitar/rosette.png',
  ];

  /**
   * 'network-first' (pages, API reads), 'cache-first' (hashed bundles, sound font, fonts, guitar
   * textures, icons), 'stale' (Google Fonts CSS), or null (let the browser handle it).
   */
  function strategyFor(method, href, origin, mode) {
    if (method !== 'GET') return null;
    var u = new URL(href);
    if (u.origin === 'https://fonts.googleapis.com') return { kind: 'stale', cache: CACHES.fonts };
    if (u.origin === 'https://fonts.gstatic.com') return { kind: 'cache-first', cache: CACHES.fonts };
    if (u.origin !== origin) return null;
    var p = u.pathname;
    if (mode === 'navigate') return { kind: 'network-first', cache: CACHES.shell, fallback: '/index.html' };
    // backups are large and must always be fresh: never cached
    if (p.indexOf('/api/backup') === 0) return null;
    if (p.indexOf('/api/') === 0) {
      // uploads and per-user files change: always try the network, keep the last answer for offline
      return { kind: 'network-first', cache: CACHES.api };
    }
    if (p.indexOf('/assets/') === 0) return { kind: 'cache-first', cache: CACHES.assets };
    if (/^\/(soundfont|font|guitar|icons)\//.test(p)) return { kind: 'cache-first', cache: CACHES.media };
    if (p === '/manifest.webmanifest' || p === '/index.html' || p === '/') return { kind: 'network-first', cache: CACHES.shell };
    if (/\.(js|css|wasm|woff2?|png|jpg|svg|json|sf2|sf3)$/.test(p)) return { kind: 'cache-first', cache: CACHES.assets };
    return null;
  }

  g.G3D_SW = { VERSION: VERSION, CACHES: CACHES, PRECACHE: PRECACHE, strategyFor: strategyFor };
})(typeof self !== 'undefined' ? self : globalThis);
