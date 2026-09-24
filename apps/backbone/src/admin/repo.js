/**
 * Core (module-independent) data for the desktop dashboard: overview counts,
 * Olaf conversations, AI usage, the event log and paired devices. Modules
 * own their own admin repos (e.g. packages/modules/running/src/adminRepo.js).
 * Every method returns plain camelCase objects; JSON columns are parsed.
 * MariaDB: DATETIME params must be Date objects (pool timezone 'Z').
 */

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object' && !(v instanceof Date)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** @param {import('mysql2/promise').Pool} pool */
export function createAdminRepo(pool) {
  async function one(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  }

  return {
    async overview({ monthStart }) {
      const c = await one(
        `SELECT
          (SELECT COUNT(*) FROM conversations) AS conversations,
          (SELECT COUNT(*) FROM conversation_messages) AS messages,
          (SELECT COUNT(*) FROM ai_usage) AS ai_calls,
          (SELECT COUNT(*) FROM ai_usage WHERE at >= ?) AS month_ai_calls,
          (SELECT COUNT(*) FROM events) AS events,
          (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) AS devices,
          (SELECT MAX(created_at) FROM conversation_messages) AS last_message,
          (SELECT MAX(at) FROM ai_usage) AS last_ai_call,
          (SELECT MAX(created_at) FROM events) AS last_event`,
        [monthStart],
      );
      return {
        counts: {
          conversations: Number(c.conversations),
          messages: Number(c.messages),
          aiCalls: Number(c.ai_calls),
          monthAiCalls: Number(c.month_ai_calls),
          events: Number(c.events),
          devices: Number(c.devices),
        },
        lastActivity: { message: c.last_message, aiCall: c.last_ai_call, event: c.last_event },
      };
    },

    // --- conversations ----------------------------------------------------
    async listConversations({ limit, offset }) {
      const [rows] = await pool.query(
        `SELECT c.id, c.title, c.device_id, c.created_at, c.updated_at, d.name AS device_name,
           (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count,
           (SELECT m.content FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_content,
           (SELECT m.role FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_role,
           (SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
           (SELECT m.content FROM conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.id LIMIT 1) AS first_user_content
         FROM conversations c LEFT JOIN devices d ON d.id = c.device_id
         ORDER BY c.updated_at DESC, c.id LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      const total = await one('SELECT COUNT(*) AS n FROM conversations');
      return {
        total: Number(total.n),
        conversations: rows.map((r) => ({
          id: r.id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          device: r.device_id ? { id: r.device_id, name: r.device_name ?? null } : null,
          messageCount: Number(r.message_count || 0),
          lastMessage:
            r.last_content != null ? { role: r.last_role, content: parseJson(r.last_content, r.last_content), at: r.last_at } : null,
          firstUserContent: r.first_user_content != null ? parseJson(r.first_user_content, r.first_user_content) : null,
        })),
      };
    },

    async getConversation(id) {
      const c = await one(
        `SELECT c.id, c.title, c.device_id, c.created_at, c.updated_at, d.name AS device_name
         FROM conversations c LEFT JOIN devices d ON d.id = c.device_id WHERE c.id = ?`,
        [id],
      );
      if (!c) return null;
      const [rows] = await pool.query(
        'SELECT id, role, content, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id',
        [id],
      );
      return {
        id: c.id,
        title: c.title,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        device: c.device_id ? { id: c.device_id, name: c.device_name ?? null } : null,
        messages: rows.map((m) => ({ id: Number(m.id), role: m.role, content: parseJson(m.content, m.content), createdAt: m.created_at })),
      };
    },

    async deleteConversation(id) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT id FROM conversations WHERE id = ? FOR UPDATE', [id]);
        if (!rows.length) {
          await conn.rollback();
          return null;
        }
        const [msgRes] = await conn.query('DELETE FROM conversation_messages WHERE conversation_id = ?', [id]);
        await conn.query('DELETE FROM conversations WHERE id = ?', [id]);
        await conn.commit();
        return { id, messages: msgRes.affectedRows };
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },

    // --- AI usage ---------------------------------------------------------
    async listAiUsage({ limit, offset, monthStart }) {
      const [rows] = await pool.query(
        `SELECT id, at, model, purpose, input_tokens, output_tokens, cache_read, cache_write, cost_usd
         FROM ai_usage ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      const total = await one('SELECT COUNT(*) AS n FROM ai_usage');
      const group = async (col) => {
        const [g] = await pool.query(
          `SELECT ${col} AS k, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
             SUM(cache_read) AS cache_read, SUM(cache_write) AS cache_write, SUM(cost_usd) AS cost_usd
           FROM ai_usage WHERE at >= ? GROUP BY ${col} ORDER BY cost_usd DESC`,
          [monthStart],
        );
        return g.map((r) => ({
          key: r.k,
          calls: Number(r.calls),
          inputTokens: Number(r.input_tokens || 0),
          outputTokens: Number(r.output_tokens || 0),
          cacheRead: Number(r.cache_read || 0),
          cacheWrite: Number(r.cache_write || 0),
          costUsd: Number(r.cost_usd || 0),
        }));
      };
      const [byMonth] = await pool.query(
        `SELECT DATE_FORMAT(at, '%Y-%m') AS month, COUNT(*) AS calls, SUM(cost_usd) AS cost_usd
         FROM ai_usage GROUP BY DATE_FORMAT(at, '%Y-%m') ORDER BY month DESC LIMIT 12`,
      );
      return {
        total: Number(total.n),
        rows: rows.map((r) => ({
          id: Number(r.id),
          at: r.at,
          model: r.model,
          purpose: r.purpose,
          inputTokens: Number(r.input_tokens),
          outputTokens: Number(r.output_tokens),
          cacheRead: Number(r.cache_read),
          cacheWrite: Number(r.cache_write),
          costUsd: Number(r.cost_usd),
        })),
        month: { byPurpose: await group('purpose'), byModel: await group('model') },
        byMonth: byMonth.map((r) => ({ month: r.month, calls: Number(r.calls), costUsd: Number(r.cost_usd || 0) })),
      };
    },

    // --- event log ----------------------------------------------------------
    /** @param {{limit: number, offset: number, type?: string}} q type: exact, or a prefix ending in '*' */
    async listEvents({ limit, offset, type }) {
      let where = '';
      const params = [];
      if (type) {
        if (type.endsWith('*')) {
          where = 'WHERE type LIKE ?';
          params.push(`${type.slice(0, -1).replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
        } else {
          where = 'WHERE type = ?';
          params.push(type);
        }
      }
      const [rows] = await pool.query(`SELECT id, type, payload, created_at FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset,
      ]);
      const total = await one(`SELECT COUNT(*) AS n FROM events ${where}`, params);
      const [types] = await pool.query('SELECT type, COUNT(*) AS n, MAX(created_at) AS last_at FROM events GROUP BY type ORDER BY last_at DESC');
      return {
        total: Number(total.n),
        events: rows.map((r) => ({ id: Number(r.id), type: r.type, payload: parseJson(r.payload, {}), createdAt: r.created_at })),
        types: types.map((t) => ({ type: t.type, count: Number(t.n), lastAt: t.last_at })),
      };
    },

    // --- devices ----------------------------------------------------------
    async listDevices() {
      const [rows] = await pool.query(
        `SELECT d.id, d.name, d.created_at, d.revoked_at,
           (SELECT COUNT(*) FROM conversations c WHERE c.device_id = d.id) AS conversation_count
         FROM devices d ORDER BY d.revoked_at IS NULL DESC, d.created_at DESC`,
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        revokedAt: r.revoked_at,
        conversationCount: Number(r.conversation_count || 0),
      }));
    },

    async getDevice(id) {
      const r = await one('SELECT id, name, created_at, revoked_at FROM devices WHERE id = ?', [id]);
      return r ? { id: r.id, name: r.name, createdAt: r.created_at, revokedAt: r.revoked_at } : null;
    },

    async revokeDevice(id) {
      await pool.query('UPDATE devices SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND revoked_at IS NULL', [id]);
      return this.getDevice(id);
    },
  };
}
