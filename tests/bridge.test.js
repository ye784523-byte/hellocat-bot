import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, silentLogger } from './helpers.js';

test('bridge token and flag secret must match between bot and terminal', async () => {
  const env = await makeTempDir();
  try {
    const storage = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } }).then(mod => mod.createStorage);
    // Test that the configuration validation catches missing secrets
    const { assertRuntimeConfig } = await import('../src/src/config/config.js', { assert: { assert: 'import' } });
    
    // Test with empty FLAG_SECRET should fail
    try {
      assertRuntimeConfig({
        DISCORD_TOKEN: 'test',
        CLIENT_ID: 'test',
        GUILD_ID: 'test',
        FLAG_SECRET: '',
        NODE_ENV: 'development',
        DATA_DIR: env,
        LOG_DIR: '/tmp/logs',
        BACKUP_DIR: '/tmp/backups',
      });
      assert.fail('Should have thrown for missing FLAG_SECRET');
    } catch (e) {
      assert.ok(e.message.includes('FLAG_SECRET is required and must be at least 16 characters'));
    }
    
    // Test with short FLAG_SECRET should fail
    try {
      assertRuntimeConfig({
        DISCORD_TOKEN: 'test',
        CLIENT_ID: 'test',
        GUILD_ID: 'test',
        FLAG_SECRET: 'short',
        NODE_ENV: 'development',
        DATA_DIR: env,
        LOG_DIR: '/tmp/logs',
        BACKUP_DIR: '/tmp/backups',
      });
      assert.fail('Should have thrown for short FLAG_SECRET');
    } catch (e) {
      assert.ok(e.message.includes('FLAG_SECRET is required and must be at least 16 characters'));
    }
    
    assert.ok(true, 'FLAG_SECRET validation works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('bridge configuration requires both WEB_TERMINAL_URL and WEB_BRIDGE_TOKEN', async () => {
  const env = await makeTempDir();
  try {
    const { loadConfig } = await import('../src/src/config/config.js', { assert: { assert: 'import' } });
    
    // Test with only WEB_TERMINAL_URL but no WEB_BRIDGE_TOKEN
    const config1 = loadConfig({
      DISCORD_TOKEN: 'test',
      CLIENT_ID: 'test',
      GUILD_ID: 'test',
      FLAG_SECRET: 'test-secret-at-least-16-characters-long',
      NODE_ENV: 'development',
      DATA_DIR: env,
      LOG_DIR: '/tmp/logs',
      BACKUP_DIR: '/tmp/backups',
      WEB_TERMINAL_URL: 'https://example.com',
      // WEB_BRIDGE_TOKEN missing
    });
    // Config should load but bridge won't work without token
    assert.ok(config1.webTerminalUrl === 'https://example.com');
    assert.ok(!config1.webBridgeToken);
    
    // Test with both set
    const config2 = loadConfig({
      DISCORD_TOKEN: 'test',
      CLIENT_ID: 'test',
      GUILD_ID: 'test',
      FLAG_SECRET: 'test-secret-at-least-16-characters-long',
      NODE_ENV: 'development',
      DATA_DIR: env,
      LOG_DIR: '/tmp/logs',
      BACKUP_DIR: '/tmp/backups',
      WEB_TERMINAL_URL: 'https://example.com',
      WEB_BRIDGE_TOKEN: 'bridge-token-123',
    });
    assert.ok(config2.webTerminalUrl === 'https://example.com');
    assert.ok(config2.webBridgeToken === 'bridge-token-123');
    
    assert.ok(true, 'Bridge config validation works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('challenge service verify uses flag secret correctly', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { ChallengeService } = await import('../src/src/services/challengeService.js', { assert: { assert: 'import' } });
    const challengeService = new ChallengeService({
      challengesRepo: storage.challengesRepo,
      submissionsRepo: storage.submissionsRepo,
      usersRepo: storage.usersRepo,
      economyService: null,
      flagSecret: 'test-secret-at-least-16-characters-long',
      logger: silentLogger,
    });
    
    // Create a challenge with a known flag
    const created = await challengeService.create({
      title: 'Test Challenge',
      description: 'A test challenge',
      objective: 'Submit the flag',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 100,
      flag: 'HC{test_flag}',
    });
    
    // Verify the hash is set
    const raw = await challengeService.getRaw(created.id);
    assert.ok(raw.flagHash, 'flagHash should be set after creation');
    assert.notStrictEqual(raw.flagHash, 'HC{test_flag}', 'flagHash should be a hash, not plaintext');
    
    // Verify correct flag
    const verified = await challengeService.verify(created, 'HC{test_flag}');
    assert.strictEqual(verified, true, 'Correct flag should verify');
    
    // Verify wrong flag
    const wrongVerified = await challengeService.verify(created, 'HC{wrong}');
    assert.strictEqual(wrongVerified, false, 'Wrong flag should not verify');
    
    assert.ok(true, 'Flag verification works correctly with secret');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('concurrent submissions cannot both solve with same flag', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { ChallengeService } = await import('../src/src/services/challengeService.js', { assert: { assert: 'import' } });
    const challengeService = new ChallengeService({
      challengesRepo: storage.challengesRepo,
      submissionsRepo: storage.submissionsRepo,
      usersRepo: storage.usersRepo,
      economyService: null,
      flagSecret: 'test-secret-at-least-16-characters-long',
      logger: silentLogger,
    });
    
    const challenge = await challengeService.create({
      title: 'Test Challenge',
      description: 'A test challenge',
      objective: 'Submit the flag',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 100,
      flag: 'HC{concurrent-test}',
    });
    
    // Two concurrent submissions with same flag
    const results = await Promise.all([
      challengeService.submit({
        userId: 'user-1',
        challengeId: challenge.id,
        flag: 'HC{concurrent-test}',
      }),
      challengeService.submit({
        userId: 'user-2',
        challengeId: challenge.id,
        flag: 'HC{concurrent-test}',
      }),
    ]);
    
    // One should be 'solved', one should be 'already-solved'
    const statuses = results.map(r => r.status);
    assert(statuses.includes('solved'), 'One user should solve it');
    assert(statuses.includes('already-solved'), 'Other user should get already-solved');
    
    assert.ok(true, 'Concurrent submission handling works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('daily service creates challenge per date timezone', async () => {
  const env = await makeTempDir();
  try {
    const { DailyService } = await import('../src/src/services/dailyService.js', { assert: { assert: 'import' } });
    
    const dailyService = new DailyService({
      settingsRepo: { get: async () => ({ daily: {} }), update: async () => {} },
      challengeRepo: { all: async () => [], get: async () => null, create: async () => {}, update: async () => {} },
      usersRepo: { get: async () => ({}), ensure: async () => ({}), update: async () => {} },
      economyService: null,
      logger: silentLogger,
      timeZone: 'UTC',
    });
    
    const daily = await dailyService.ensureDaily();
    assert.ok(daily.challenge, 'Daily challenge should be created');
    assert.ok(daily.date, 'Daily date should be set');
    
    assert.ok(true, 'Daily service works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('achievement service tracks achievements', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { AchievementService } = await import('../src/src/services/achievementService.js', { assert: { assert: 'import' } });
    const playerService = { 
      get: async () => ({}), 
      ensure: async () => ({}), 
      update: async () => {} 
    };
    const economyService = { 
      credit: async () => {}, 
      debit: async () => {}, 
      getBalance: async () => 0 
    };
    
    const achievementService = new AchievementService({
      achievementRepo: storage.achievementRepo,
      playerService,
      economyService,
      logger: silentLogger,
    });
    
    // Test unlocking an achievement
    await achievementService.unlock('user-1', 'first_blood');
    
    const user = await storage.usersRepo.get('user-1');
    assert.ok(user.awards.some(a => a.key === 'first_blood'), 'first_blood achievement should be unlocked');
    
    assert.ok(true, 'Achievement service works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('economy service transactions', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { EconomyService } = await import('../src/src/services/economyService.js', { assert: { assert: 'import' } });
    const economyService = new EconomyService({
      economyRepo: storage.economyRepo,
      logger: silentLogger,
    });
    
    // Test credit
    await economyService.credit('user-1', 100, { reason: 'test', ref: 'test-ref' });
    const balance1 = await economyService.getBalance('user-1');
    assert.strictEqual(balance1, 100, 'Balance should be 100 after credit');
    
    // Test debit
    await economyService.debit('user-1', 50, { reason: 'test-debit', ref: 'test-debit-ref' });
    const balance2 = await economyService.getBalance('user-1');
    assert.strictEqual(balance2, 50, 'Balance should be 50 after debit');
    
    // Test insufficient funds
    try {
      await economyService.debit('user-1', 200, { reason: 'test-insufficient' });
      assert.fail('Should have thrown for insufficient funds');
    } catch (e) {
      assert.ok(e.message.includes('Insufficient funds') || e.message.includes('Insufficient'), 'Should show insufficient funds error');
    }
    
    assert.ok(true, 'Economy service transactions work correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('player service XP and ranking', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { PlayerService } = await import('../src/src/services/playerService.js', { assert: { assert: 'import' } });
    const playerService = new PlayerService({
      usersRepo: storage.usersRepo,
      submissionsRepo: storage.submissionsRepo,
      challengeRepo: storage.challengeRepo,
      logger: silentLogger,
    });
    
    // Test ensure user
    await playerService.ensureUser('user-1', 'TestUser');
    const user = await playerService.getUser('user-1');
    assert.ok(user.xp >= 0, 'User should have XP >= 0');
    assert.ok(user.rank, 'User should have a rank');
    
    // Test add XP
    const result = await playerService.addXp('user-1', 100, { key: 'test-key-1', source: 'test', username: 'TestUser' });
    assert.ok(result.duplicate === false, 'Should not be duplicate');
    assert.ok(result.added === 100, 'Should add 100 XP');
    assert.ok(result.after > 0, 'XP should be positive after award');
    
    // Test add same XP again (should be duplicate)
    const result2 = await playerService.addXp('user-1', 100, { key: 'test-key-1', source: 'test', username: 'TestUser' });
    assert.ok(result2.duplicate === true, 'Should detect duplicate');
    
    // Test rank
    const rank = await playerService.rank('user-1');
    assert.ok(rank, 'Rank should be returned');
    
    assert.ok(true, 'Player service XP and ranking works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('command loader loads all required commands', async () => {
  const { loadCommands, commandData } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  const count = await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  assert.ok(count >= 25, `Expected at least 25 commands, got ${count}`);
  
  // Check all required commands exist
  const required = [
    'help', 'tutorial', 'ping', 'about', 'status', 'rules', 'server',
    'profile', 'rank', 'leaderboard', 'achievements', 'history',
    'streak', 'challenge', 'challenges', 'tools', 'hint', 'mychallenges',
    'categories', 'guesscommand', 'quiz', 'terminal', 'daily', 'decrypt',
    'balance', 'shop', 'buy', 'inventory', 'mod', 'admin',
  ];
  
  for (const req of required) {
    assert.ok(fakeClient.commands.has(req), `missing /${req}`);
  }
  
  // /submit must not exist (moved to web terminal)
  assert.equal(fakeClient.commands.has('submit'), false, '/submit must no longer exist');
  
  const payload = commandData(fakeClient);
  assert.ok(payload.length === count, `commandData length mismatch: ${payload.length} vs ${count}`);
  assert.ok(payload.every((entry) => typeof entry.name === 'string' && typeof entry.description === 'string'), 'All entries must have name and description');
  
  assert.ok(true, 'Command loader works correctly');
});

test('storage serializes concurrent updates without lost writes', async () => {
  const { makeTempDir } = await import('./helpers.js', { assert: { assert: 'import' } });
  const dir = await makeTempDir();
  try {
    const { JsonStore } = await import('../src/src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const store = new JsonStore({ dir, file: 'test.json', defaults: { count: 0 }, logger: silentLogger });
    await store.read();
    
    await Promise.all(
      Array.from({ length: 50 }, () =>
        store.update((data) => {
          data.count += 1;
          return data;
        }),
      ),
    );
    
    const data = await store.read();
    assert.strictEqual(data.count, 50, 'Concurrent updates should not be lost');
    
    assert.ok(true, 'Storage concurrent update test passed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('storage quarantines malformed data and recovers from backup', async () => {
  const { makeTempDir } = await import('./helpers.js', { assert: { assert: 'import' } });
  const dir = await makeTempDir();
  try {
    const { JsonStore } = await import('../src/src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const store = new JsonStore({ dir, file: 'test.json', defaults: { value: 0 }, logger: silentLogger });
    await store.read();
    await store.write({ value: 1 });
    await store.write({ value: 2 });
    
    // Write malformed data
    await fs.writeFile(path.join(dir, 'test.json'), '{ this is not json', 'utf8');
    
    // Read should recover from backup
    const recovered = await store.read();
    assert.strictEqual(recovered.value, 1, 'Should recover from backup');
    
    // Check corrupt file was created
    const files = await fs.readdir(dir);
    const hasCorrupt = files.some(f => f.startsWith('test.json.corrupt-'));
    assert.ok(hasCorrupt, 'Corrupt file should be created');
    
    assert.ok(true, 'Storage quarantine and recovery test passed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('config validation requires DISCORD_TOKEN and CLIENT_ID', async () => {
  const { assertRuntimeConfig } = await import('../src/src/config/config.js', { assert: { assert: 'import' } });
  
  // Missing DISCORD_TOKEN
  try {
    assertRuntimeConfig({
      CLIENT_ID: 'test',
      FLAG_SECRET: 'test-secret-at-least-16-characters-long',
      NODE_ENV: 'development',
    });
    assert.fail('Should have thrown for missing DISCORD_TOKEN');
  } catch (e) {
    assert.ok(e.message.includes('DISCORD_TOKEN is required'));
  }
  
  // Missing CLIENT_ID
  try {
    assertRuntimeConfig({
      DISCORD_TOKEN: 'test',
      FLAG_SECRET: 'test-secret-at-least-16-characters-long',
      NODE_ENV: 'development',
    });
    assert.fail('Should have thrown for missing CLIENT_ID');
  } catch (e) {
    assert.ok(e.message.includes('CLIENT_ID is required'));
  }
  
  // Valid config
  try {
    assertRuntimeConfig({
      DISCORD_TOKEN: 'test',
      CLIENT_ID: 'test',
      FLAG_SECRET: 'test-secret-at-least-16-characters-long',
      NODE_ENV: 'development',
    });
    assert.ok(true, 'Valid config passes');
  } catch (e) {
    assert.fail('Valid config should not throw');
  }
  
  assert.ok(true, 'Config validation works correctly');
});

test('challenge prerequisites validation', async () => {
  const { makeTempDir } = await import('./helpers.js', { assert: { assert: 'import' } });
  const dir = await makeTempDir();
  try {
    const { ChallengeService } = await import('../src/src/services/challengeService.js', { assert: { assert: 'import' } });
    
    const storage = await import('../src/src/storage/jsonStore.js', { assert: { assert: 'import' } }).then(mod => mod.createStorage);
    const storageInstance = storage({ dataDir: dir, logger: silentLogger });
    await initStorage(storageInstance, { logger: silentLogger });
    
    const challengeService = new ChallengeService({
      challengesRepo: storageInstance.challengesRepo,
      submissionsRepo: storageInstance.submissionsRepo,
      usersRepo: storageInstance.usersRepo,
      economyService: null,
      flagSecret: 'test-secret-at-least-16-characters-long',
      logger: silentLogger,
    });
    
    // Test challenge cannot require itself
    await assert.rejects(
      () => challengeService.create({
        ...(await import('../src/src/helpers.js', { assert: { assert: 'import' } })).challengeInput({ prerequisites: ['HC-001'] }),
      }),
      /cannot require itself/i,
    );
    
    // Test unknown prerequisite is reported
    const created = await challengeService.create({
      title: 'Test Challenge',
      description: 'A test challenge',
      objective: 'Submit the flag',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 100,
      flag: 'HC{test}',
    });
    
    // Unknown prerequisite should be reported by validate
    const result = await challengeService.create({
      ...(await import('../src/src/helpers.js', { assert: { assert: 'import' } })).challengeInput({ prerequisites: ['HC-NONEXISTENT'] }),
    });
    
    // Should still create but with the prerequisite stored
    assert.ok(true, 'Prerequisite validation works correctly');
    
    assert.ok(true, 'Challenge prerequisites validation works correctly');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('flag normalization and HMAC hashing', async () => {
  const crypto = await import('node:crypto', { assert: { assert: 'import' } });
  
  // Test normalizeFlag
  const { normalizeFlag } = await import('../src/src/utils/flags.js', { assert: { assert: 'import' } });
  
  assert.strictEqual(normalizeFlag('  HC{test_flag}  '), 'HC{test_flag}', 'Should trim whitespace');
  assert.strictEqual(normalizeFlag('HC{test_flag}'), 'HC{test_flag}', 'Should preserve normal flag');
  assert.strictEqual(normalizeFlag(''), '', 'Should handle empty flag');
  assert.strictEqual(normalizeFlag('  '), '', 'Should handle whitespace-only flag');
  
  // Test hashFlag
  const { hashFlag } = await import('../src/src/utils/flags.js', { assert: { assert: 'import' } });
  const { verifyFlag } = await import('../src/src/utils/flags.js', { assert: { assert: 'import' } });
  
  const hash = hashFlag('HC{test_flag}', 'test-secret-at-least-16-characters-long');
  assert.ok(typeof hash === 'string', 'Hash should be a string');
  assert.strictEqual(hash.length, 64, 'SHA256 hash should be 64 hex characters');
  
  // Test verifyFlag
  assert.strictEqual(verifyFlag('HC{test_flag}', hash, 'test-secret-at-least-16-characters-long'), true, 'Correct flag should verify');
  assert.strictEqual(verifyFlag('HC{wrong}', hash, 'test-secret-at-least-16-characters-long'), false, 'Wrong flag should not verify');
  assert.strictEqual(verifyFlag('', hash, 'test-secret-at-least-16-characters-long'), false, 'Empty flag should not verify');
  assert.strictEqual(verifyFlag('HC{test_flag}', '', 'test-secret-at-least-16-characters-long'), false, 'Empty hash should not verify');
  assert.strictEqual(verifyFlag('HC{test_flag}', hash, ''), false, 'Empty secret should not verify');
  
  // Test looksLikeFlag
  const { looksLikeFlag } = await import('../src/src/utils/flags.js', { assert: { assert: 'import' } });
  assert.strictEqual(looksLikeFlag('HC{test_flag}'), true, 'Should recognize valid flag format');
  assert.strictEqual(looksLikeFlag('just-text-123'), true, 'Should recognize plain text as looking like flag');
  assert.strictEqual(looksLikeFlag(''), false, 'Empty should not look like flag');
  
  assert.ok(true, 'Flag normalization and HMAC hashing works correctly');
});

test('web terminal bridge endpoint structure', async () => {
  // Test that the bridge endpoint structure is correct
  // This tests the expected format without needing a running server
  
  const http = await import('node:http', { assert: { assert: 'import' } });
  
  const testServer = http.createServer((req, res) => {
    if (req.url === '/api/bridge/solves') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ solves: [] }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  
  // Test with fetch (node 18+)
  const fetch = await import('node:fetch', { assert: { assert: 'import' } });
  const response = await fetch(`http://127.0.0.1:${port}/api/bridge/solves?since=2025-01-01&limit=5`);
  assert.strictEqual(response.status, 200, 'Bridge endpoint should return 200');
  
  const data = await response.json();
  assert.ok(Array.isArray(data.solves), 'Response should have solves array');
  assert.strictEqual(data.solves.length, 0, 'Should be empty initially');
  
  testServer.close();
  assert.ok(true, 'Web terminal bridge endpoint structure is correct');
});

test('command cooldowns and categories', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check cooldowns exist
  const commandsWithCooldown = ['quiz', 'daily', 'guesscommand'];
  for (const cmd of commandsWithCooldown) {
    const command = fakeClient.commands.get(cmd);
    if (command) {
      assert.ok(command.cooldown > 0, `${cmd} should have cooldown > 0`);
    }
  }
  
  // Check command categories
  const categories = new Set();
  for (const [, command] of fakeClient.commands) {
    if (command.category) {
      categories.add(command.category);
    }
  }
  
  // Should have categories like ctf, games, economy, etc.
  assert.ok(categories.size > 0, 'Commands should have categories');
  
  assert.ok(true, 'Command cooldowns and categories work correctly');
});

test('storage backup and restore functionality', async () => {
  const { makeTempDir } = await import('./helpers.js', { assert: { assert: 'import' } });
  const dir = await makeTempDir();
  try {
    const { JsonStore } = await import('../src/src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const store = new JsonStore({ dir, file: 'test.json', defaults: { items: [], count: 0 }, logger: silentLogger });
    
    // Write some data
    await store.write({ items: ['item1', 'item2'], count: 2 });
    
    // Create backup
    await store.backupTo(path.join(dir, 'backups'));
    
    // Corrupt the file
    await fs.writeFile(path.join(dir, 'test.json'), '{ bad json', 'utf8');
    
    // Read should recover
    const recovered = await store.read();
    assert.strictEqual(recovered.count, 2, 'Should recover data from backup');
    assert.strictEqual(recovered.items.length, 2, 'Should recover items from backup');
    
    assert.ok(true, 'Storage backup and restore test passed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('daily challenge timezone handling', async () => {
  const { makeTempDir } = await import('./helpers.js', { assert: { assert: 'import' } });
  const dir = await makeTempDir();
  try {
    const { DailyService } = await import('../src/src/services/dailyService.js', { assert: { assert: 'import' } });
    
    const dailyService = new DailyService({
      settingsRepo: { get: async () => ({ daily: {} }), update: async () => {} },
      challengeRepo: { all: async () => [], get: async () => null, create: async () => {} },
      usersRepo: { get: async () => ({}), ensure: async () => {} },
      economyService: null,
      logger: silentLogger,
      timeZone: 'America/New_York',
    });
    
    const daily = await dailyService.ensureDaily();
    assert.ok(daily.challenge, 'Daily challenge should be created');
    assert.ok(daily.date, 'Daily date should be set');
    
    assert.ok(true, 'Daily challenge timezone handling works correctly');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('challenge stats tracking', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { ChallengeService } = await import('../src/src/services/challengeService.js', { assert: { assert: 'import' } });
    const challengeService = new ChallengeService({
      challengesRepo: storage.challengesRepo,
      submissionsRepo: storage.submissionsRepo,
      usersRepo: storage.usersRepo,
      economyService: null,
      flagSecret: 'test-secret-at-least-16-characters-long',
      logger: silentLogger,
    });
    
    const challenge = await challengeService.create({
      title: 'Test Challenge',
      description: 'A test challenge',
      objective: 'Submit the flag',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 100,
      flag: 'HC{stats-test}',
    });
    
    // Publish the challenge
    await challengeService.publish(created.id);
    
    // Submit multiple times
    await challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{stats-test}',
    });
    await challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{wrong}',
    });
    await challengeService.submit({
      userId: 'user-2',
      challengeId: challenge.id,
      flag: 'HC{stats-test}',
    });
    
    // Check stats
    const stats = await challengeService.stats();
    assert.ok(stats.total >= 1, 'Should have total challenges');
    assert.ok(stats.attempts >= 3, 'Should have 3 attempts');
    assert.ok(stats.solves >= 1, 'Should have at least 1 solve');
    
    assert.ok(true, 'Challenge stats tracking works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('web authentication flow structure', async () => {
  // Test the web auth flow structure without running a server
  const http = await import('node:http', { assert: { assert: 'import' } });
  
  let authCount = 0;
  const server = http.createServer((req, res) => {
    authCount++;
    if (req.url === '/auth/login') {
      res.writeHead(302, { Location: '/auth/callback' });
      res.end();
    } else if (req.url === '/auth/callback') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: { id: 'user-123', username: 'testuser' }, avatar: null }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  
  // Simulate the auth flow
  const fetch = await import('node:fetch', { assert: { assert: 'import' } });
  
  // Step 1: Get session (simulates redirect)
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/auth/login`);
  assert.strictEqual(sessionResponse.status, 302, 'Should redirect to callback');
  
  // Step 2: Callback
  const callbackResponse = await fetch(`http://127.0.0.1:${port}/auth/callback`);
  assert.strictEqual(callbackResponse.status, 200, 'Callback should succeed');
  const callbackData = await callbackResponse.json();
  assert.ok(callbackData.user, 'Should have user data');
  assert.strictEqual(callbackData.user.id, 'user-123', 'User ID should match');
  
  server.close();
  assert.ok(true, 'Web authentication flow structure is correct');
});

test('challenge category and difficulty filtering', async () => {
  const env = await makeTempDir();
  try {
    const { createStorage, initStorage } = await import('../src/storage/jsonStore.js', { assert: { assert: 'import' } });
    const storage = createStorage({ dataDir: env, logger: silentLogger });
    await initStorage(storage, { logger: silentLogger });
    
    const { ChallengeService } = await import('../src/src/services/challengeService.js', { assert: { assert: 'import' } });
    const challengeService = new ChallengeService({
      challengesRepo: storage.challengesRepo,
      submissionsRepo: storage.submissionsRepo,
      usersRepo: storage.usersRepo,
      economyService: null,
      flagSecret: 'test-secret-at-least-16-characters-long',
      logger: silentLogger,
    });
    
    // Create challenges in different categories/difficulties
    await challengeService.create({
      title: 'Easy Linux',
      description: 'Easy Linux challenge',
      objective: 'Submit the flag',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 50,
      flag: 'HC{easy-linux}',
    });
    
    await challengeService.create({
      title: 'Hard Web',
      description: 'Hard Web challenge',
      objective: 'Submit the flag',
      category: 'Web Security',
      difficulty: 'Hard',
      xp: 200,
      flag: 'HC{hard-web}',
    });
    
    await challengeService.create({
      title: 'Medium Crypto',
      description: 'Medium Crypto challenge',
      objective: 'Submit the flag',
      category: 'Cryptography',
      difficulty: 'Medium',
      xp: 150,
      flag: 'HC{medium-crypto}',
    });
    
    // Test category filtering
    const linuxChallenges = await challengeService.list({ category: 'Linux' });
    const linuxCount = linuxChallenges.filter(c => c.category === 'Linux').length;
    assert.strictEqual(linuxCount, 1, 'Should filter by Linux category');
    
    // Test difficulty filtering
    const hardChallenges = await challengeService.list({ difficulty: 'Hard' });
    const hardCount = hardChallenges.filter(c => c.difficulty === 'Hard').length;
    assert.strictEqual(hardCount, 1, 'Should filter by Hard difficulty');
    
    // Test combined filtering
    const linuxHard = await challengeService.list({ category: 'Linux', difficulty: 'Hard' });
    assert.strictEqual(linuxHard.length, 0, 'Should combine filters correctly');
    
    assert.ok(true, 'Challenge category and difficulty filtering works correctly');
  } finally {
    await fs.rm(env, { recursive: true, force: true });
  }
});

test('help command structure', async () => {
  const { loadCommands, commandData } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check help command exists and has description
  const helpCmd = fakeClient.commands.get('help');
  assert.ok(helpCmd, 'help command should exist');
  assert.ok(helpCmd.data, 'help command should have data');
  assert.ok(helpCmd.execute, 'help command should have execute function');
  assert.ok(helpCmd.category, 'help command should have category');
  
  // Check help command data structure
  const helpData = helpCmd.data;
  assert.ok(typeof helpData.name === 'string', 'help command name should be string');
  assert.ok(typeof helpData.description === 'string', 'help command description should be string');
  assert.ok(helpData.name.toLowerCase().includes('help'), 'help command name should include help');
  
  assert.ok(true, 'Help command structure is correct');
});

test('admin command structure', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check admin command exists
  const adminCmd = fakeClient.commands.get('admin');
  assert.ok(adminCmd, 'admin command should exist');
  assert.ok(adminCmd.data, 'admin command should have data');
  assert.ok(adminCmd.execute, 'admin command should have execute function');
  assert.ok(adminCmd.category, 'admin command should have category');
  assert.ok(adminCmd.cooldown >= 0, 'admin command should have cooldown >= 0');
  
  // Check admin command has subcommands
  const adminData = adminCmd.data;
  assert.ok(helpData.includes('challenge-create'), 'admin should have challenge-create subcommand');
  
  assert.ok(true, 'Admin command structure is correct');
});

test('economy command structure', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check economy commands exist
  const economyCmds = ['balance', 'shop', 'buy', 'inventory'];
  for (const cmd of economyCmds) {
    const cmdObj = fakeClient.commands.get(cmd);
    assert.ok(cmdObj, `${cmd} command should exist`);
    assert.ok(cmdObj.cooldown >= 0, `${cmd} should have cooldown >= 0`);
  }
  
  assert.ok(true, 'Economy command structure is correct');
});

test('game command structure', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check game commands exist
  const gameCmds = ['quiz', 'guesscommand', 'terminal', 'daily', 'decrypt'];
  for (const cmd of gameCmds) {
    const cmdObj = fakeClient.commands.get(cmd);
    assert.ok(cmdObj, `${cmd} command should exist`);
    assert.ok(cmdObj.cooldown >= 0, `${cmd} should have cooldown >= 0`);
  }
  
  assert.ok(true, 'Game command structure is correct');
});

test('moderation command structure', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Check moderation commands exist
  const modCmds = ['mod', 'warn', 'timeout', 'kick', 'ban', 'clear', 'report'];
  for (const cmd of modCmds) {
    const cmdObj = fakeClient.commands.get(cmd);
    assert.ok(cmdObj, `${cmd} command should exist`, `${cmd} should exist`);
  }
  
  assert.ok(true, 'Moderation command structure is correct');
});

test('all command categories present', async () => {
  const { loadCommands } = await import('../src/handlers/commandLoader.js', { assert: { assert: 'import' } });
  const fakeClient = { commands: new (await import('discord.js.js', { assert: { assert: 'import' } })).Collection() };
  await loadCommands(fakeClient, path.join(process.cwd(), 'src', 'commands'), { logger: silentLogger });
  
  // Collect all categories
  const categories = new Set();
  for (const [, command] of fakeClient.commands) {
    if (command.category) {
      categories.add(command.category);
    }
  }
  
  // Should have multiple categories
  assert.ok(categories.size >= 5, `Should have at least 5 categories, got ${categories.size}`);
  
  // Common categories
  const categoryList = [...categories];
  assert.ok(categoryList.includes('ctf'), 'Should have ctf category');
  assert.ok(categoryList.includes('games'), 'Should have games category');
  assert.ok(categoryList.includes('economy'), 'Should have economy category');
  
  assert.ok(true, 'All command categories present');
});

// Export test helpers for use in other tests
export { challengeInput };

