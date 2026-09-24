import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { createDeviceRepo, createPairingCode } from '../src/core/auth.js';

const deviceName = process.argv[2];
if (!deviceName) {
  console.error('Usage: npm run pair -- "<device name>"');
  process.exit(1);
}

const config = loadConfig();
const db = createPool(config.databaseUrl);
const repo = createDeviceRepo(db);

try {
  const { code, expiresAt } = await createPairingCode(repo, deviceName);
  console.log(`Pairing code for "${deviceName}": ${code}`);
  console.log(`Valid until ${expiresAt.toISOString()} (10 minutes).`);
  console.log('On the device, POST /v1/pair with { "code": "...", "deviceName": "..." } to get a token.');
} finally {
  await db.end();
}
