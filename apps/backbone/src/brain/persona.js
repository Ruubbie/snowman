import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load Olaf's persona text: PERSONA_FILE if set (relative to the backbone
 * app root), else data/persona.md, falling back to the committed placeholder
 * at config/persona.example.md when neither exists yet.
 * @param {{personaFile?: string}} config
 * @param {{root?: string}} [opts]
 * @returns {Promise<string>}
 */
export async function loadPersona(config, opts = {}) {
  const root = opts.root || APP_ROOT;
  const primary = config.personaFile
    ? path.resolve(root, config.personaFile)
    : path.join(root, 'data', 'persona.md');
  try {
    return await readFile(primary, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return readFile(path.join(root, 'config', 'persona.example.md'), 'utf8');
  }
}
