// The only bridge between renderer and main. The renderer asks for data; the
// main process adds the device token and talks to the backbone, so the token
// is never exposed to page JavaScript.
const { ipcMain } = require('electron');

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const TIMEOUT_MS = 20000;

/** http(s) origin + optional path prefix, no trailing slash. Throws on anything else. */
function normalizeServerUrl(input) {
  const url = new URL(String(input || '').trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http:// or https:// address.');
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

async function timedFetch(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function registerIpc({ store, isTrustedUrl, nativeTheme, appVersion }) {
  function guard(event) {
    if (!isTrustedUrl(event.senderFrame?.url)) throw new Error('untrusted sender');
  }

  function state() {
    const c = store.getConfig();
    return {
      shell: 'desktop',
      paired: Boolean(c.serverUrl && store.getToken()),
      serverUrl: c.serverUrl,
      deviceId: c.deviceId,
      deviceName: c.deviceName,
      pairedAt: c.pairedAt,
      theme: c.theme || 'system',
      tokenStorage: store.tokenPersisted() ? 'encrypted' : store.getToken() ? 'memory' : 'none',
      canEncrypt: store.canEncrypt(),
      appVersion,
    };
  }

  ipcMain.handle('snowman:state', (event) => {
    guard(event);
    return state();
  });

  ipcMain.handle('snowman:pair', async (event, args) => {
    guard(event);
    let serverUrl;
    try {
      serverUrl = normalizeServerUrl(args?.serverUrl);
    } catch (err) {
      return { error: err.message || 'Invalid server address.' };
    }
    const code = String(args?.code || '').trim().toUpperCase();
    const deviceName = String(args?.deviceName || '').trim() || 'Desktop';
    if (!/^[A-Z0-9]{6}$/.test(code)) return { error: 'The pairing code has 6 letters or digits.' };

    let res;
    try {
      res = await timedFetch(`${serverUrl}/v1/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceName }),
      });
    } catch (err) {
      return { error: `Could not reach ${serverUrl}. ${err.name === 'AbortError' ? 'It timed out.' : 'Is the backbone running?'}` };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.token) {
      return { error: body?.error === 'invalid or expired pairing code' ? 'That code is invalid or expired.' : `Pairing failed (${res.status}).` };
    }
    const { persisted } = store.setToken(body.token);
    store.setConfig({ serverUrl, deviceId: body.deviceId, deviceName, pairedAt: new Date().toISOString() });
    return { state: state(), persisted };
  });

  ipcMain.handle('snowman:fetch', async (event, url, init = {}) => {
    guard(event);
    const { serverUrl } = store.getConfig();
    const token = store.getToken();
    if (!serverUrl || !token) return { status: 401, text: JSON.stringify({ error: 'not_paired' }) };
    // The token only ever goes to the paired server's API.
    if (typeof url !== 'string' || !url.startsWith(`${serverUrl}/v1/`)) {
      return { status: 400, text: JSON.stringify({ error: 'blocked_url' }) };
    }
    const method = String(init.method || 'GET').toUpperCase();
    if (!METHODS.has(method)) return { status: 400, text: JSON.stringify({ error: 'blocked_method' }) };
    const headers = { Authorization: `Bearer ${token}` };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const res = await timedFetch(url, { method, headers, body: init.body });
      return { status: res.status, text: await res.text() };
    } catch (err) {
      return { networkError: err.name === 'AbortError' ? 'timeout' : err.message || 'network error' };
    }
  });

  ipcMain.handle('snowman:unpair', (event) => {
    guard(event);
    store.clearPairing();
    return state();
  });

  ipcMain.handle('snowman:setTheme', (event, theme) => {
    guard(event);
    const next = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
    store.setConfig({ theme: next });
    nativeTheme.themeSource = next;
    return state();
  });
}

module.exports = { registerIpc, normalizeServerUrl };
