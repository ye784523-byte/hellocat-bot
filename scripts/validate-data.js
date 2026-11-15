import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/config.js';
import { CATEGORIES, DIFFICULTIES } from '../src/constants/index.js';
import { loadChallengeDefinitions } from '../src/services/challengeImportService.js';
import { validateUsers } from '../src/storage/repositories/userRepository.js';
import { validateChallenges } from '../src/storage/repositories/challengeRepository.js';
import { validateSubmissions } from '../src/storage/repositories/submissionRepository.js';
import { validateAchievements } from '../src/storage/repositories/achievementRepository.js';
import { validateEconomy } from '../src/storage/repositories/economyRepository.js';
import { validateModeration } from '../src/storage/repositories/moderationRepository.js';
import { validateAudit } from '../src/storage/repositories/auditRepository.js';
import { validateSettings } from '../src/storage/repositories/settingsRepository.js';

const VALIDATORS = {
  'users.json': validateUsers,
  'challenges.json': validateChallenges,
  'submissions.json': validateSubmissions,
  'achievements.json': validateAchievements,
  'economy.json': validateEconomy,
  'moderation.json': validateModeration,
  'audit.json': validateAudit,
  'settings.json': validateSettings,
};

async function main() {
  const config = loadConfig();
  const errors = [];
  const warnings = [];

  for (const [file, validate] of Object.entries(VALIDATORS)) {
    const full = path.join(config.dataDir, file);
    try {
      const parsed = JSON.parse(await fs.readFile(full, 'utf8'));
      const outcome = validate(parsed);
      if (outcome !== true) errors.push(`${file}: ${outcome}`);
      else console.log(`OK   data/${file}`);
    } catch (error) {
      if (error.code === 'ENOENT') warnings.push(`${file}: not present yet`);
      else errors.push(`${file}: ${error.message}`);
    }
  }

  const { definitions, errors: loadErrors } = await loadChallengeDefinitions(config.challengesDir);
  errors.push(...loadErrors.map((entry) => `${entry.file}: ${entry.error}`));
  const seen = new Set();
  const knownIds = new Set(definitions.map((entry) => entry.definition.id?.toUpperCase()).filter(Boolean));

  for (const { file, definition } of definitions) {
    const label = `${path.basename(file)}:${definition.id ?? 'NO-ID'}`;
    if (!definition.id || typeof definition.id !== 'string') {
      errors.push(`${label}: missing id`);
      continue;
    }
    if (seen.has(definition.id)) errors.push(`${label}: duplicate id`);
    seen.add(definition.id);
    if (!definition.title || String(definition.title).length < 3) errors.push(`${label}: invalid title`);
    if (!definition.description || String(definition.description).length < 10) errors.push(`${label}: invalid description`);
    if (!definition.objective || String(definition.objective).length < 5) errors.push(`${label}: invalid objective`);
    if (!CATEGORIES.includes(definition.category)) errors.push(`${label}: invalid category`);
    if (!DIFFICULTIES.includes(definition.difficulty)) errors.push(`${label}: invalid difficulty`);
    if (!Number.isInteger(definition.xp) || definition.xp < 1 || definition.xp > 10000) {
      errors.push(`${label}: invalid xp`);
    }
    if (!definition.flag || String(definition.flag).length < 3) errors.push(`${label}: missing flag`);
    if (definition.hints && !Array.isArray(definition.hints)) errors.push(`${label}: hints must be an array`);
    if (Array.isArray(definition.hints) && definition.hints.length > 5) errors.push(`${label}: too many hints`);
    if (definition.maxAttempts !== undefined && definition.maxAttempts !== null && (!Number.isInteger(definition.maxAttempts) || definition.maxAttempts < 1)) {
      errors.push(`${label}: invalid maxAttempts`);
    }
    if (definition.prerequisites !== undefined) {
      if (!Array.isArray(definition.prerequisites)) {
        errors.push(`${label}: prerequisites must be an array`);
      } else {
        if (definition.prerequisites.length > 10) errors.push(`${label}: too many prerequisites`);
        for (const prerequisite of definition.prerequisites) {
          if (typeof prerequisite !== 'string' || !/^HC-[A-Za-z0-9_-]{1,40}$/.test(prerequisite.trim())) {
            errors.push(`${label}: invalid prerequisite "${prerequisite}"`);
            continue;
          }
          const id = prerequisite.trim().toUpperCase();
          if (id === definition.id.toUpperCase()) errors.push(`${label}: requires itself`);
          else if (!knownIds.has(id)) errors.push(`${label}: unknown prerequisite ${id}`);
        }
      }
    }
    if (!errors.some((entry) => entry.startsWith(label))) console.log(`OK   challenge ${definition.id} (${path.basename(file)})`);
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL ${error}`);
    console.error(`\nValidation failed with ${errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nValidation passed: ${definitions.length} challenge definition(s), ${Object.keys(VALIDATORS).length} data files checked.`);
}

main().catch((error) => {
  console.error(`[VALIDATION FAILED] ${error.message}`);
  process.exitCode = 1;
});
