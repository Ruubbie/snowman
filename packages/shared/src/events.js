/**
 * Canonical event type names published on the Snowman event bus.
 * Modules should import from here rather than hardcoding strings.
 */
export const EVENTS = {
  RUNNING_PLAN_CHANGED: 'running.plan.changed',
  RUNNING_RUN_COMPLETED: 'running.run.completed',
  RUNNING_DEBRIEF_READY: 'running.debrief.ready',
  OLAF_CONFIRMATION_REQUESTED: 'olaf.confirmation.requested',
};

/**
 * "Running card" kinds returned by GET /v1/running/today.
 */
export const RUNNING_CARD_KINDS = {
  PLANNED_RUN: 'planned_run',
  RECOVERY_WALK: 'recovery_walk',
  REST_DAY: 'rest_day',
  SESSION_DONE: 'session_done',
  SESSION_MOVED: 'session_moved',
  SESSION_REPLACED: 'session_replaced',
};
