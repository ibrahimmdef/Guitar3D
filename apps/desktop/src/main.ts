/**
 * Guitar3D desktop: the Express API (apps/server) and the built web app (apps/web/dist) run inside
 * Electron on a fixed local port, so localStorage (settings, progress) survives restarts.
 * Data (tabs, guitars, sessions) lives in the OS user-data folder.
 */
import { app, BrowserWindow, screen, session, shell } from 'electron';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { GuitarProfile } from '@guitar3d/shared';
import { createApp } from '../../server/src/app';
import { Store } from '../../server/src/store';
import { fitZoom, ZOOM_STEP } from './zoom';

const PORT = 47831;
const resources = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const webDir = app.isPackaged ? path.join(resources, 'web') : path.resolve(__dirname, '../../web/dist');
const seedDir = path.join(resources, 'seed');

/** First run: add the guitars shipped with the app (seed/guitars.json) to "Gitarlarım". */
function seedGuitars(store: Store, dataDir: string) {
  const marker = path.join(dataDir, '.seeded');
  if (fs.existsSync(marker)) return;
  try {
    const list = JSON.parse(fs.readFileSync(path.join(seedDir, 'guitars.json'), 'utf8')) as GuitarProfile[];
    const now = new Date().toISOString();
    for (const g of list) store.putGuitar({ ...g, id: crypto.randomUUID(), createdAt: now, updatedAt: now, textures: g.textures ?? {} });
  } catch {
    /* no seed shipped */
  }
  fs.writeFileSync(marker, new Date().toISOString());
}

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

function writeWindowState(file: string, s: WindowState) {
  try {
    fs.writeFileSync(file, JSON.stringify(s));
  } catch {
    /* not critical */
  }
}

async function start() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = new Store(dataDir);
  seedGuitars(store, dataDir);
  const server = createApp(store);
  server.use(express.static(webDir));
  await new Promise<void>((resolve, reject) => {
    const s = server.listen(PORT, '127.0.0.1', () => resolve());
    s.on('error', reject);
  });

  // Microphone (tuner, listen mode, recordings) and clipboard images (tab screenshots).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'clipboard-read'].includes(permission));

  // Window: remembered size / position, otherwise 85 % of the screen it opens on.
  const statePath = path.join(app.getPath('userData'), 'window.json');
  const testSize = /^(\d+)x(\d+)$/.exec(process.env.G3D_SIZE ?? '');
  const saved = testSize ? { x: 0, y: 0, width: Number(testSize[1]), height: Number(testSize[2]) } : readWindowState(statePath);
  const work = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: saved?.width ?? Math.round(work.width * 0.85),
    height: saved?.height ?? Math.round(work.height * 0.85),
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 600,
    resizable: true,
    useContentSize: !!testSize,
    enableLargerThanScreen: !!testSize,
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    title: 'Guitar3D',
    show: false,
  });
  if (saved && 'maximized' in saved && saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The UI is designed at 1440×900: zoom the page with the window so it stays in proportion on a small
  // notebook and on a 4K monitor (browser zoom, so the 3D guitar and the tab scale correctly too).
  // Ctrl + / Ctrl − / Ctrl 0 adjust it on top.
  let userZoom = (saved && 'userZoom' in saved ? saved.userZoom : undefined) ?? 1;
  const fit = () => {
    const [w, h] = win.getContentSize();
    win.webContents.setZoomFactor(fitZoom(w, h, userZoom));
  };
  win.on('resize', fit);
  win.webContents.on('did-finish-load', fit);
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
    if (testSize) return;
    const b = win.getNormalBounds();
    writeWindowState(statePath, { ...b, maximized: win.isMaximized(), userZoom });
  });

  await win.loadURL(`http://127.0.0.1:${PORT}/${process.env.G3D_ROUTE ?? ''}`);
  if (process.env.G3D_SHOT) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.G3D_SHOT!, img.toPNG());
      app.quit();
    }, 7000);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus());
  app.whenReady().then(start).catch((e) => {
    console.error(e);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
