/**
 * Model tiers and USD-per-1M-token pricing. Olaf always uses one of two
 * tiers: "fast" for latency-sensitive/cheap calls, "smart" for reasoning.
 */

/** USD per 1M tokens, input/output, for the models Snowman ships with. */
export const PRICE_TABLE = {
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  'claude-sonnet-5': { inputPerM: 2, outputPerM: 10 },
  'claude-opus-5-5': { inputPerM: 5, outputPerM: 25 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * @param {{olafModelFast: string, olafModelSmart: string}} config
 * @returns {{fast: string, smart: string}}
 */
export function modelTiers(config) {
  return { fast: config.olafModelFast, smart: config.olafModelSmart };
}

/**
 * Compute the USD cost of one API call from its reported usage.
 * Unknown models cost 0 (rather than throwing) so custom/overridden model
 * ids never crash the budget path - they just aren't priced.
 * @param {string} model
 * @param {{input_tokens?:number, output_tokens?:number, cache_read_input_tokens?:number, cache_creation_input_tokens?:number}} usage
 * @returns {number}
 */
export function calcCostUsd(model, usage) {
  const price = PRICE_TABLE[model];
  if (!price) return 0;
  const input = (usage.input_tokens || 0) * (price.inputPerM / 1e6);
  const output = (usage.output_tokens || 0) * (price.outputPerM / 1e6);
  const cacheRead = (usage.cache_read_input_tokens || 0) * (price.inputPerM * CACHE_READ_MULTIPLIER / 1e6);
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * (price.inputPerM * CACHE_WRITE_MULTIPLIER / 1e6);
  return input + output + cacheRead + cacheWrite;
}
