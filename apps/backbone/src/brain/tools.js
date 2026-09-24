/**
 * @typedef {Object} ToolDef
 * @property {string} name
 * @property {string} description
 * @property {object} input_schema JSON Schema with additionalProperties:false
 * @property {'read'|'write'|'confirm'} risk
 * @property {(input: object, ctx: object) => Promise<any>|any} handler
 */

/** Registry of Olaf tools, keyed by name, listed sorted for stable prompt caching. */
export function createToolRegistry() {
  /** @type {Map<string, ToolDef>} */
  const tools = new Map();

  return {
    /** @param {ToolDef} tool */
    register(tool) {
      if (!tool?.name) throw new Error('tool requires a name');
      if (!['read', 'write', 'confirm'].includes(tool.risk)) {
        throw new Error(`tool "${tool.name}" has invalid risk "${tool.risk}"`);
      }
      tools.set(tool.name, tool);
    },
    /** @returns {ToolDef|undefined} */
    get(name) {
      return tools.get(name);
    },
    /** @returns {ToolDef[]} sorted by name */
    list() {
      return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    /** @returns {{name:string, description:string, input_schema:object}[]} Anthropic tool params */
    toApiTools() {
      return this.list().map(({ name, description, input_schema }) => ({ name, description, input_schema }));
    },
  };
}
