import { EventEmitter, requireOptionalNativeModule } from 'expo-modules-core';

// Native module is only present on iOS (see expo-module.config.json). On other
// platforms (web, Android, Expo Go) this is null and every call below is a
// safe no-op so the JS app can render without crashing.
const RunTrackerNative = requireOptionalNativeModule('RunTracker');

const emitter = RunTrackerNative ? new EventEmitter(RunTrackerNative) : null;

export const isAvailable = !!RunTrackerNative;

export function configure(options) {
  if (!RunTrackerNative) return;
  const { baseUrl = null, token = null } = options || {};
  return RunTrackerNative.configure({ baseUrl, token });
}

export async function prepare() {
  if (!RunTrackerNative) return;
  return RunTrackerNative.prepare();
}

/** Stops the GPS warm-up if the run never started. */
export function cancel() {
  return RunTrackerNative?.cancel?.();
}

export function start(options) {
  return RunTrackerNative?.start(options);
}

export function pause() {
  return RunTrackerNative?.pause();
}

export function resume() {
  return RunTrackerNative?.resume();
}

export async function finish() {
  if (!RunTrackerNative) return { run: null, samples: [], events: [] };
  return RunTrackerNative.finish();
}

export async function getUnfinishedRuns() {
  if (!RunTrackerNative) return [];
  return RunTrackerNative.getUnfinishedRuns();
}

// event: 'tick' | 'cue' | 'state' | 'gps'
export function addListener(event, listener) {
  if (!emitter) return { remove() {} };
  return emitter.addListener(event, listener);
}

export function removeAllListeners(event) {
  emitter?.removeAllListeners(event);
}

export default {
  isAvailable,
  configure,
  prepare,
  cancel,
  start,
  pause,
  resume,
  finish,
  getUnfinishedRuns,
  addListener,
  removeAllListeners,
};
