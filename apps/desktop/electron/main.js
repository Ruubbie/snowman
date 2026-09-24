// Snowman desktop - Electron main process.
//
// One main process owns every window. Today that is the dashboard (Olaf's
// home); the Olaf overlay (global hotkey, voice, quick chat) will be a second
// window created here and sharing the same store + IPC bridge.
const path = require('node:path');
const { app, BrowserWindow, nativeTheme, shell, safeStorage } = require('electron');
const { createStore } = require('./store');
const { registerIpc } = require('./ipc');

// Set by scripts/dev.js; otherwise the built renderer in ../dist is loaded.
const DEV_URL = process.env.SNOWMAN_DEV_URL || null;
const PRELOAD = path.join(__dirname, 'preload.js');

/** Window registry: the dashboard now, the overlay later. */
const windows = {
  /** @type {BrowserWindow|null} */
  dashboard: null,
  /** @type {BrowserWindow|null} reserved for the Olaf overlay (not built yet) */
  overlay: null,
};

/** Only our own renderer may talk to the main process. */
function isTrustedUrl(url) {
  if (!url) return false;
  if (DEV_URL) return url.startsWith(DEV_URL);
  return url.startsWith('file://');
}

function hardenWebContents(contents) {
  // Links to the outside world open in the default browser, never in-app.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
}

function loadRenderer(win, hash = '') {
  if (DEV_URL) return win.loadURL(`${DEV_URL}${hash ? `#${hash}` : ''}`);
  return win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), hash ? { hash } : undefined);
}

function createDashboardWindow() {
  if (windows.dashboard && !windows.dashboard.isDestroyed()) {
    windows.dashboard.show();
    windows.dashboard.focus();
    return windows.dashboard;
  }
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 560,
    minHeight: 520,
    title: 'Olaf',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10151C' : '#F7F9FB',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  hardenWebContents(win.webContents);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    windows.dashboard = null;
  });
  loadRenderer(win);
  windows.dashboard = win;
  return win;
}

// Future: createOverlayWindow() - frameless, transparent, always-on-top,
// toggled by a globalShortcut; loads the same renderer at '#/overlay' and uses
// the same window.snowman bridge (so the token stays in this process).

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => createDashboardWindow());

  app.whenReady().then(() => {
    const store = createStore(app.getPath('userData'), safeStorage);
    nativeTheme.themeSource = store.getConfig().theme || 'system';
    registerIpc({ store, isTrustedUrl, nativeTheme, appVersion: app.getVersion() });
    createDashboardWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createDashboardWindow();
    });
  });

  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { windows, createDashboardWindow };
