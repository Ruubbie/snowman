/**
 * Contract for run telemetry produced by a tracker client (today: the
 * iPhone RunCoach export importer; later: the Swift Snowball tracker).
 * These are plain Fastify/JSON Schemas - the source of truth for what a
 * tracker must send to POST /v1/running/runs and
 * POST /v1/running/runs/:clientId/samples.
 *
 * Units: distances in meters, speeds in meters/second, time offsets in
 * seconds since the run started (moving clock unless noted), timestamps as
 * ISO-8601 UTC. Any sensor field may be null when the device didn't have
 * that reading.
 */

/** One ~1Hz GPS/motion sample. */
export const runSampleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['seq', 't_s'],
  properties: {
    seq: { type: 'integer', minimum: 0, description: 'monotonically increasing sample index within the run' },
    t_s: { type: 'number', description: 'elapsed moving-clock seconds since run start' },
    ts: { type: ['string', 'null'], format: 'date-time', description: 'wall-clock UTC timestamp of this sample' },
    lat: { type: ['number', 'null'] },
    lon: { type: ['number', 'null'] },
    alt_m: { type: ['number', 'null'], description: 'GPS altitude' },
    h_acc_m: { type: ['number', 'null'], description: 'horizontal accuracy radius' },
    v_acc_m: { type: ['number', 'null'], description: 'vertical accuracy' },
    speed_mps: { type: ['number', 'null'] },
    speed_acc_mps: { type: ['number', 'null'] },
    course_deg: { type: ['number', 'null'], description: 'heading, 0-360' },
    dist_m: { type: ['number', 'null'], description: 'cumulative distance at this sample' },
    cadence_spm: { type: ['number', 'null'], description: 'steps per minute' },
    pace_s_per_km: { type: ['number', 'null'], description: "phone's own 30s-window pace estimate" },
    rel_alt_m: { type: ['number', 'null'], description: 'barometer-relative altitude, preferred over alt_m for elevation' },
    steps_total: { type: ['integer', 'null'] },
    floors_up: { type: ['integer', 'null'] },
    floors_down: { type: ['integer', 'null'] },
    segment_index: { type: ['integer', 'null'], description: 'index into the planned session.segments this sample falls in' },
    accepted: { type: 'boolean', default: true, description: "false if the phone's GPS filter rejected this point (kept for audit, excluded from analysis)" },
  },
};

/** A discrete moment during a run (pause, split, cue spoken, ...). */
export const runEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['seq', 't_s', 'type'],
  properties: {
    seq: { type: 'integer', minimum: 0 },
    t_s: { type: 'number' },
    ts: { type: ['string', 'null'], format: 'date-time' },
    type: {
      type: 'string',
      enum: [
        'start',
        'pause',
        'resume',
        'segment_start',
        'segment_end',
        'km_split',
        'cue_spoken',
        'gps_lost',
        'gps_recovered',
        'finish',
      ],
    },
    data: { type: ['object', 'null'] },
  },
};

/** Device info attached to a run, stored as-is in runs.device. */
export const runDeviceSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    model: { type: 'string' },
    osVersion: { type: 'string' },
    appVersion: { type: 'string' },
  },
};

/** Summary fields the tracker reports about the run itself. */
export const runSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clientId', 'startedAt', 'durationS', 'distanceM'],
  properties: {
    clientId: { type: 'string', minLength: 1, maxLength: 191 },
    sessionId: { type: ['string', 'null'] },
    startedAt: { type: 'string', format: 'date-time' },
    durationS: { type: 'integer', minimum: 0 },
    distanceM: { type: 'integer', minimum: 0 },
    movingTimeS: { type: ['integer', 'null'] },
    elapsedTimeS: { type: ['integer', 'null'] },
    avgPaceSPerKm: { type: ['integer', 'null'] },
    elevGainM: { type: ['number', 'null'] },
    elevLossM: { type: ['number', 'null'] },
    maxSpeedMps: { type: ['number', 'null'] },
    avgCadenceSpm: { type: ['number', 'null'] },
    splits: { type: ['array', 'null'], items: { type: 'number' } },
    device: { type: ['object', 'null'] },
    weather: { type: ['object', 'null'] },
    effort: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
    note: { type: ['string', 'null'], maxLength: 1000 },
    completedPlan: { type: 'boolean' },
    imported: { type: 'boolean' },
  },
};

/** Full body of POST /v1/running/runs. */
export const runUploadBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['run'],
  properties: {
    run: runSummarySchema,
    samples: { type: 'array', items: runSampleSchema, default: [] },
    events: { type: 'array', items: runEventSchema, default: [] },
  },
};

/** Body of POST /v1/running/runs/:clientId/samples (chunked upload). */
export const runSamplesChunkBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['samples'],
  properties: {
    samples: { type: 'array', items: runSampleSchema, minItems: 1 },
    events: { type: 'array', items: runEventSchema, default: [] },
  },
};

export default {
  runSampleSchema,
  runEventSchema,
  runDeviceSchema,
  runSummarySchema,
  runUploadBodySchema,
  runSamplesChunkBodySchema,
};
