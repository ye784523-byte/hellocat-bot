import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, challengeInput } from './helpers.js';
import { rankForXp } from '../src/services/rankingService.js';

test('rank progression follows configured thresholds', () => {
  assert.equal(rankForXp(0).name, 'Script Kiddie');
  assert.equal(rankForXp(249).name, 'Script Kiddie');
  assert.equal(rankForXp(250).name, 'Packet Scout');
  assert.equal(rankForXp(749).name, 'Packet Scout');
  assert.equal(rankForXp(750).name, 'Terminal Runner');
  assert.equal(rankForXp(18000).name, 'Root Access');
  assert.equal(rankForXp(999999).isMax, true);
  assert.equal(rankForXp(260).xpToNext, 490);
});

test('XP awards are idempotent per key and removal floors at zero', async () => {
  const env = await createTestEnv();
  try {
    const first = await env.playerService.addXp('user-1', 100, { key: 'test:a', source: 'test' });
    assert.equal(first.added, 100);
    assert.equal(first.duplicate, false);

    const duplicate = await env.playerService.addXp('user-1', 100, { key: 'test:a', source: 'test' });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.added, 0);

    const user = await env.playerService.getUser('user-1');
    assert.equal(user.xp, 100);

    const removed = await env.playerService.removeXp('user-1', 500);
    assert.equal(removed.removed, 100);
    assert.equal((await env.playerService.getUser('user-1')).xp, 0);
  } finally {
    await env.cleanup();
  }
});

test('leaderboard sorts by XP descending', async () => {
  const env = await createTestEnv();
  try {
    await env.playerService.addXp('a', 200, { key: 'a', username: 'Alpha' });
    await env.playerService.addXp('b', 900, { key: 'b', username: 'Beta' });
    await env.playerService.addXp('c', 500, { key: 'c', username: 'Gamma' });
    const board = await env.playerService.leaderboard();
    assert.deepEqual(board.map((entry) => entry.username), ['Beta', 'Gamma', 'Alpha']);
  } finally {
    await env.cleanup();
  }
});

test('first challenge solve unlocks First Blood exactly once', async () => {
  const env = await createTestEnv();
  try {
    const challenge = await env.challengeService.create(challengeInput());
    await env.challengeService.publish(challenge.id);
    await env.challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{test_flag}',
      username: 'tester',
    });
    const unlocked = await env.achievementService.evaluate('user-1', { username: 'tester' });
    assert.equal(unlocked.length, 1);
    assert.equal(unlocked[0].id, 'first-blood');

    const second = await env.achievementService.evaluate('user-1', { username: 'tester' });
    assert.equal(second.length, 0);
    const list = await env.achievementService.listFor('user-1');
    assert.ok(list.find((entry) => entry.id === 'first-blood').unlockedAt);
    const user = await env.playerService.getUser('user-1');
    assert.equal(user.xp, 50);
    assert.equal(await env.economyService.getBalance('user-1'), 25);
  } finally {
    await env.cleanup();
  }
});

test('daily completion is rewarded once and advances the streak on the next day', async () => {
  const env = await createTestEnv({ timeZone: 'UTC', now: new Date('2026-03-10T10:00:00.000Z') });
  try {
    const one = await env.challengeService.create(challengeInput({ title: 'Daily One' }));
    const two = await env.challengeService.create(challengeInput({ title: 'Daily Two', flag: 'HC{two}' }));
    await env.challengeService.publish(one.id);
    await env.challengeService.publish(two.id);

    const dayOne = await env.dailyService.ensureDaily();
    assert.ok(dayOne.challenge);
    const result = await env.dailyService.recordCompletion({
      userId: 'user-1',
      challengeId: dayOne.challenge.id,
      username: 'tester',
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.streak.current, 1);
    assert.equal(result.xp, 75);
    assert.equal(result.coins, 30);

    const duplicate = await env.dailyService.recordCompletion({
      userId: 'user-1',
      challengeId: dayOne.challenge.id,
      username: 'tester',
    });
    assert.equal(duplicate.duplicate, true);

    env.setNow(new Date('2026-03-11T10:00:00.000Z'));
    const dayTwo = await env.dailyService.ensureDaily();
    const next = await env.dailyService.recordCompletion({
      userId: 'user-1',
      challengeId: dayTwo.challenge.id,
      username: 'tester',
    });
    assert.equal(next.duplicate, false);
    assert.equal(next.streak.current, 2);
    assert.equal(next.streak.longest, 2);

    const user = await env.playerService.getUser('user-1');
    assert.equal(user.xp, 150);
    assert.equal(await env.economyService.getBalance('user-1'), 60);
  } finally {
    await env.cleanup();
  }
});

test('daily challenge selection is stable for the same day', async () => {
  const env = await createTestEnv();
  try {
    const one = await env.challengeService.create(challengeInput({ title: 'Stable One' }));
    const two = await env.challengeService.create(challengeInput({ title: 'Stable Two', flag: 'HC{two}' }));
    await env.challengeService.publish(one.id);
    await env.challengeService.publish(two.id);
    const first = await env.dailyService.ensureDaily();
    const second = await env.dailyService.ensureDaily();
    assert.equal(first.challenge.id, second.challenge.id);
  } finally {
    await env.cleanup();
  }
});
