const CHUNK = 500;
const toDate = (v) => (v == null ? null : new Date(v));

/** @param {import('mysql2/promise').Pool} pool */
export function createHealthRepo(pool) {
  async function insertChunks(sql, rows) {
    for (let i = 0; i < rows.length; i += CHUNK) await pool.query(sql, [rows.slice(i, i + CHUNK)]);
  }

  return {
    async upsertSamples(samples) {
      await insertChunks(
        `INSERT INTO health_samples (uuid, type, start_at, end_at, value, unit, source) VALUES ?
         ON DUPLICATE KEY UPDATE value = VALUES(value), start_at = VALUES(start_at), end_at = VALUES(end_at)`,
        samples.map((s) => [s.uuid, s.type, toDate(s.start), toDate(s.end), s.value, s.unit ?? null, s.source ?? null]),
      );
    },
    async upsertWorkouts(workouts) {
      const now = new Date();
      await insertChunks(
        `INSERT INTO health_workouts (uuid, activity, start_at, end_at, duration_s, distance_m, energy_kcal, avg_hr, max_hr, source, imported_at)
         VALUES ? ON DUPLICATE KEY UPDATE duration_s = VALUES(duration_s), distance_m = VALUES(distance_m),
           energy_kcal = VALUES(energy_kcal), avg_hr = VALUES(avg_hr), max_hr = VALUES(max_hr)`,
        workouts.map((w) => [
          w.uuid, w.activity, toDate(w.start), toDate(w.end), w.duration_s, w.distance_m ?? null,
          w.energy_kcal ?? null, w.avg_hr ?? null, w.max_hr ?? null, w.source ?? null, now,
        ]),
      );
    },
    /** Per UTC day and type since `since` (sleep counts on the day it ends). */
    async dailyRows(since) {
      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(end_at, '%Y-%m-%d') AS date, type, SUM(value) AS sum, AVG(value) AS avg
         FROM health_samples WHERE end_at >= ? GROUP BY date, type`,
        [since],
      );
      return rows;
    },
    async workoutsSince(since) {
      const [rows] = await pool.query(
        `SELECT activity, start_at, duration_s, distance_m, energy_kcal, avg_hr, max_hr
         FROM health_workouts WHERE start_at >= ? ORDER BY start_at DESC`,
        [since],
      );
      return rows;
    },
  };
}
