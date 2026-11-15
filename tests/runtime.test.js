import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestEnv } from './helpers.js';
import { createServices } from '../src/services/index.js';
import { loadEvents } from '../src/handlers/eventLoader.js';
import { startDailyScheduler } from '../src/handlers/scheduler.js';
import { silentLogger } from './helpers.js';

test('service composition wires repositories without undefined dependencies', async () => {
  const env = await createTestEnv();
  try {
    const services = createServices({
      storage: env.storage,
      config: {
        FLAG_SECRET: env.flagSecret,
        BOT_TIMEZONE: 'UTC',
        LOG_CHANNEL_ID: '',
        GUILD_ID: '',
      },
      logger: silentLogger,
      client: {
        channels: { cache: new Map() },
        guilds: { cache: new Map() },
      },
    });
    assert.ok(services.challengeService);
    assert.ok(services.playerService);
    assert.ok(services.dailyService);
    assert.ok(services.moderationService);
    assert.ok(services.achievementService);
    assert.ok(services.economyService);
    assert.equal(typeof services.gameEngine.start, 'function');
    const daily = await services.dailyService.ensureDaily();
    assert.equal(daily.challenge, null);
  } finally {
    await env.cleanup();
  }
});

test('event modules load and register handlers', async () => {
  const registered = [];
  const fakeClient = {
    on: (name) => registered.push(name),
    once: (name) => registered.push(name),
  };
  const count = await loadEvents(
    fakeClient,
    path.join(process.cwd(), 'src', 'events'),
    {},
    { logger: silentLogger },
  );
  assert.equal(count, 4);
  assert.deepEqual(registered.sort(), ['guildMemberAdd', 'interactionCreate', 'messageCreate', 'ready']);
});

test('daily scheduler starts and stops without a live gateway', async () => {
  const env = await createTestEnv();
  try {
    const ctx = {
      config: { CHALLENGE_CHANNEL_ID: '', GUILD_ID: '' },
      services: { dailyService: env.dailyService },
      storage: env.storage,
      logger: silentLogger,
    };
    const stop = startDailyScheduler({ isReady: () => false, channels: { cache: new Map() } }, ctx);
    assert.equal(typeof stop, 'function');
    stop();
  } finally {
    await env.cleanup();
  }
});
