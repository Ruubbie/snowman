/**
 * Shared Fastify/JSON Schemas reused by more than one module.
 */

/** JSON Schema for a single uploaded run (POST /v1/running/runs body). */
export const runUploadSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clientId', 'startedAt', 'durationS', 'distanceM'],
  properties: {
    clientId: { type: 'string', minLength: 1, maxLength: 191 },
    sessionId: { type: ['string', 'null'] },
    startedAt: { type: 'string', format: 'date-time' },
    durationS: { type: 'integer', minimum: 0 },
    distanceM: { type: 'integer', minimum: 0 },
    avgPaceSPerKm: { type: ['integer', 'null'] },
    splits: { type: ['array', 'null'], items: { type: 'number' } },
    route: { type: ['object', 'array', 'null'] },
    effort: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
    note: { type: ['string', 'null'], maxLength: 1000 },
    completedPlan: { type: 'boolean' },
    imported: { type: 'boolean' },
  },
};

export default { runUploadSchema };
