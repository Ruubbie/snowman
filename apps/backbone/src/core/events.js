import crypto from 'node:crypto';

/**
 * In-process event bus. Publishing appends a row to the `events` table (best
 * effort - failures are logged, never thrown, so a DB hiccup can't take down
 * a request) and synchronously notifies matching subscribers.
 *
 * @param {import('mysql2/promise').Pool|null} pool pass null to skip persistence (tests)
 * @param {{logger?: {error: Function}}} [opts]
 */
export function createEventBus(pool, opts = {}) {
  const logger = opts.logger || console;
  /** @type {{pattern: string, handler: Function}[]} */
  const subscribers = [];

  function matches(pattern, type) {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
  }

  return {
    /**
     * @param {string} type
     * @param {object} payload
     */
    async publish(type, payload) {
      const at = new Date();
      if (pool) {
        try {
          await pool.query('INSERT INTO events (type, payload, created_at) VALUES (?, ?, UTC_TIMESTAMP(3))', [
            type,
            JSON.stringify(payload ?? {}),
          ]);
        } catch (err) {
          logger.error({ err, type }, 'failed to persist event');
        }
      }
      const event = { id: crypto.randomUUID(), type, payload, at };
      for (const sub of subscribers) {
        if (!matches(sub.pattern, type)) continue;
        Promise.resolve()
          .then(() => sub.handler(event))
          .catch((err) => logger.error({ err, type }, 'event subscriber failed'));
      }
      return event;
    },

    /**
     * @param {string} pattern exact type, or a prefix ending in '*'
     * @param {(event: {id:string,type:string,payload:object,at:Date}) => any} handler
     */
    subscribe(pattern, handler) {
      subscribers.push({ pattern, handler });
    },
  };
}
