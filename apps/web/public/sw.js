/* Guitar3D service worker: offline app shell, sound font, fonts, guitar textures, built-in lessons
 * (they ship inside the JS bundles) and the last answers of the tab / guitar API. Hand-written. */
importScripts('/sw-strategy.js');
var SW = self.G3D_SW;

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var shell = await caches.open(SW.CACHES.shell);
    var media = await caches.open(SW.CACHES.media);
    var assets = await caches.open(SW.CACHES.assets);
    var list = [];
    try {
      var r = await fetch('/precache-manifest.json', { cache: 'no-store' });
      if (r.ok) list = await r.json();
    } catch (e) { /* dev server: no manifest */ }
    var put = function (cache, url) {
      return fetch(url, { cache: 'reload' }).then(function (res) { if (res.ok) return cache.put(url, res); }).catch(function () {});
    };
    await Promise.all(
      SW.PRECACHE.map(function (u) { return put(/^\/(soundfont|font|guitar|icons)\//.test(u) ? media : shell, u); })
        .concat(list.map(function (u) { return put(assets, u); })),
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keep = Object.values(SW.CACHES);
    var names = await caches.keys();
    await Promise.all(names.filter(function (n) { return n.indexOf('g3d-') === 0 && keep.indexOf(n) < 0; }).map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
  })());
});

async function networkFirst(req, s) {
  var cache = await caches.open(s.cache);
  try {
    var res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    var hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (s.fallback) {
      var shell = await caches.open(SW.CACHES.shell);
      var fb = (await shell.match(s.fallback)) || (await shell.match('/'));
      if (fb) return fb;
    }
    throw e;
  }
}

async function cacheFirst(req, s) {
  var cache = await caches.open(s.cache);
  var hit = await cache.match(req);
  if (hit) return hit;
  var res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function stale(req, s) {
  var cache = await caches.open(s.cache);
  var hit = await cache.match(req);
  var net = fetch(req).then(function (res) { if (res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
  return hit || net;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  // range requests (audio seeking) go straight to the network
  if (req.headers.has('range')) return;
  var s = SW.strategyFor(req.method, req.url, self.location.origin, req.mode);
  if (!s) return;
  var run = s.kind === 'network-first' ? networkFirst : s.kind === 'stale' ? stale : cacheFirst;
  event.respondWith(run(req, s));
});
