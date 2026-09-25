import { localDateString } from '@snowman/shared';

/** Only fresh runs count; the first Health sync goes back 90 days and must not re-open old history. */
const RECENT_MS = 3 * 86400000;
/** A run already stored within this long of the workout's start is the same run (e.g. the old tracker). */
const SAME_RUN_MS = 10 * 60000;

/**
 * Apple Health running workouts (recorded with the Fitness app, a Watch or any
 * app that writes to Health) become runs: linked to that day's planned session,
 * which is then done. Returns the ids of the runs it created.
 *
 * @param {object} repo running repo
 * @param {object[]} workouts rows from /v1/health/import
 * @param {{now: Date, tzName: string}} opts
 */
export async function importHealthRuns(repo, workouts, { now, tzName }) {
  const fresh = workouts.filter(
    (w) => w.activity === 'running' && now.getTime() - new Date(w.start).getTime() < RECENT_MS,
  );
  if (!fresh.length) return [];

  const known = await repo.getRecentRuns(20);
  const created = [];
  for (const w of fresh) {
    const clientId = `hk-${w.uuid}`;
    const start = new Date(w.start);
    const sameRun = known.some(
      (r) => r.clientId === clientId || Math.abs(new Date(r.startedAt).getTime() - start.getTime()) < SAME_RUN_MS,
    );
    if (sameRun) continue;

    const session = await repo.getSessionByDate(localDateString(start, tzName));
    const planned = session && session.kind !== 'rest' && session.status === 'planned' ? session : null;
    const km = w.distance_m ? w.distance_m / 1000 : null;
    const id = await repo.upsertRunSummary({
      clientId,
      sessionId: planned?.id ?? null,
      startedAt: w.start,
      durationS: Math.round(w.duration_s),
      elapsedTimeS: Math.round((new Date(w.end).getTime() - start.getTime()) / 1000),
      distanceM: w.distance_m ?? null,
      avgPaceSPerKm: km ? w.duration_s / km : null,
      device: { source: w.source ?? 'Apple Health', avgHr: w.avg_hr ?? null, maxHr: w.max_hr ?? null },
      completedPlan: Boolean(planned),
      imported: true,
    });
    if (planned) await repo.markSessionDone(planned.id);
    known.push({ clientId, startedAt: w.start });
    created.push(id);
  }
  return created;
}
