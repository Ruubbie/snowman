// Runs in an isolated, sandboxed context. Exposes a tiny, fixed API as
// window.snowman - no Node, no raw ipcRenderer, and never the device token.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snowman', {
  shell: 'desktop',
  getState: () => ipcRenderer.invoke('snowman:state'),
  pair: ({ serverUrl, code, deviceName }) => ipcRenderer.invoke('snowman:pair', { serverUrl, code, deviceName }),
  unpair: () => ipcRenderer.invoke('snowman:unpair'),
  setTheme: (theme) => ipcRenderer.invoke('snowman:setTheme', theme),
  /** fetch-like: the main process adds the token; resolves {status, text} or {networkError}. */
  fetch: (url, init) =>
    ipcRenderer.invoke('snowman:fetch', url, { method: init?.method, body: init?.body }),
});
