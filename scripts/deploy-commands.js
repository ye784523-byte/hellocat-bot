import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collection, REST, Routes } from 'discord.js';
import { loadConfig, assertRuntimeConfig, isSnowflake } from '../src/config/config.js';
import { createLogger } from '../src/utils/logger.js';
import { loadCommands, commandData } from '../src/handlers/commandLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const forceGlobal = args.includes('--global');

/**
 * The bot can only register guild commands in a server it has been invited
 * to. Checking this up front turns a raw "Unknown Guild" API error into an
 * actionable message.
 */
async function assertBotInGuild(config, guildId) {
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bot ${config.DISCORD_TOKEN}` },
  });
  if (!response.ok) {
    console.warn(`Could not verify bot guild membership (HTTP ${response.status}); continuing.`);
    return;
  }
  const guilds = await response.json().catch(() => []);
  if (!Array.isArray(guilds) || guilds.some((guild) => guild.id === guildId)) return;

  const invite = `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}`
    + `&scope=bot%20applications.commands&permissions=1411702189079&guild_id=${guildId}`
    + '&disable_guild_select=true';
  throw new Error(
    `The bot is not a member of guild ${guildId}. Invite it first:\n  ${invite}\n`
    + 'After the invite, run this command again.',
  );
}

async function main() {
  const config = loadConfig();
  assertRuntimeConfig(forceGlobal ? { ...config, registerGlobalCommands: true } : config);
  const logger = createLogger({ dir: config.logDir, name: 'deploy' });

  const useGlobal = forceGlobal || config.registerGlobalCommands;
  if (!useGlobal && !isSnowflake(config.GUILD_ID)) {
    throw new Error('GUILD_ID is required for guild command deployment (or set REGISTER_GLOBAL_COMMANDS=true).');
  }
  if (!useGlobal) {
    await assertBotInGuild(config, config.GUILD_ID);
  }

  const fakeClient = { commands: new Collection() };
  await loadCommands(fakeClient, path.join(__dirname, '..', 'src', 'commands'), { logger });
  const body = commandData(fakeClient);

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  if (useGlobal) {
    await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body });
    logger.info('Global commands deployed', { count: body.length });
  } else {
    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), { body });
    logger.info('Guild commands deployed', { count: body.length, guildId: config.GUILD_ID });
  }
  console.log(`Deployed ${body.length} commands ${useGlobal ? 'globally' : `to guild ${config.GUILD_ID}`}.`);
}

main().catch((error) => {
  console.error(`[DEPLOY FAILED] ${error.message}`);
  process.exitCode = 1;
});
