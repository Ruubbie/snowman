import { DUPLICATE_WINDOW_S } from './adminDerive.js';

/**
 * Running data for the desktop dashboard (Olaf's home): list/inspect runs
 * with all their telemetry, delete test/false runs, plan decisions, briefs.
 *
 * MariaDB notes: DATETIME params must be Date objects (pool timezone 'Z');
 * `before`/`after` are reserved words (hence before_state/after_state).
 */

function num(v) {
  return v == null ? null : Number(v);
}

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object' && !(v instanceof Date)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function dateOnly(v) {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function mapSession(r) {
  if (!r) return null;
  return {
    id: r.id,
    date: dateOnly(r.date),
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    segments: parseJson(r.segments, []),
    status: r.status,
    source: r.source,
    programWeek: r.program_week,
  };
}

const RUN_LIST_SQL = `
  SELECT r.*,
    s.title AS session_title, s.date AS session_date, s.status AS session_status,
    (SELECT COUNT(*) FROM run_samples x WHERE x.run_id = r.id) AS sample_count,
    (SELECT COUNT(*) FROM run_samples x WHERE x.run_id = r.id AND x.v_acc_m IS NOT NULL) AS native_sample_count,
    (SELECT COUNT(*) FROM run_events e WHERE e.run_id = r.id) AS event_count,
    (SELECT COUNT(*) FROM run_cues c WHERE c.run_client_id = r.client_id) AS cue_count,
    (SELECT COUNT(*) FROM runs o WHERE o.id <> r.id
       AND ABS(TIMESTAMPDIFF(SECOND, o.started_at, r.started_at)) < ?) AS duplicate_count
  FROM runs r
  LEFT JOIN run_sessions s ON s.id = r.session_id`;

function mapRunListRow(r) {
  return {
    id: r.id,
    clientId: r.client_id,
    sessionId: r.session_id,
    startedAt: r.started_at,
    durationS: num(r.duration_s),
    distanceM: num(r.distance_m),
    movingTimeS: num(r.moving_time_s),
    elapsedTimeS: num(r.elapsed_time_s),
    avgPaceSPerKm: num(r.avg_pace_s_per_km),
    elevGainM: num(r.elev_gain_m),
    elevLossM: num(r.elev_loss_m),
    maxSpeedMps: num(r.max_speed_mps),
    avgCadenceSpm: num(r.avg_cadence_spm),
    splits: parseJson(r.splits, null),
    device: parseJson(r.device, null),
    weather: parseJson(r.weather, null),
    effort: num(r.effort),
    note: r.note ?? null,
    completedPlan: r.completed_plan === 1 || r.completed_plan === true,
    imported: r.imported === 1 || r.imported === true,
    createdAt: r.created_at,
    session: r.session_id
      ? { id: r.session_id, title: r.session_title ?? null, date: dateOnly(r.session_date), status: r.session_status ?? null }
      : null,
    sampleCount: Number(r.sample_count || 0),
    nativeSampleCount: Number(r.native_sample_count || 0),
    eventCount: Number(r.event_count || 0),
    cueCount: Number(r.cue_count || 0),
    duplicateCount: Number(r.duplicate_count || 0),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export function createRunningAdminRepo(pool) {
  async function one(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  }

  return {
    /** Stats for the running card on the dashboard's home screen. */
    async overviewStats({ today }) {
      const c = await one(`
        SELECT
          (SELECT COUNT(*) FROM runs) AS runs,
          (SELECT COUNT(*) FROM run_samples) AS samples,
          (SELECT COUNT(*) FROM run_events) AS run_events,
          (SELECT COUNT(*) FROM run_cues) AS cues,
          (SELECT COUNT(*) FROM run_briefs) AS briefs,
          (SELECT COUNT(*) FROM plan_decisions) AS plan_decisions,
          (SELECT COALESCE(SUM(distance_m), 0) FROM runs) AS distance_m,
          (SELECT COALESCE(SUM(COALESCE(moving_time_s, duration_s)), 0) FROM runs) AS time_s,
          (SELECT MAX(started_at) FROM runs) AS last_run,
          (SELECT MAX(created_at) FROM run_cues) AS last_cue,
          (SELECT MAX(created_at) FROM run_briefs) AS last_brief,
          (SELECT MAX(at) FROM plan_decisions) AS last_decision`);
      const next = await one(
        "SELECT * FROM run_sessions WHERE date >= ? AND status = 'planned' AND kind <> 'rest' ORDER BY date LIMIT 1",
        [today],
      );
      return {
        counts: {
          runs: Number(c.runs),
          samples: Number(c.samples),
          runEvents: Number(c.run_events),
          cues: Number(c.cues),
          briefs: Number(c.briefs),
          planDecisions: Number(c.plan_decisions),
        },
        totals: { distanceM: Number(c.distance_m), timeS: Number(c.time_s) },
        lastActivity: { run: c.last_run, cue: c.last_cue, brief: c.last_brief, planDecision: c.last_decision },
        nextSession: mapSession(next),
      };
    },

    async listRuns({ limit, offset }) {
      const [rows] = await pool.query(`${RUN_LIST_SQL} ORDER BY r.started_at DESC, r.id LIMIT ? OFFSET ?`, [
        DUPLICATE_WINDOW_S,
        limit,
        offset,
      ]);
      const total = await one('SELECT COUNT(*) AS n FROM runs');
      return { total: Number(total.n), runs: rows.map(mapRunListRow) };
    },

    async getRun(id) {
      const [rows] = await pool.query(`${RUN_LIST_SQL} WHERE r.id = ?`, [DUPLICATE_WINDOW_S, id]);
      return rows[0] ? mapRunListRow(rows[0]) : null;
    },

    /** Everything hanging off a run: all samples, events, cues, session, brief, debrief. */
    async getRunParts(run) {
      const [samples] = await pool.query(
        `SELECT seq, t_s, ts, lat, lon, alt_m, rel_alt_m, h_acc_m, v_acc_m, speed_mps, dist_m, cadence_spm,
           pace_s_per_km, steps_total, segment_index, accepted
         FROM run_samples WHERE run_id = ? ORDER BY seq`,
        [run.id],
      );
      const [events] = await pool.query('SELECT seq, t_s, ts, type, data FROM run_events WHERE run_id = ? ORDER BY seq', [
        run.id,
      ]);
      const [cues] = await pool.query(
        `SELECT id, session_id, elapsed_s, trigger_type, text, source, created_at
         FROM run_cues WHERE run_client_id = ? ORDER BY elapsed_s, id`,
        [run.clientId],
      );
      const session = run.sessionId ? mapSession(await one('SELECT * FROM run_sessions WHERE id = ?', [run.sessionId])) : null;
      const briefRow = run.sessionId
        ? await one('SELECT brief, model, input_hash, created_at FROM run_briefs WHERE session_id = ?', [run.sessionId])
        : null;
      // Debriefs are not stored in a table of their own; the job publishes them as an event.
      const debriefRow = await one(
        `SELECT payload, created_at FROM events
         WHERE type = 'running.debrief.ready' AND JSON_VALUE(payload, '$.runId') = ?
         ORDER BY id DESC LIMIT 1`,
        [run.id],
      );
      const debrief = debriefRow ? parseJson(debriefRow.payload, {}) : null;
      return {
        samples: samples.map((s) => ({
          seq: s.seq,
          t_s: Number(s.t_s),
          ts: s.ts,
          lat: s.lat,
          lon: s.lon,
          alt_m: s.alt_m,
          rel_alt_m: s.rel_alt_m,
          h_acc_m: s.h_acc_m,
          v_acc_m: s.v_acc_m,
          speed_mps: s.speed_mps,
          dist_m: s.dist_m,
          cadence_spm: s.cadence_spm,
          pace_s_per_km: s.pace_s_per_km,
          steps_total: s.steps_total,
          segment_index: s.segment_index,
          accepted: s.accepted === 1 || s.accepted === true,
        })),
        events: events.map((e) => ({ seq: e.seq, t_s: Number(e.t_s), ts: e.ts, type: e.type, data: parseJson(e.data, null) })),
        cues: cues.map((c) => ({
          id: Number(c.id),
          sessionId: c.session_id,
          elapsedS: Number(c.elapsed_s),
          trigger: c.trigger_type,
          text: c.text,
          source: c.source,
          createdAt: c.created_at,
        })),
        session,
        brief: briefRow
          ? { brief: parseJson(briefRow.brief, {}), model: briefRow.model, inputHash: briefRow.input_hash, createdAt: briefRow.created_at }
          : null,
        debrief: debrief?.text ? { text: debrief.text, at: debriefRow.created_at } : null,
      };
    },

    /**
     * Delete runs and everything hanging off them (samples, run events, cues)
     * in one transaction. A session marked done by a deleted run goes back to
     * 'planned' unless another remaining run still points at it (mirrors
     * POST /v1/running/runs, which marks run.sessionId done on upload).
     * @param {string[]} ids
     */
    async deleteRuns(ids) {
      const conn = await pool.getConnection();
      const deleted = [];
      const notFound = [];
      try {
        await conn.beginTransaction();
        for (const id of ids) {
          const [rows] = await conn.query(
            'SELECT id, client_id, session_id, started_at, distance_m FROM runs WHERE id = ? FOR UPDATE',
            [id],
          );
          const run = rows[0];
          if (!run) {
            notFound.push(id);
            continue;
          }
          const [cueRes] = await conn.query('DELETE FROM run_cues WHERE run_client_id = ?', [run.client_id]);
          const [sampleRes] = await conn.query('DELETE FROM run_samples WHERE run_id = ?', [run.id]);
          const [eventRes] = await conn.query('DELETE FROM run_events WHERE run_id = ?', [run.id]);
          await conn.query('DELETE FROM runs WHERE id = ?', [run.id]);

          let sessionReset = false;
          if (run.session_id) {
            const [others] = await conn.query('SELECT COUNT(*) AS n FROM runs WHERE session_id = ?', [run.session_id]);
            if (Number(others[0].n) === 0) {
              const [upd] = await conn.query(
                "UPDATE run_sessions SET status = 'planned', updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'done'",
                [run.session_id],
              );
              sessionReset = upd.affectedRows > 0;
            }
          }
          deleted.push({
            id: run.id,
            clientId: run.client_id,
            sessionId: run.session_id,
            startedAt: run.started_at,
            distanceM: num(run.distance_m),
            samples: sampleRes.affectedRows,
            events: eventRes.affectedRows,
            cues: cueRes.affectedRows,
            sessionReset,
          });
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      return { deleted, notFound };
    },

    async listPlanDecisions({ limit, offset }) {
      const [rows] = await pool.query('SELECT * FROM plan_decisions ORDER BY at DESC, id DESC LIMIT ? OFFSET ?', [limit, offset]);
      const total = await one('SELECT COUNT(*) AS n FROM plan_decisions');
      return {
        total: Number(total.n),
        decisions: rows.map((r) => ({
          id: Number(r.id),
          at: r.at,
          actor: r.actor,
          action: r.action,
          reason: r.reason,
          before: parseJson(r.before_state, null),
          after: parseJson(r.after_state, null),
        })),
      };
    },

    async listBriefs({ limit, offset }) {
      const [rows] = await pool.query(
        `SELECT b.session_id, b.brief, b.model, b.input_hash, b.created_at,
           s.date, s.kind, s.title, s.status, s.summary
         FROM run_briefs b LEFT JOIN run_sessions s ON s.id = b.session_id
         ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      const total = await one('SELECT COUNT(*) AS n FROM run_briefs');
      return {
        total: Number(total.n),
        briefs: rows.map((r) => ({
          sessionId: r.session_id,
          brief: parseJson(r.brief, {}),
          model: r.model,
          inputHash: r.input_hash,
          createdAt: r.created_at,
          session: r.title != null ? { date: dateOnly(r.date), kind: r.kind, title: r.title, status: r.status, summary: r.summary } : null,
        })),
      };
    },

    /** Removing the stored brief makes POST /v1/running/brief generate a fresh one next time. */
    async deleteBrief(sessionId) {
      const [res] = await pool.query('DELETE FROM run_briefs WHERE session_id = ?', [sessionId]);
      return res.affectedRows > 0;
    },
  };
}
