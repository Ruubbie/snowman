/**
 * Pure helpers for the core admin API. No I/O.
 */

/**
 * Plain-text preview of a stored message `content` (a string, or an array
 * of Anthropic content blocks).
 * @param {unknown} content
 * @param {number} [max]
 */
export function messagePreview(content, max = 160) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (block?.type === 'text' && block.text) parts.push(block.text);
      else if (block?.type === 'tool_use') parts.push(`[tool: ${block.name}]`);
      else if (block?.type === 'tool_result') parts.push('[tool result]');
    }
    text = parts.join(' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** First day of the UTC month containing `date` (the budget month). */
export function monthStartUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
