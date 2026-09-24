import crypto from 'node:crypto';

/** Routes that never require a Bearer token. */
export const PUBLIC_PATHS = new Set(['/v1/pair', '/v1/health']);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const PAIRING_TTL_MS = 10 * 60 * 1000;

/** @returns {string} sha256 hex digest */
export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** @returns {string} a 6-character human-friendly pairing code */
function randomPairingCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** @returns {string} a 32-byte random device token, base64url encoded */
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * DB-backed repo used by auth. Callers in tests can substitute a fake with
 * the same method shape.
 * @param {import('mysql2/promise').Pool} pool
 */
export function createDeviceRepo(pool) {
  return {
    async insertPairingCode({ id, codeHash, deviceName, expiresAt }) {
      await pool.query(
        'INSERT INTO pairing_codes (id, code_hash, device_name, expires_at, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
        [id, codeHash, deviceName, expiresAt],
      );
    },
    async findValidPairingCode(codeHash) {
      const [rows] = await pool.query(
        'SELECT id, device_name AS deviceName, expires_at AS expiresAt FROM pairing_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3) LIMIT 1',
        [codeHash],
      );
      return rows[0] || null;
    },
    async markPairingCodeUsed(id) {
      await pool.query('UPDATE pairing_codes SET used_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
    },
    async createDevice({ id, name, tokenHash }) {
      await pool.query(
        'INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
        [id, name, tokenHash],
      );
    },
    async findActiveDeviceByTokenHash(tokenHash) {
      const [rows] = await pool.query(
        'SELECT id, name FROM devices WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1',
        [tokenHash],
      );
      return rows[0] || null;
    },
  };
}

export class PairingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PairingError';
    this.statusCode = 400;
  }
}

/**
 * Create a one-time pairing code for a new device.
 * @param {ReturnType<typeof createDeviceRepo>} repo
 * @param {string} deviceName
 * @param {{clock?: () => Date}} [opts]
 * @returns {Promise<{code: string, expiresAt: Date}>}
 */
export async function createPairingCode(repo, deviceName, opts = {}) {
  const clock = opts.clock || (() => new Date());
  const code = randomPairingCode();
  const expiresAt = new Date(clock().getTime() + PAIRING_TTL_MS);
  await repo.insertPairingCode({
    id: crypto.randomUUID(),
    codeHash: sha256Hex(code),
    deviceName,
    expiresAt,
  });
  return { code, expiresAt };
}

/**
 * Redeem a pairing code for a device token.
 * @param {ReturnType<typeof createDeviceRepo>} repo
 * @param {{code: string, deviceName: string}} input
 * @returns {Promise<{token: string, deviceId: string}>}
 */
export async function pair(repo, { code, deviceName }) {
  if (!code || !deviceName) throw new PairingError('code and deviceName are required');
  const found = await repo.findValidPairingCode(sha256Hex(code.toUpperCase()));
  if (!found) throw new PairingError('invalid or expired pairing code');

  const deviceId = crypto.randomUUID();
  const token = randomToken();
  await repo.createDevice({ id: deviceId, name: deviceName, tokenHash: sha256Hex(token) });
  await repo.markPairingCodeUsed(found.id);
  return { token, deviceId };
}

/**
 * Fastify preHandler enforcing Bearer auth on all /v1 routes except the
 * public ones. Attaches request.device on success.
 * @param {ReturnType<typeof createDeviceRepo>} repo
 */
export function authPreHandler(repo) {
  return async function preHandler(request, reply) {
    const path = request.raw.url?.split('?')[0] || request.url;
    if (!path.startsWith('/v1/') || PUBLIC_PATHS.has(path)) return;

    const header = request.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match ? match[1] : request.query?.token;
    if (!token) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    const device = await repo.findActiveDeviceByTokenHash(sha256Hex(token));
    if (!device) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    request.device = device;
  };
}
