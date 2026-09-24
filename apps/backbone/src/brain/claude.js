import Anthropic from '@anthropic-ai/sdk';

/** Thrown whenever Olaf is called with no configured Anthropic client. */
export class OlafUnavailable extends Error {
  constructor(message = 'Olaf is unavailable (no ANTHROPIC_API_KEY configured)') {
    super(message);
    this.name = 'OlafUnavailable';
    this.statusCode = 503;
    this.code = 'olaf_unavailable';
  }
}

/**
 * Thin wrapper around the Anthropic SDK. A fake `client` (any object with a
 * `messages.create` method) can be injected for tests.
 * Keys that aren't scoped to a Console workspace must name one per request,
 * so ANTHROPIC_WORKSPACE_ID is sent as the `anthropic-workspace-id` header.
 * @param {{anthropicApiKey?: string, anthropicWorkspaceId?: string}} config
 * @param {{client?: object}} [opts]
 */
export function createBrainClient(config, opts = {}) {
  const injected = opts.client;
  const available = Boolean(injected) || Boolean(config.anthropicApiKey);
  const defaultHeaders = config.anthropicWorkspaceId
    ? { 'anthropic-workspace-id': config.anthropicWorkspaceId }
    : undefined;
  const anthropic =
    injected || (config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey, defaultHeaders }) : null);

  return {
    available,
    /**
     * @param {object} params Anthropic Messages API params (model, max_tokens, system, messages, tools, ...)
     */
    async createMessage(params) {
      if (!available) throw new OlafUnavailable();
      return anthropic.messages.create(params);
    },
  };
}
