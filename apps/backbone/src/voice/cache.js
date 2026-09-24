import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ID_RE = /^[a-f0-9]{64}$/;

/** @param {string} id */
export function isAudioId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/**
 * Content-addressed disk cache of <sha256>.wav files. "LRU-ish": reads
 * touch the file's mtime, and when the directory grows past maxBytes the
 * oldest files are removed until it is back under ~80% of the limit.
 *
 * @param {{dir: string, maxBytes: number, logger?: {warn: Function}}} opts
 */
export function createAudioCache({ dir, maxBytes, logger }) {
  let knownBytes = null; // lazily computed on first write
  let dirReady = null;
  let cleaning = null;

  const pathFor = (id) => path.join(dir, `${id}.wav`);

  function ensureDir() {
    dirReady ??= fsp.mkdir(dir, { recursive: true }).catch((err) => {
      dirReady = null;
      throw err;
    });
    return dirReady;
  }

  async function listFiles() {
    let names;
    try {
      names = await fsp.readdir(dir);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const files = [];
    for (const name of names) {
      if (!name.endsWith('.wav')) continue;
      try {
        const st = await fsp.stat(path.join(dir, name));
        files.push({ name, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        // removed meanwhile
      }
    }
    return files;
  }

  async function cleanup() {
    const files = await listFiles();
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > maxBytes) {
      const target = maxBytes * 0.8;
      files.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const f of files) {
        if (total <= target) break;
        try {
          await fsp.unlink(path.join(dir, f.name));
          total -= f.size;
        } catch (err) {
          logger?.warn?.({ err, file: f.name }, 'voice cache: could not remove file');
        }
      }
    }
    knownBytes = total;
  }

  return {
    dir,
    pathFor,

    /** @returns {{path: string, size: number}|null} */
    stat(id) {
      if (!isAudioId(id)) return null;
      try {
        const st = fs.statSync(pathFor(id));
        return { path: pathFor(id), size: st.size };
      } catch {
        return null;
      }
    },

    /** Mark as recently used (best effort, async). */
    touch(id) {
      const now = new Date();
      fsp.utimes(pathFor(id), now, now).catch(() => {});
    },

    /** Atomically write (tmp + rename), then trim the cache if needed. */
    async write(id, buffer) {
      await ensureDir();
      const final = pathFor(id);
      const tmp = `${final}.${process.pid}.${Date.now()}.tmp`;
      await fsp.writeFile(tmp, buffer);
      try {
        await fsp.rename(tmp, final);
      } catch (err) {
        await fsp.unlink(tmp).catch(() => {});
        // Windows can refuse to replace a file that is being read; the existing copy is identical.
        if (!fs.existsSync(final)) throw err;
      }
      if (knownBytes === null) {
        await (cleaning ??= cleanup().finally(() => (cleaning = null)));
      } else {
        knownBytes += buffer.length;
        if (knownBytes > maxBytes) await (cleaning ??= cleanup().finally(() => (cleaning = null)));
      }
      return final;
    },

    /** Test/diagnostic helper. */
    async totalBytes() {
      return (await listFiles()).reduce((sum, f) => sum + f.size, 0);
    },

    cleanup,
  };
}
