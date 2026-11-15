import 'dotenv/config';
import path from 'node:path';
import { loadConfig } from '../src/config/config.js';
import { createLogger } from '../src/utils/logger.js';
import { createStorage, initStorage, flushStorage } from '../src/storage/index.js';
import { createBackup } from '../src/utils/backup.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger({ dir: config.logDir, name: 'backup' });
  const storage = createStorage({ dataDir: config.dataDir, logger });
  await initStorage(storage, { logger });
  const result = await createBackup({ storage, backupDir: config.backupDir, logger });
  await flushStorage(storage);
  console.log(`Backup complete: ${result.directory} (${result.files.length} files)`);
}

main().catch((error) => {
  console.error(`[BACKUP FAILED] ${error.message}`);
  process.exitCode = 1;
});
