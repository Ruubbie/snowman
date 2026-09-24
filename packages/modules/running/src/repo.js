import crypto from 'node:crypto';

function toBool(v) {
  return v === 1 || v === true;
}

/** ISO strings / epoch ms -> Date, so mysql2 writes them as UTC DATETIME (the pool uses timezone 'Z'). */
function dbTime(v) {
  if (v == null || v instanceof Date) return v ?? null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseJsonColumn(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v; // mysql2 may already give an object for JSON-typed columns
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function mapSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    segments: parseJsonColumn(row.segments, []),
    status: row.status,
    source: row.source,
    programWeek: row.program_week,
  };
}

function mapRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    sessionId: row.session_id,
    startedAt: row.started_at,
    durationS: row.duration_s,
    distanceM: row.distance_m,
    movingTimeS: row.moving_time_s,
    elapsedTimeS: row.elapsed_time_s,
    avgPaceSPerKm: row.avg_pace_s_per_km,
    elevGainM: row.elev_gain_m == null ? null : Number(row.elev_gain_m),
    elevLossM: row.elev_loss_m == null ? null : Number(row.elev_loss_m),
    maxSpeedMps: row.max_speed_mps == null ? null : Number(row.max_speed_mps),
    avgCadenceSpm: row.avg_cadence_spm == null ? null : Number(row.avg_cadence_spm),
    splits: parseJsonColumn(row.splits, null),
    device: parseJsonColumn(row.device, null),
    weather: parseJsonColumn(row.weather, null),
    effort: row.effort,
    note: row.note,
    completedPlan: toBool(row.completed_plan),
    imported: toBool(row.imported),
    createdAt: row.created_at,
  };
}

/**
 * DB-backed repo for the running module. Every method returns plain JS
 * objects (camelCase, JSON columns parsed) - callers never see raw rows.
 * @param {import('mysql2/promise').Pool} pool
 */
export function createRunningRepo(pool) {
  return {
    // --- settings ---------------------------------------------------
    async getSettings() {
      const [rows] = await pool.query(
        'SELECT program_start, rest_weekday, reminder_hour FROM running_settings WHERE id = 1',
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        programStart: r.program_start instanceof Date ? r.program_start.toISOString().slice(0, 10) : r.program_start,
        restWeekday: r.rest_weekday,
        reminderHour: r.reminder_hour,
      };
    },
    async setSettings({ programStart, restWeekday, reminderHour }) {
      await pool.query(
        `INSERT INTO running_settings (id, program_start, rest_weekday, reminder_hour, updated_at)
         VALUES (1, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE program_start = VALUES(program_start), rest_weekday = VALUES(rest_weekday),
           reminder_hour = VALUES(reminder_hour), updated_at = UTC_TIMESTAMP(3)`,
        [programStart, restWeekday, reminderHour],
      );
    },

    // --- sessions -----------------------------------------------------
    async getSessionByDate(date) {
      const [rows] = await pool.query('SELECT * FROM run_sessions WHERE date = ?', [date]);
      return mapSessionRow(rows[0]);
    },
    async getSessionById(id) {
      const [rows] = await pool.query('SELECT * FROM run_sessions WHERE id = ?', [id]);
      return mapSessionRow(rows[0]);
    },
    async getSessionsBetween(from, to) {
      const [rows] = await pool.query('SELECT * FROM run_sessions WHERE date BETWEEN ? AND ? ORDER BY date', [
        from,
        to,
      ]);
      return rows.map(mapSessionRow);
    },
    async upsertSession(session) {
      await pool.query(
        `INSERT INTO run_sessions (id, date, kind, title, summary, segments, status, source, program_week, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           id = VALUES(id), kind = VALUES(kind), title = VALUES(title), summary = VALUES(summary),
           segments = VALUES(segments), status = VALUES(status), source = VALUES(source),
           program_week = VALUES(program_week), updated_at = UTC_TIMESTAMP(3)`,
        [
          session.id,
          session.date,
          session.kind,
          session.title,
          session.summary ?? null,
          JSON.stringify(session.segments ?? []),
          session.status ?? 'planned',
          session.source ?? 'program',
          session.programWeek ?? null,
        ],
      );
    },
    async markSessionDone(sessionId) {
      await pool.query("UPDATE run_sessions SET status = 'done', updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [
        sessionId,
      ]);
    },

    // --- runs -----------------------------------------------------------
    async getRunByClientId(clientId) {
      const [rows] = await pool.query('SELECT * FROM runs WHERE client_id = ?', [clientId]);
      return mapRunRow(rows[0]);
    },
    async getRunById(id) {
      const [rows] = await pool.query('SELECT * FROM runs WHERE id = ?', [id]);
      return mapRunRow(rows[0]);
    },
    async getRecentRuns(limit = 10) {
      const [rows] = await pool.query('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', [limit]);
      return rows.map(mapRunRow);
    },
    /**
     * Insert or fully update a run's summary fields, keyed by client_id.
     * Returns the run's id (existing or newly generated).
     */
    async upsertRunSummary(run) {
      const existing = await this.getRunByClientId(run.clientId);
      const id = existing?.id || crypto.randomUUID();
      await pool.query(
        `INSERT INTO runs (
           id, client_id, session_id, started_at, duration_s, distance_m, moving_time_s, elapsed_time_s,
           avg_pace_s_per_km, elev_gain_m, elev_loss_m, max_speed_mps, avg_cadence_spm, splits, device, weather,
           effort, note, completed_plan, imported, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           session_id = VALUES(session_id), started_at = VALUES(started_at), duration_s = VALUES(duration_s),
           distance_m = VALUES(distance_m), moving_time_s = VALUES(moving_time_s), elapsed_time_s = VALUES(elapsed_time_s),
           avg_pace_s_per_km = VALUES(avg_pace_s_per_km), elev_gain_m = VALUES(elev_gain_m), elev_loss_m = VALUES(elev_loss_m),
           max_speed_mps = VALUES(max_speed_mps), avg_cadence_spm = VALUES(avg_cadence_spm), splits = VALUES(splits),
           device = VALUES(device), weather = VALUES(weather), effort = VALUES(effort), note = VALUES(note),
           completed_plan = VALUES(completed_plan), imported = VALUES(imported)`,
        [
          id,
          run.clientId,
          run.sessionId ?? null,
          dbTime(run.startedAt),
          run.durationS ?? null,
          run.distanceM ?? null,
          run.movingTimeS ?? null,
          run.elapsedTimeS ?? null,
          run.avgPaceSPerKm ?? null,
          run.elevGainM ?? null,
          run.elevLossM ?? null,
          run.maxSpeedMps ?? null,
          run.avgCadenceSpm ?? null,
          run.splits != null ? JSON.stringify(run.splits) : null,
          run.device != null ? JSON.stringify(run.device) : null,
          run.weather != null ? JSON.stringify(run.weather) : null,
          run.effort ?? null,
          run.note ?? null,
          run.completedPlan ? 1 : 0,
          run.imported ? 1 : 0,
        ],
      );
      return id;
    },
    /** Get-or-create a minimal run row for streaming sample/event chunks that arrive before the final summary. */
    async ensureRunByClientId(clientId) {
      const existing = await this.getRunByClientId(clientId);
      if (existing) return existing.id;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO runs (id, client_id, started_at, completed_plan, imported, created_at)
         VALUES (?, ?, UTC_TIMESTAMP(3), 0, 0, UTC_TIMESTAMP(3))`,
        [id, clientId],
      );
      return id;
    },

    // --- samples / events ------------------------------------------------
    async insertSamplesBatch(runId, samples) {
      if (!samples?.length) return;
      const values = samples.map((s) => [
        runId,
        s.seq,
        s.t_s,
        dbTime(s.ts),
        s.lat ?? null,
        s.lon ?? null,
        s.alt_m ?? null,
        s.h_acc_m ?? null,
        s.v_acc_m ?? null,
        s.speed_mps ?? null,
        s.speed_acc_mps ?? null,
        s.course_deg ?? null,
        s.dist_m ?? null,
        s.cadence_spm ?? null,
        s.pace_s_per_km ?? null,
        s.rel_alt_m ?? null,
        s.steps_total ?? null,
        s.floors_up ?? null,
        s.floors_down ?? null,
        s.segment_index ?? null,
        s.accepted === false ? 0 : 1,
      ]);
      await pool.query(
        `INSERT INTO run_samples (
           run_id, seq, t_s, ts, lat, lon, alt_m, h_acc_m, v_acc_m, speed_mps, speed_acc_mps, course_deg,
           dist_m, cadence_spm, pace_s_per_km, rel_alt_m, steps_total, floors_up, floors_down, segment_index, accepted
         ) VALUES ?
         ON DUPLICATE KEY UPDATE t_s = VALUES(t_s), ts = VALUES(ts), lat = VALUES(lat), lon = VALUES(lon),
           alt_m = VALUES(alt_m), speed_mps = VALUES(speed_mps), dist_m = VALUES(dist_m),
           cadence_spm = VALUES(cadence_spm), pace_s_per_km = VALUES(pace_s_per_km), rel_alt_m = VALUES(rel_alt_m),
           accepted = VALUES(accepted)`,
        [values],
      );
    },
    async insertEventsBatch(runId, events) {
      if (!events?.length) return;
      const values = events.map((e) => [runId, e.seq, e.t_s, dbTime(e.ts), e.type, e.data != null ? JSON.stringify(e.data) : null]);
      await pool.query(
        `INSERT INTO run_events (run_id, seq, t_s, ts, type, data) VALUES ?
         ON DUPLICATE KEY UPDATE t_s = VALUES(t_s), ts = VALUES(ts), type = VALUES(type), data = VALUES(data)`,
        [values],
      );
    },
    async getSamples(runId, { every = 1, acceptedOnly = true } = {}) {
      const [rows] = await pool.query('SELECT * FROM run_samples WHERE run_id = ? ORDER BY seq', [runId]);
      const accepted = acceptedOnly ? rows.filter((r) => toBool(r.accepted)) : rows;
      const filtered = every > 1 ? accepted.filter((_, i) => i % every === 0) : accepted;
      return filtered.map((r) => ({
        seq: r.seq,
        t_s: Number(r.t_s),
        ts: r.ts,
        lat: r.lat,
        lon: r.lon,
        alt_m: r.alt_m,
        h_acc_m: r.h_acc_m,
        v_acc_m: r.v_acc_m,
        speed_mps: r.speed_mps,
        speed_acc_mps: r.speed_acc_mps,
        course_deg: r.course_deg,
        dist_m: r.dist_m,
        cadence_spm: r.cadence_spm,
        pace_s_per_km: r.pace_s_per_km,
        rel_alt_m: r.rel_alt_m,
        steps_total: r.steps_total,
        floors_up: r.floors_up,
        floors_down: r.floors_down,
        segment_index: r.segment_index,
        accepted: toBool(r.accepted),
      }));
    },
    async getEvents(runId) {
      const [rows] = await pool.query('SELECT * FROM run_events WHERE run_id = ? ORDER BY seq', [runId]);
      return rows.map((r) => ({ seq: r.seq, t_s: Number(r.t_s), ts: r.ts, type: r.type, data: parseJsonColumn(r.data, null) }));
    },
    async storeAnalysisSummary(runId, summary) {
      await pool.query(
        `UPDATE runs SET moving_time_s = ?, elapsed_time_s = ?, elev_gain_m = ?, elev_loss_m = ?,
           max_speed_mps = ?, avg_cadence_spm = ? WHERE id = ?`,
        [
          summary.movingTimeS ?? null,
          summary.elapsedTimeS ?? null,
          summary.elevGainM ?? null,
          summary.elevLossM ?? null,
          summary.maxSpeedMps ?? null,
          summary.avgCadenceSpm ?? null,
          runId,
        ],
      );
    },

    // --- briefs / cues / decisions / reminders --------------------------
    async getBrief(sessionId) {
      const [rows] = await pool.query('SELECT brief, model, input_hash, created_at FROM run_briefs WHERE session_id = ?', [
        sessionId,
      ]);
      if (!rows.length) return null;
      return { brief: parseJsonColumn(rows[0].brief, {}), model: rows[0].model, inputHash: rows[0].input_hash, createdAt: rows[0].created_at };
    },
    /** Newest brief written for the same workout (any session), for reuse. */
    async getBriefByInputHash(inputHash) {
      const [rows] = await pool.query(
        'SELECT brief, model, input_hash, created_at FROM run_briefs WHERE input_hash = ? ORDER BY created_at DESC LIMIT 1',
        [inputHash],
      );
      if (!rows.length) return null;
      return { brief: parseJsonColumn(rows[0].brief, {}), model: rows[0].model, inputHash: rows[0].input_hash, createdAt: rows[0].created_at };
    },
    async insertBrief(sessionId, brief, model, inputHash = null) {
      await pool.query(
        `INSERT INTO run_briefs (session_id, brief, model, input_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE brief = VALUES(brief), model = VALUES(model), input_hash = VALUES(input_hash),
           created_at = UTC_TIMESTAMP(3)`,
        [sessionId, JSON.stringify(brief), model, inputHash],
      );
    },
    async insertCue(cue) {
      await pool.query(
        `INSERT INTO run_cues (run_client_id, session_id, elapsed_s, trigger_type, text, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [cue.runClientId, cue.sessionId ?? null, cue.elapsedS, cue.trigger, cue.text ?? null, cue.source],
      );
    },
    async getRecentCues(runClientId, limit = 3) {
      const [rows] = await pool.query(
        'SELECT text FROM run_cues WHERE run_client_id = ? ORDER BY id DESC LIMIT ?',
        [runClientId, limit],
      );
      return rows.map((r) => r.text).filter(Boolean);
    },
    async insertPlanDecision(decision) {
      await pool.query(
        `INSERT INTO plan_decisions (at, actor, action, reason, before_state, after_state) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          decision.at ?? new Date(),
          decision.actor,
          decision.action,
          decision.reason ?? null,
          decision.before != null ? JSON.stringify(decision.before) : null,
          decision.after != null ? JSON.stringify(decision.after) : null,
        ],
      );
    },
    async getRecentPlanDecisions(limit = 10) {
      const [rows] = await pool.query('SELECT * FROM plan_decisions ORDER BY id DESC LIMIT ?', [limit]);
      return rows.map((r) => ({
        at: r.at,
        actor: r.actor,
        action: r.action,
        reason: r.reason,
        before: parseJsonColumn(r.before_state, null),
        after: parseJsonColumn(r.after_state, null),
      }));
    },
    async getRemindersBetween(from, to) {
      const [rows] = await pool.query(
        'SELECT id, fire_at, title, body, session_id FROM running_reminders WHERE fire_at BETWEEN ? AND ? ORDER BY fire_at',
        [dbTime(from), dbTime(to)],
      );
      return rows.map((r) => ({ id: r.id, fireAt: r.fire_at, title: r.title, body: r.body, sessionId: r.session_id }));
    },
    async insertReminders(reminders) {
      if (!reminders.length) return;
      const values = reminders.map((r) => [dbTime(r.fireAt), r.title, r.body, r.sessionId ?? null, r.generatedBy]);
      await pool.query(
        'INSERT INTO running_reminders (fire_at, title, body, session_id, generated_by, created_at) VALUES ?',
        [values.map((v) => [...v, new Date()])],
      );
    },
  };
}
