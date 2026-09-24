import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { createRunningRepo, parseImportInput, applyImport } from '@snowman/module-running';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run import:runcoach -- <path-to-summary.txt>');
  process.exit(1);
}

const config = loadConfig();
const db = createPool(config.databaseUrl);
const repo = createRunningRepo(db);

try {
  const text = await readFile(filePath, 'utf8');
  const parsed = parseImportInput(text, { tzName: config.tzName });
  const result = await applyImport(repo, parsed);

  console.log(`Settings applied: ${result.settingsApplied}`);
  console.log(`Runs imported: ${result.runsImported}`);
  if (result.unparsed.length) {
    console.log(`Unparsed lines (${result.unparsed.length}):`);
    for (const line of result.unparsed) console.log(`  ${line}`);
  }
} finally {
  await db.end();
}
