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

  const id = (v) => encodeURIComponent(v);
  // Desktop dashboard (Olaf's home): core data under /v1/admin, each module under /v1/admin/<module>.
  const admin = {
    overview: () => request('/v1/admin/overview'),
    conversations: ({ limit, offset } = {}) => request('/v1/admin/conversations', { query: { limit, offset } }),
    conversation: (conversationId) => request(`/v1/admin/conversations/${id(conversationId)}`),
    deleteConversation: (conversationId) => request(`/v1/admin/conversations/${id(conversationId)}`, { method: 'DELETE' }),
    aiUsage: ({ limit, offset } = {}) => request('/v1/admin/ai-usage', { query: { limit, offset } }),
    events: ({ limit, offset, type } = {}) => request('/v1/admin/events', { query: { limit, offset, type } }),
    devices: () => request('/v1/admin/devices'),
    revokeDevice: (deviceId) => request(`/v1/admin/devices/${id(deviceId)}`, { method: 'DELETE' }),
    running: {
      runs: ({ limit, offset } = {}) => request('/v1/admin/running/runs', { query: { limit, offset } }),
      run: (runId) => request(`/v1/admin/running/runs/${id(runId)}`),
      deleteRun: (runId) => request(`/v1/admin/running/runs/${id(runId)}`, { method: 'DELETE' }),
      deleteRuns: (ids) => request('/v1/admin/running/runs/delete', { method: 'POST', body: { ids } }),
      planDecisions: ({ limit, offset } = {}) => request('/v1/admin/running/plan-decisions', { query: { limit, offset } }),
      briefs: ({ limit, offset } = {}) => request('/v1/admin/running/briefs', { query: { limit, offset } }),
      deleteBrief: (sessionId) => request(`/v1/admin/running/briefs/${id(sessionId)}`, { method: 'DELETE' }),
    },
  };

  // Olaf's server voice: identical WAV (24 kHz mono) on every device. Audio ids are content hashes.
  const audioUrl = (idOrUrl) =>
    /^https?:/.test(idOrUrl)
      ? idOrUrl
      : `${baseUrl.replace(/\/$/, '')}${String(idOrUrl).startsWith('/') ? idOrUrl : `/v1/voice/audio/${idOrUrl}.wav`}`;
  const voice = {
    /** -> {id, url, durationMs, cached}; waits for synthesis. 503 voice_unavailable if the server has no voice. */
    speak: (text) => request('/v1/voice/speak', { method: 'POST', body: { text } }),
    status: () => request('/v1/voice/status'),
    /** Absolute URL for an audio id (or the `url` path from speak/cue/brief). Needs the Bearer header (or ?token=). */
    audioUrl,
    /** Download a clip with auth; resolves to an ArrayBuffer of WAV bytes. Waits server-side if still synthesising. */
    fetchAudio: async (idOrUrl) => {
      const token = getToken ? await getToken() : null;
      let res;
      try {
        res = await doFetch(audioUrl(idOrUrl), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      } catch (err) {
        throw new NetworkError(err);
      }
      if (!res.ok) throw errorFor(res.status, await parseBody(res));
      return res.arrayBuffer();
    },
  };

  return {
    health: () => request('/v1/health', { auth: false }),
    pair: ({ code, deviceName }) => request('/v1/pair', { method: 'POST', body: { code, deviceName }, auth: false }),
    running,
    admin,
    voice,
  };
}

export default createClient;
