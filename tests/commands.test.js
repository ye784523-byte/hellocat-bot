import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Collection } from 'discord.js';
import { loadCommands, commandData } from '../src/handlers/commandLoader.js';
import { silentLogger } from './helpers.js';

test('all command modules load without duplicate names or invalid exports', async () => {
  const fakeClient = { commands: new Collection() };
  const count = await loadCommands(
    fakeClient,
    path.join(process.cwd(), 'src', 'commands'),
    { logger: silentLogger },
  );
  assert.ok(count >= 25, `expected at least 25 commands, got ${count}`);
  const names = [...fakeClient.commands.keys()];
  for (const name of names) {
    const command = fakeClient.commands.get(name);
    assert.ok(command.data, `${name} missing data`);
    assert.equal(typeof command.execute, 'function', `${name} missing execute`);
    assert.ok(command.category, `${name} missing category`);
  }
  for (const required of [
    'help',
    'tutorial',
    'ping',
    'about',
    'status',
    'rules',
    'server',
    'profile',
    'rank',
    'leaderboard',
    'achievements',
    'history',
    'streak',
    'challenge',
    'challenges',
    'tools',
    'hint',
    'mychallenges',
    'categories',
    'guesscommand',
    'quiz',
    'terminal',
    'daily',
    'decrypt',
    'balance',
    'shop',
    'buy',
    'inventory',
    'mod',
    'admin',
  ]) {
    assert.ok(fakeClient.commands.has(required), `missing /${required}`);
  }
  // Flag submission moved to the web terminal, the channel assistant guides
  // operators there instead.
  assert.equal(fakeClient.commands.has('submit'), false, '/submit must no longer exist');
  const payload = commandData(fakeClient);
  assert.equal(payload.length, count);
  assert.ok(payload.every((entry) => typeof entry.name === 'string' && typeof entry.description === 'string'));
});
