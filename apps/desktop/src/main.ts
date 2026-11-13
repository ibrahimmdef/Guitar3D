/**
 * Guitar3D desktop: the Express API (apps/server) and the built web app (apps/web/dist) run inside
 * Electron on a fixed local port, so localStorage (settings, progress) survives restarts.
 * Data (tabs, guitars, sessions) lives in the OS user-data folder.
 */
import { app, BrowserWindow, session, shell } from 'electron';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { GuitarProfile } from '@guitar3d/shared';
import { createApp } from '../../server/src/app';
import { Store } from '../../server/src/store';

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

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    title: 'Guitar3D',
    show: false,
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
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
