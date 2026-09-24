import { createClient } from '@snowman/sdk';
import { tokenStore } from './tokenStore.js';

let cached = null;
let cachedBaseUrl = null;

/** A single shared SDK client, rebuilt only if the server URL changes. */
export async function getClient() {
  const baseUrl = (await tokenStore.getServerUrl()) || 'http://127.0.0.1:4000';
  if (cached && cachedBaseUrl === baseUrl) return cached;
  cachedBaseUrl = baseUrl;
  cached = createClient({ baseUrl, getToken: () => tokenStore.getToken() });
  return cached;
}

/** Call after settings change (server URL edited, re-paired) so the next getClient() picks it up. */
export function resetClient() {
  cached = null;
}

export default { getClient, resetClient };
