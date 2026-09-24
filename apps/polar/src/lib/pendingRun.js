// Tiny in-memory handoff between /run and /run/summary: a just-finished run's
// {run, samples, events} is too large to serialize through router params, so
// it's stashed here for the duration of that same-process navigation.
let pending = null;

export function setPendingRun(data) {
  pending = data;
}

export function getPendingRun() {
  return pending;
}

export function clearPendingRun() {
  pending = null;
}

export default { setPendingRun, getPendingRun, clearPendingRun };
