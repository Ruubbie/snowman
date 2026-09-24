import crypto from 'node:crypto';

/**
 * Deterministic client_id for a text-imported run, so re-importing the same
 * export twice is idempotent (upsertRunSummary is keyed on client_id).
 * @param {{startedAt: string, distance_m: number, duration_s: number}} run
 */
function importedClientId(run) {
  const hash = crypto
    .createHash('sha1')
    .update(`${run.startedAt}|${run.distance_m}|${run.duration_s}`)
    .digest('hex');
  return `imported-${hash}`;
}

/**
 * Apply a parsed import (see import.js) to the repo: update settings (if
 * the export carried a full settings block) and upsert every run.
 * @param {ReturnType<typeof import('./repo.js').createRunningRepo>} repo
 * @param {{settings: object, runs: object[], unparsed: string[]}} parsed
 * @returns {Promise<{settingsApplied: boolean, runsImported: number, unparsed: string[]}>}
 */
export async function applyImport(repo, parsed) {
  let settingsApplied = false;
  const s = parsed.settings || {};
  if (s.programStart && s.restWeekday != null && s.reminderHour != null) {
    await repo.setSettings({ programStart: s.programStart, restWeekday: s.restWeekday, reminderHour: s.reminderHour });
    settingsApplied = true;
  }

  let runsImported = 0;
  for (const run of parsed.runs) {
    await repo.upsertRunSummary({
      clientId: importedClientId(run),
      sessionId: null,
      startedAt: run.startedAt,
      durationS: run.duration_s,
      distanceM: run.distance_m,
      avgPaceSPerKm: run.avg_pace_s_per_km,
      splits: run.splits_s,
      effort: run.effort,
      note: run.note,
      completedPlan: Boolean(run.completed_plan),
      imported: true,
    });
    runsImported++;
  }

  return { settingsApplied, runsImported, unparsed: parsed.unparsed || [] };
}

export { importedClientId };
