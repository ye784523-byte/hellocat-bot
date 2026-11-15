import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, assertRuntimeConfig, isSnowflake } from '../src/config/config.js';

test('loadConfig applies safe defaults and resolves directories', () => {
  const config = loadConfig({}, '/tmp/hello-cat-test');
  assert.equal(config.BOT_TIMEZONE, 'Africa/Casablanca');
  assert.equal(config.NODE_ENV, 'development');
  assert.equal(config.registerGlobalCommands, false);
  assert.equal(config.AUTO_BACKUP_HOURS, 24);
  assert.equal(config.dataDir, '/tmp/hello-cat-test/src/storage/data');
});

test('loadConfig parses booleans and rejects invalid timezones', () => {
  const config = loadConfig({ REGISTER_GLOBAL_COMMANDS: 'true', AUTO_BACKUP_HOURS: '6' });
  assert.equal(config.registerGlobalCommands, true);
  assert.equal(config.AUTO_BACKUP_HOURS, 6);
  assert.throws(() => loadConfig({ BOT_TIMEZONE: 'Mars/Olympus_Mons' }), /Invalid BOT_TIMEZONE/);
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /Invalid configuration/);
});

test('assertRuntimeConfig requires token, client id and a strong flag secret', () => {
  const base = loadConfig({});
  assert.throws(() => assertRuntimeConfig(base), /DISCORD_TOKEN/);
  const partial = loadConfig({
    DISCORD_TOKEN: 'token',
    CLIENT_ID: '123',
    FLAG_SECRET: 'short',
  });
  assert.throws(() => assertRuntimeConfig(partial), /FLAG_SECRET/);
  const valid = loadConfig({
    DISCORD_TOKEN: 'token',
    CLIENT_ID: '123',
    GUILD_ID: '123456789012345678',
    FLAG_SECRET: 'this-is-a-long-test-secret',
  });
  assert.equal(assertRuntimeConfig(valid), true);
});

test('loadConfig accepts DISCORD_GUILD_ID as an alias for GUILD_ID', () => {
  const aliased = loadConfig({ DISCORD_GUILD_ID: '1570465542102319146' });
  assert.equal(aliased.GUILD_ID, '1570465542102319146');

  const explicit = loadConfig({ GUILD_ID: '111', DISCORD_GUILD_ID: '222' });
  assert.equal(explicit.GUILD_ID, '111', 'an explicit GUILD_ID wins over the alias');
});

test('snowflake validation rejects arbitrary role input', () => {
  assert.equal(isSnowflake('123456789012345678'), true);
  assert.equal(isSnowflake('not-a-role'), false);
  assert.equal(isSnowflake('123'), false);
  assert.equal(isSnowflake(123456789012345678), false);
});
