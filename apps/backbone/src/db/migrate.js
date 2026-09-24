import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Run all pending .sql migrations from a set of directories, in order,
 * tracking applied migrations in schema_migrations(id, applied_at).
 * Each migration's tracking id is `${dirLabel}/${filename}` so files with
 * the same name in different modules don't collide.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{label: string, dir: string}[]} migrationSources
 * @returns {Promise<string[]>} ids of migrations that were newly applied
 */
export async function runMigrations(pool, migrationSources) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await pool.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));
  const newlyApplied = [];

  for (const source of migrationSources) {
    let files = [];
    try {
      files = (await readdir(source.dir)).filter((f) => f.endsWith('.sql')).sort();
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }

    for (const file of files) {
      const id = `${source.label}/${file}`;
      if (applied.has(id)) continue;

      const sql = await readFile(path.join(source.dir, file), 'utf8');
      const statements = splitStatements(sql);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          if (stmt.trim()) await conn.query(stmt);
        }
        await conn.query('INSERT INTO schema_migrations (id, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [id]);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw new Error(`Migration failed: ${id}: ${err.message}`, { cause: err });
      } finally {
        conn.release();
      }
      newlyApplied.push(id);
    }
  }

  return newlyApplied;
}

/**
 * Split a .sql file into individual statements on semicolons that end a
 * line, ignoring '--' line comments. Good enough for plain DDL migrations.
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
