import { createClient } from '@snowman/sdk';
import { bridge } from './bridge.js';

/** fetch-compatible adapter over the bridge (the SDK only needs ok/status/text). */
async function bridgeFetch(url, init = {}) {
  const res = await bridge.fetch(url, { method: init.method, body: init.body });
  if (res.networkError) throw new TypeError(res.networkError);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text: async () => res.text };
}

let client = null;
let clientBase = null;

/** The SDK client for the paired server. The token is added by the bridge, never here. */
export function api(serverUrl) {
  if (!client || clientBase !== serverUrl) {
    client = createClient({ baseUrl: serverUrl, fetchImpl: bridgeFetch });
    clientBase = serverUrl;
  }
  return client;
}

/** Human message for an SDK error. */
export function errorMessage(err) {
  if (!err) return '';
  if (err.name === 'NetworkError') return 'Could not reach the server. Is the backbone running?';
  if (err.status === 401) return 'This device is no longer paired. Pair it again in Settings.';
  if (err.status === 404) return 'Not found. It may already be gone.';
  if (err.status === 409 && err.body?.message) return err.body.message;
  return err.body?.message || err.message || 'Something went wrong.';
}
