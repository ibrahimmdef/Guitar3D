/**
 * Guitar3D desktop: the built web app (apps/web/dist) in an Electron window.
 *
 * The app keeps all its data in the browser storage (IndexedDB, localStorage), which is tied to the
 * page's origin. So the files are served from a small local HTTP server on a fixed port: the origin
 * (http://127.0.0.1:47831) stays the same between runs and the data survives restarts.
 *
 * Diagnostics: crashes, hangs, load failures and page errors are written to
 * ~/.config/Guitar3D/guitar3d.log (crash dumps in ~/.config/Guitar3D/Crashpad).
 */
import { app, BrowserWindow, crashReporter, screen, session, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fitZoom, ZOOM_STEP } from './zoom';

const PORT = 47831;
const webDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../../web/dist');

// ---- diagnostics ------------------------------------------------------------------------------

crashReporter.start({ uploadToServer: false });
const logFile = () => path.join(app.getPath('userData'), 'guitar3d.log');

function log(...parts: unknown[]) {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(logFile(), line);
  } catch {
    /* logging must never break the app */
  }
}

process.on('uncaughtException', (e) => log('main: uncaught exception', e.stack ?? String(e)));
process.on('unhandledRejection', (e) => log('main: unhandled rejection', e instanceof Error ? e.stack ?? e.message : String(e)));
app.on('child-process-gone', (_e, d) => log('child process gone', d));

/** Keeps the log small: the last ~200 KB. */
function trimLog() {
  try {
    const s = fs.statSync(logFile());
    if (s.size > 400_000) fs.writeFileSync(logFile(), fs.readFileSync(logFile()).subarray(-200_000));
  } catch {
    /* no log yet */
  }
}

// ---- static file server -----------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.sf2': 'application/octet-stream',
  '.sf3': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(req: http.IncomingMessage, res: http.ServerResponse) {
  let rel: string;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.join(webDir, path.normalize(rel));
  if (!file.startsWith(webDir)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // A file that isn't there is a 404; anything else (a page route) gets the app.
    if (path.extname(rel)) {
      log('http 404', rel);
      res.writeHead(404).end();
      return;
    }
    file = path.join(webDir, 'index.html');
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'max-age=3600' });
  fs.createReadStream(file).pipe(res);
}

// ---- window -----------------------------------------------------------------------------------

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized?: boolean;
  userZoom?: number;
}

function readWindowState(file: string): WindowState | null {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as WindowState;
    // Only reuse it when it still lies on a connected screen.
    const visible = screen.getAllDisplays().some((d) => s.x < d.bounds.x + d.bounds.width - 50 && s.x + s.width > d.bounds.x + 50 && s.y >= d.bounds.y - 10 && s.y < d.bounds.y + d.bounds.height - 50);
    return visible && s.width >= 960 && s.height >= 600 ? s : null;
  } catch {
    return null;
  }
}

function watch(win: BrowserWindow) {
  const wc = win.webContents;
  wc.on('render-process-gone', (_e, d) => {
    log('PAGE CRASHED', d, 'url', wc.getURL());
    // Don't leave a blank window: reload the app (data is safe in IndexedDB).
    if (d.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && void win.loadURL(`http://127.0.0.1:${PORT}/#/library`), 500);
  });
  wc.on('unresponsive', () => log('PAGE NOT RESPONDING', wc.getURL()));
  wc.on('responsive', () => log('page responsive again'));
  wc.on('did-fail-load', (_e, code, desc, url) => log('load failed', code, desc, url));
  wc.on('console-message', (e) => {
    const m = e as unknown as { level: string; message: string; sourceId?: string; lineNumber?: number };
    if (m.level === 'error' || m.level === 'warning') log(`page ${m.level}:`, m.message, m.sourceId ? `${m.sourceId}:${m.lineNumber}` : '');
  });
  wc.on('did-navigate-in-page', (_e, url) => log('route', url.replace(/^.*#/, '#')));
}

async function start() {
  trimLog();
  log(`start v${app.getVersion()} electron ${process.versions.electron} ${process.platform} session=${process.env.XDG_SESSION_TYPE ?? '?'} desktop=${process.env.XDG_CURRENT_DESKTOP ?? '?'} args=${JSON.stringify(process.argv.slice(1))}`);

  await new Promise<void>((resolve, reject) => {
    const s = http.createServer(serve).listen(PORT, '127.0.0.1', () => resolve());
    s.on('error', reject);
  });

  // Microphone (tuner, listen mode, coach) and clipboard images (tab screenshots).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'clipboard-read'].includes(permission));

  // Window: remembered size / position, otherwise 85 % of the screen it opens on.
  const statePath = path.join(app.getPath('userData'), 'window.json');
  const saved = readWindowState(statePath);
  const work = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: saved?.width ?? Math.round(work.width * 0.85),
    height: saved?.height ?? Math.round(work.height * 0.85),
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    title: 'Guitar3D',
    show: false,
  });
  watch(win);
  if (saved?.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The UI is designed at 1440×860: zoom the page with the window so it stays in proportion.
  // Ctrl + / Ctrl − / Ctrl 0 adjust it on top.
  let userZoom = saved?.userZoom ?? 1;
  const fit = () => {
    const [w, h] = win.getContentSize();
    win.webContents.setZoomFactor(fitZoom(w, h, userZoom));
  };
  win.on('resize', fit);
  win.webContents.on('did-finish-load', fit);
  win.webContents.once('did-finish-load', () => {
    // read once the GPU process is up (earlier it reports everything as disabled)
    void app.getGPUInfo('basic').then((i) => {
      const g = (i as { gpuDevice?: { vendorId: number; deviceId: number; driverVendor?: string }[] }).gpuDevice?.[0];
      log('gpu', g ?? 'none', 'webgl', app.getGPUFeatureStatus().webgl, 'compositing', app.getGPUFeatureStatus().gpu_compositing);
    });
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    if (input.key === '+' || input.key === '=') userZoom = Math.min(2, userZoom + ZOOM_STEP);
    else if (input.key === '-') userZoom = Math.max(0.6, userZoom - ZOOM_STEP);
    else if (input.key === '0') userZoom = 1;
    else return;
    e.preventDefault();
    fit();
  });
  win.on('close', () => {
    try {
      fs.writeFileSync(statePath, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized(), userZoom }));
    } catch {
      /* not critical */
    }
    log('window closed');
  });

  await win.loadURL(`http://127.0.0.1:${PORT}/`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus());
  app.whenReady().then(start).catch((e) => {
    log('start failed', e instanceof Error ? e.stack ?? e.message : String(e));
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
