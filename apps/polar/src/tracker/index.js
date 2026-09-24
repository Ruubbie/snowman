// Picks the tracker implementation. The simulator is ONLY for the browser:
// on iPhone the native RunTracker module must be linked, otherwise the app
// reports `unavailable` and the run screen refuses to start (never fake data).
// Both implementations expose the same API and emit 'tick'/'cue'/'state'/'gps'.
import { Platform } from 'react-native';
import runTrackerNative from '../../modules/run-tracker/index.js';
import * as simulator from './simulator.js';

export const isSimulator = Platform.OS === 'web';
export const isNative = !isSimulator && !!runTrackerNative.isAvailable;
/** Non-null when real tracking can't work on this device. */
export const unavailableReason = isSimulator || isNative
  ? null
  : 'The native run tracker is missing from this build, so Polar cannot record GPS or speak cues. Install the latest build from GitHub.';

function fail() {
  throw new Error(unavailableReason);
}
const unavailable = {
  configure() {},
  prepare: async () => {},
  cancel() {},
  prefetch() {},
  start: fail,
  pause() {},
  resume() {},
  finish: fail,
  getUnfinishedRuns: async () => [],
  addListener: () => ({ remove() {} }),
  removeAllListeners() {},
};

const impl = isSimulator ? simulator : isNative ? runTrackerNative : unavailable;

export const configure = impl.configure;
export const prepare = impl.prepare;
export const cancel = impl.cancel;
export const prefetch = impl.prefetch;
export const start = impl.start;
export const pause = impl.pause;
export const resume = impl.resume;
export const finish = impl.finish;
export const getUnfinishedRuns = impl.getUnfinishedRuns;
export const addListener = impl.addListener;
export const removeAllListeners = impl.removeAllListeners;

export default { isNative, isSimulator, unavailableReason, configure, prepare, cancel, prefetch, start, pause, resume, finish, getUnfinishedRuns, addListener, removeAllListeners };
