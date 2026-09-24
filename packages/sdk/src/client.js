import { OlafUnavailable, Unauthorized, NetworkError, SnowmanApiError } from './errors.js';

/**
 * @param {Response} res
 */
async function parseBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFor(status, body) {
  if (status === 503 && body?.error === 'olaf_unavailable') return new OlafUnavailable(body);
  if (status === 401) return new Unauthorized(body);
  return new SnowmanApiError(body?.error || `request failed with status ${status}`, { status, body });
}

/**
 * @param {{baseUrl: string, getToken?: () => (string|null|Promise<string|null>), fetchImpl?: typeof fetch}} opts
 */
export function createClient({ baseUrl, getToken, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!doFetch) throw new Error('no fetch implementation available - pass fetchImpl');

  async function request(path, { method = 'GET', body, auth = true, query } = {}) {
    let url = `${baseUrl.replace(/\/$/, '')}${path}`;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null),
      ).toString();
      if (qs) url += `?${qs}`;
    }

    // Only declare a JSON content-type when a body is actually sent -
    // Fastify's json body parser rejects an empty body on that content-type
    // (e.g. POST /running/debrief/:id, which takes no body).
    const headers = body !== undefined ? { 'Content-Type': 'application/json' } : {};
    if (auth) {
      const token = getToken ? await getToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res;
    try {
      res = await doFetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (err) {
      throw new NetworkError(err);
    }

    const parsed = await parseBody(res);
    if (!res.ok) throw errorFor(res.status, parsed);
    return parsed;
  }

  const running = {
    today: () => request('/v1/running/today'),
    plan: ({ from, to }) => request('/v1/running/plan', { query: { from, to } }),
    runs: ({ limit } = {}) => request('/v1/running/runs', { query: { limit } }),
    run: (id) => request(`/v1/running/runs/${encodeURIComponent(id)}`),
    analysis: (id) => request(`/v1/running/runs/${encodeURIComponent(id)}/analysis`),
    samples: (id, { every } = {}) => request(`/v1/running/runs/${encodeURIComponent(id)}/samples`, { query: { every } }),
    brief: (sessionId) => request('/v1/running/brief', { method: 'POST', body: { sessionId } }),
    cue: ({ sessionId = null, runClientId, trigger, snapshot }) =>
      request('/v1/running/cue', { method: 'POST', body: { sessionId, runClientId, trigger, snapshot } }),
    debrief: (runId) => request(`/v1/running/debrief/${encodeURIComponent(runId)}`, { method: 'POST' }),
    uploadRun: ({ run, samples = [], events = [] }) =>
      request('/v1/running/runs', { method: 'POST', body: { run, samples, events } }),
    uploadSamples: (clientId, { samples, events = [] }) =>
      request(`/v1/running/runs/${encodeURIComponent(clientId)}/samples`, { method: 'POST', body: { samples, events } }),
    reminders: () => request('/v1/running/reminders'),
    settings: (body) => request('/v1/running/settings', { method: 'PUT', body }),
  };

  return {
    health: () => request('/v1/health', { auth: false }),
    pair: ({ code, deviceName }) => request('/v1/pair', { method: 'POST', body: { code, deviceName }, auth: false }),
    running,
  };
}

export default createClient;
