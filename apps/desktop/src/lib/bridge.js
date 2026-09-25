// One interface, two shells:
// - Electron: window.snowman from electron/preload.js. The token lives in the
//   main process (encrypted with safeStorage) and requests go through IPC.
// - Browser dev (`npm run dev:web`): a DEV-ONLY store in localStorage and a
//   Vite middleware proxy, so the renderer can be checked in a normal browser.

const DEV_KEY = 'snowman.desktop.devStore';
const desktop = typeof window !== 'undefined' ? window.snowman : undefined;

function readDev() {
  try {
    return JSON.parse(localStorage.getItem(DEV_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeDev(next) {
  try {
    localStorage.setItem(DEV_KEY, JSON.stringify(next));
  } catch {
    // private window: memory only
  }
}

function devState() {
  const s = readDev();
  return {
    shell: 'browser',
    paired: Boolean(s.serverUrl && s.token),
    serverUrl: s.serverUrl || null,
    deviceId: s.deviceId || null,
    deviceName: s.deviceName || null,
    pairedAt: s.pairedAt || null,
    theme: s.theme || 'system',
    tokenStorage: s.token ? 'browser-dev' : 'none',
    canEncrypt: false,
    appVersion: 'dev',
  };
}

function normalizeServerUrl(input) {
  const url = new URL(String(input || '').trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http:// or https:// address.');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function devProxy(url, { method = 'GET', body, token } = {}) {
  const headers = { 'X-Snowman-Target': url };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/__snowman_proxy', { method, headers, body });
  return { status: res.status, text: await res.text() };
}

const browserBridge = {
  shell: 'browser',
  async getState() {
    return devState();
  },
  async pair({ serverUrl, code, deviceName }) {
    let base;
    try {
      base = normalizeServerUrl(serverUrl);
    } catch (err) {
      return { error: err.message };
    }
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) return { error: 'The pairing code has 6 letters or digits.' };
    const name = String(deviceName || '').trim() || 'Desktop (browser dev)';
    let res;
    try {
      res = await devProxy(`${base}/v1/pair`, { method: 'POST', body: JSON.stringify({ code: cleanCode, deviceName: name }) });
    } catch {
      return { error: `Could not reach ${base}.` };
    }
    let body = null;
    try {
      body = JSON.parse(res.text);
    } catch {
      // not JSON
    }
    if (res.status !== 200 || !body?.token) {
      return { error: body?.error === 'invalid or expired pairing code' ? 'That code is invalid or expired.' : `Pairing failed (${res.status}).` };
    }
    writeDev({ ...readDev(), serverUrl: base, token: body.token, deviceId: body.deviceId, deviceName: name, pairedAt: new Date().toISOString() });
    return { state: devState(), persisted: false };
  },
  async unpair() {
    const { theme } = readDev();
    writeDev({ theme });
    return devState();
  },
  async setTheme(theme) {
    writeDev({ ...readDev(), theme });
    return devState();
  },
  async fetch(url, init = {}) {
    const s = readDev();
    if (!s.serverUrl || !s.token) return { status: 401, text: JSON.stringify({ error: 'not_paired' }) };
    if (!url.startsWith(`${s.serverUrl}/v1/`)) return { status: 400, text: JSON.stringify({ error: 'blocked_url' }) };
    try {
      return await devProxy(url, { method: init.method, body: init.body, token: s.token });
    } catch (err) {
      return { networkError: err.message };
    }
  },
};

export const bridge = desktop || browserBridge;
