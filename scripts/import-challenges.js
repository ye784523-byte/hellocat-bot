import 'dotenv/config';
import { loadConfig, assertRuntimeConfig } from '../src/config/config.js';
import { createLogger } from '../src/utils/logger.js';
import { createStorage, initStorage, flushStorage } from '../src/storage/index.js';
import { importChallenges } from '../src/services/challengeImportService.js';
import { ChallengeService } from '../src/services/challengeService.js';
import { EconomyService } from '../src/services/economyService.js';

async function main() {
  const config = loadConfig();
  assertRuntimeConfig(config);
  const logger = createLogger({ dir: config.logDir, name: 'import' });
  const storage = createStorage({ dataDir: config.dataDir, logger });
  await initStorage(storage, { logger });

  const economyService = new EconomyService({ economyRepo: storage.economyRepo, logger });
  const challengeService = new ChallengeService({
    challengesRepo: storage.challengeRepo,
    submissionsRepo: storage.submissionsRepo,
    usersRepo: storage.usersRepo,
    economyService,
    flagSecret: config.FLAG_SECRET,
    logger,
  });

  const publish = process.argv.includes('--publish');
  const only = parseOnly(process.argv);
  const result = await importChallenges(challengeService, config.challengesDir, { publish, logger, only });
  await flushStorage(storage);

  console.log(`Imported: ${result.imported.length} ${result.imported.join(', ')}`);
  console.log(`Updated: ${result.updated.length} ${result.updated.join(', ')}`);
  if (result.skipped.length > 0) {
    console.log(`Skipped: ${result.skipped.length} ${result.skipped.join(', ')}`);
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`${error.file}: ${error.error}`);
    process.exitCode = 1;
  } else {
    console.log('Challenge import completed without errors.');
  }
}

/** `--only=HC-017,HC-018` limits the import to the listed challenge ids. */
function parseOnly(argv) {
  const argument = argv.find((entry) => entry.startsWith('--only='));
  if (!argument) return null;
  const ids = argument
    .slice('--only='.length)
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

main().catch((error) => {
  console.error(`[IMPORT FAILED] ${error.message}`);
  process.exitCode = 1;
});
