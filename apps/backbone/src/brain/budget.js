import { calcCostUsd } from './models.js';

/** Thrown when a new Olaf call would (or already does) exceed the monthly budget. */
export class OlafOverBudget extends Error {
  constructor(message = 'Olaf monthly AI budget exceeded') {
    super(message);
    this.name = 'OlafOverBudget';
    this.statusCode = 503;
    this.code = 'olaf_over_budget';
  }
}

/**
 * ai_usage-backed budget tracker.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{aiMonthlyBudgetUsd: number}} config
 */
export function createBudget(pool, config) {
  return {
    /** @returns {Promise<number>} total USD spent so far this calendar month (UTC). */
    async monthTotalUsd() {
      const [rows] = await pool.query(
        "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE at >= DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-01 00:00:00')",
      );
      return Number(rows[0].total);
    },

    /** Throws OlafOverBudget if this month's spend already meets/exceeds the budget. */
    async assertWithinBudget() {
      const total = await this.monthTotalUsd();
      if (total >= config.aiMonthlyBudgetUsd) throw new OlafOverBudget();
    },

    /**
     * Record a completed call's usage and cost.
     * @param {{model: string, purpose: string, usage: object}} args
     * @returns {Promise<number>} cost in USD
     */
    async logUsage({ model, purpose, usage }) {
      const cost = calcCostUsd(model, usage || {});
      await pool.query(
        'INSERT INTO ai_usage (at, model, purpose, input_tokens, output_tokens, cache_read, cache_write, cost_usd) VALUES (UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?)',
        [
          model,
          purpose,
          usage?.input_tokens || 0,
          usage?.output_tokens || 0,
          usage?.cache_read_input_tokens || 0,
          usage?.cache_creation_input_tokens || 0,
          cost,
        ],
      );
      return cost;
    },
  };
}
