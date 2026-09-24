import crypto from 'node:crypto';
import { localDateString, zonedTimeToUtc } from '@snowman/shared';

const POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 5;

/**
 * Job queue: `jobs` table, claimed with SELECT ... FOR UPDATE SKIP LOCKED so
 * a single backbone process (today) or several (later) never double-run a
 * job. Handlers are registered by modules; recurring jobs are (re)enqueued
 * idempotently once per local day.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{tzName: string, logger?: {error: Function, info: Function}}} opts
 */
export function createJobRunner(pool, opts) {
  const { tzName } = opts;
  const logger = opts.logger || console;
  /** @type {Map<string, (payload: object) => Promise<void>>} */
  const handlers = new Map();
  /** @type {{type: string, everyDayAt: string}[]} */
  const recurring = [];
  let timer = null;

  return {
    registerHandler(type, handler) {
      handlers.set(type, handler);
    },
    registerRecurring(def) {
      recurring.push(def);
    },
    /**
     * @param {string} type
     * @param {object} payload
     * @param {Date} [runAt]
     */
    async enqueue(type, payload, runAt = new Date()) {
      const id = crypto.randomUUID();
      await pool.query(
        'INSERT INTO jobs (id, type, run_at, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, \'queued\', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
        [id, type, runAt, JSON.stringify(payload ?? {})],
      );
      return id;
    },

    async scheduleRecurringOnce() {
      const now = new Date();
      const today = localDateString(now, tzName);
      for (const def of recurring) {
        const [hh, mm] = def.everyDayAt.split(':').map(Number);
        const [y, m, d] = today.split('-').map(Number);
        const runAt = zonedTimeToUtc({ year: y, month: m, day: d, hour: hh, minute: mm }, tzName);
        const [rows] = await pool.query(
          "SELECT id FROM jobs WHERE type = ? AND run_at = ? LIMIT 1",
          [def.type, runAt],
        );
        if (rows.length === 0) {
          await pool.query(
            'INSERT INTO jobs (id, type, run_at, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, \'{}\', \'queued\', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
            [crypto.randomUUID(), def.type, runAt],
          );
        }
      }
    },

    async claimAndRunOne() {
      const conn = await pool.getConnection();
      let claimed = null;
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          "SELECT id, type, payload, attempts FROM jobs WHERE status = 'queued' AND run_at <= UTC_TIMESTAMP(3) ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        );
        if (rows.length > 0) {
          claimed = rows[0];
          await conn.query("UPDATE jobs SET status = 'running', updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [
            claimed.id,
          ]);
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      if (!claimed) return false;

      const handler = handlers.get(claimed.type);
      try {
        if (!handler) throw new Error(`no handler registered for job type "${claimed.type}"`);
        const payload = typeof claimed.payload === 'string' ? JSON.parse(claimed.payload) : claimed.payload;
        await handler(payload);
        await pool.query("UPDATE jobs SET status = 'done', updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [
          claimed.id,
        ]);
      } catch (err) {
        const attempts = claimed.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await pool.query(
            "UPDATE jobs SET status = 'failed', attempts = ?, last_error = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            [attempts, String(err.message || err), claimed.id],
          );
        } else {
          const backoffMs = 2 ** attempts * 60_000;
          await pool.query(
            "UPDATE jobs SET status = 'queued', attempts = ?, last_error = ?, run_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            [attempts, String(err.message || err), Math.round(backoffMs / 1000), claimed.id],
          );
        }
        logger.error({ err, jobType: claimed.type }, 'job failed');
      }
      return true;
    },

    start() {
      if (timer) return;
      const tick = async () => {
        try {
          await this.scheduleRecurringOnce();
          let more = true;
          while (more) more = await this.claimAndRunOne();
        } catch (err) {
          logger.error({ err }, 'job loop tick failed');
        }
      };
      timer = setInterval(tick, POLL_INTERVAL_MS);
      timer.unref?.();
      tick();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
