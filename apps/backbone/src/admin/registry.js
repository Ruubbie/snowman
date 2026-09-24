/**
 * Where modules plug into the dashboard home: each module registers one
 * overview provider (its card's stats). GET /v1/admin/overview calls them all;
 * a failing module shows up as {error} instead of breaking the whole overview.
 */
export function createAdminRegistry() {
  /** @type {Map<string, () => Promise<object>>} */
  const overviews = new Map();
  return {
    /**
     * @param {string} moduleName
     * @param {() => Promise<object>} provider
     */
    registerOverview(moduleName, provider) {
      overviews.set(moduleName, provider);
    },
    async collectOverviews(logger) {
      const out = {};
      await Promise.all(
        [...overviews].map(async ([name, provider]) => {
          try {
            out[name] = await provider();
          } catch (err) {
            logger?.error({ err, module: name }, 'module overview failed');
            out[name] = { error: 'overview_failed' };
          }
        }),
      );
      return out;
    },
  };
}
