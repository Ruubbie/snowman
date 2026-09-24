import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSource, suspectFlags, decorateRun } from '../src/adminDerive.js';

test('runSource tells imported, simulated, native and unknown runs apart', () => {
  assert.equal(runSource({ imported: true, sampleCount: 0 }), 'imported');
  assert.equal(runSource({ device: { simulated: true }, sampleCount: 300, nativeSampleCount: 300 }), 'simulated');
  assert.equal(runSource({ sampleCount: 300, nativeSampleCount: 0 }), 'simulated');
  assert.equal(runSource({ sampleCount: 300, nativeSampleCount: 290 }), 'native');
  assert.equal(runSource({ sampleCount: 0 }), 'unknown');
});

test('suspectFlags lists every reason a run looks fake', () => {
  assert.deepEqual(suspectFlags({ source: 'native', sampleCount: 10, distanceM: 2000, duplicateCount: 0 }), []);
  assert.deepEqual(suspectFlags({ source: 'simulated', sampleCount: 0, distanceM: 20, duplicateCount: 1 }), [
    'no_samples',
    'simulated',
    'too_short',
    'duplicate_time',
  ]);
  assert.deepEqual(suspectFlags({ source: 'native', sampleCount: 5, distanceM: null }), ['too_short']);
});

test('decorateRun adds source and suspect', () => {
  const run = decorateRun({ imported: true, sampleCount: 0, distanceM: 3000 });
  assert.equal(run.source, 'imported');
  assert.deepEqual(run.suspect, ['no_samples']);
});
