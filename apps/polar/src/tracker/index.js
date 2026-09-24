// Picks the native RunTracker module on iOS (when it's actually present -
// e.g. not in Expo Go), else falls back to the web/JS simulator. Both sides
// implement the exact same API: configure/prepare/start/pause/resume/
// finish/getUnfinishedRuns/addListener/removeAllListeners, and emit the
// same 'tick'/'cue'/'state'/'gps' events - see PROGRESS.md step 2 spec.
import { Platform } from 'react-native';
import runTrackerNative from '../../modules/run-tracker/index.js';
import * as simulator from './simulator.js';

export const isNative = Platform.OS === 'ios' && !!runTrackerNative.isAvailable;
const impl = isNative ? runTrackerNative : simulator;

export const configure = impl.configure;
export const prepare = impl.prepare;
export const cancel = impl.cancel;
export const start = impl.start;
export const pause = impl.pause;
export const resume = impl.resume;
export const finish = impl.finish;
export const getUnfinishedRuns = impl.getUnfinishedRuns;
export const addListener = impl.addListener;
export const removeAllListeners = impl.removeAllListeners;

export default { isNative, configure, prepare, cancel, start, pause, resume, finish, getUnfinishedRuns, addListener, removeAllListeners };
