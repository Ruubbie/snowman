/** Base class for every typed SDK error. */
export class SnowmanApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'SnowmanApiError';
    this.status = status;
    this.body = body;
  }
}

/** Olaf is not configured/available server-side (HTTP 503, error: olaf_unavailable). */
export class OlafUnavailable extends SnowmanApiError {
  constructor(body) {
    super('Olaf is unavailable', { status: 503, body });
    this.name = 'OlafUnavailable';
  }
}

/** No/invalid device token (HTTP 401). */
export class Unauthorized extends SnowmanApiError {
  constructor(body) {
    super('Unauthorized', { status: 401, body });
    this.name = 'Unauthorized';
  }
}

/** fetch() itself threw (offline, DNS, connection refused, timeout, ...). */
export class NetworkError extends SnowmanApiError {
  constructor(cause) {
    super(cause?.message || 'Network request failed', { status: null, body: null });
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export default { SnowmanApiError, OlafUnavailable, Unauthorized, NetworkError };
