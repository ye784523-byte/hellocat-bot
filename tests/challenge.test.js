import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestEnv, challengeInput } from './helpers.js';
import { importChallenges } from '../src/services/challengeImportService.js';

test('challenge creation hashes the flag and never returns it publicly', async () => {
  const env = await createTestEnv();
  try {
    const challenge = await env.challengeService.create(challengeInput());
    assert.equal(challenge.id, 'HC-001');
    assert.equal(challenge.flagHash, undefined);
    const raw = await env.challengeService.getRaw(challenge.id);
    assert.ok(raw.flagHash);
    assert.notEqual(raw.flagHash, 'HC{test_flag}');
    assert.equal(await env.challengeService.verify(raw, 'HC{test_flag}'), true);
    assert.equal(await env.challengeService.verify(raw, 'HC{wrong}'), false);
    const stored = await fs.readFile(path.join(env.dir, 'challenges.json'), 'utf8');
    assert.ok(!stored.includes('HC{test_flag}'));
  } finally {
    await env.cleanup();
  }
});

test('challenge validation rejects malformed input', async () => {
  const env = await createTestEnv();
  try {
    await assert.rejects(
      () => env.challengeService.create(challengeInput({ category: 'Not A Category' })),
      /validation failed/i,
    );
    await assert.rejects(() => env.challengeService.create(challengeInput({ xp: 0 })), /validation failed/i);
    await assert.rejects(
      () => env.challengeService.create(challengeInput({ description: 'short' })),
      /validation failed/i,
    );
  } finally {
    await env.cleanup();
  }
});

test('challenge editing can rotate the flag and update metadata', async () => {
  const env = await createTestEnv();
  try {
    const created = await env.challengeService.create(challengeInput());
    const edited = await env.challengeService.edit(created.id, {
      title: 'Edited Challenge',
      xp: 200,
      flag: 'HC{rotated_flag}',
    });
    assert.equal(edited.title, 'Edited Challenge');
    assert.equal(edited.xp, 200);
    const raw = await env.challengeService.getRaw(created.id);
    assert.equal(await env.challengeService.verify(raw, 'HC{test_flag}'), false);
    assert.equal(await env.challengeService.verify(raw, 'HC{rotated_flag}'), true);
  } finally {
    await env.cleanup();
  }
});

test('publishing activates a challenge; disabling blocks submissions', async () => {
  const env = await createTestEnv();
  try {
    const draft = await env.challengeService.create(challengeInput());
    const inactive = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: draft.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(inactive.status, 'inactive');

    const published = await env.challengeService.publish(draft.id);
    assert.equal(published.active, true);
    assert.equal(published.published, true);

    const solved = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: draft.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(solved.status, 'solved');

    await env.challengeService.disable(draft.id);
    const blocked = await env.challengeService.submit({
      userId: 'user-2',
      challengeId: draft.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(blocked.status, 'inactive');
  } finally {
    await env.cleanup();
  }
});

test('flag submissions reject duplicates and enforce max attempts', async () => {
  const env = await createTestEnv();
  try {
    const challenge = await env.challengeService.create(challengeInput({ maxAttempts: 2 }));
    await env.challengeService.publish(challenge.id);

    const wrong1 = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{wrong}',
    });
    assert.equal(wrong1.status, 'incorrect');
    assert.equal(wrong1.attemptsRemaining, 1);

    const wrong2 = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{wrong}',
    });
    assert.equal(wrong2.status, 'incorrect');
    assert.equal(wrong2.attemptsRemaining, 0);

    const locked = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: challenge.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(locked.status, 'locked');

    const other = await env.challengeService.submit({
      userId: 'user-2',
      challengeId: challenge.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(other.status, 'solved');

    const duplicate = await env.challengeService.submit({
      userId: 'user-2',
      challengeId: challenge.id,
      flag: 'HC{test_flag}',
    });
    assert.equal(duplicate.status, 'already-solved');
  } finally {
    await env.cleanup();
  }
});

test('concurrent duplicate submissions cannot both solve', async () => {
  const env = await createTestEnv();
  try {
    const challenge = await env.challengeService.create(challengeInput());
    await env.challengeService.publish(challenge.id);
    const results = await Promise.all([
      env.challengeService.submit({ userId: 'user-1', challengeId: challenge.id, flag: 'HC{test_flag}' }),
      env.challengeService.submit({ userId: 'user-1', challengeId: challenge.id, flag: 'HC{test_flag}' }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, ['already-solved', 'solved']);
    const attempts = await env.storage.submissionsRepo.attempts('user-1', challenge.id);
    assert.equal(attempts, 1);
  } finally {
    await env.cleanup();
  }
});

test('hints debit CATCOINS once and remain unlocked', async () => {
  const env = await createTestEnv();
  try {
    const challenge = await env.challengeService.create(
      challengeInput({ hints: [{ text: 'A paid intel fragment.', cost: 25 }] }),
    );
    await env.challengeService.publish(challenge.id);
    await env.economyService.credit('user-1', 30, { reason: 'test' });

    const first = await env.challengeService.requestHint({
      userId: 'user-1',
      challengeId: challenge.id,
      index: 0,
      username: 'tester',
    });
    assert.equal(first.text, 'A paid intel fragment.');
    assert.equal(first.cost, 25);
    assert.equal(await env.economyService.getBalance('user-1'), 5);

    const second = await env.challengeService.requestHint({
      userId: 'user-1',
      challengeId: challenge.id,
      index: 0,
      username: 'tester',
    });
    assert.equal(second.alreadyUnlocked, true);
    assert.equal(await env.economyService.getBalance('user-1'), 5);

    await assert.rejects(
      () =>
        env.challengeService.requestHint({
          userId: 'user-2',
          challengeId: challenge.id,
          index: 0,
          username: 'tester2',
        }),
      /insufficient/i,
    );
  } finally {
    await env.cleanup();
  }
});

test('challenge import validates files and hashes flags', async () => {
  const env = await createTestEnv();
  const source = await fs.mkdtemp(path.join(env.dir, 'import-'));
  try {
    await fs.mkdir(path.join(source, 'easy'), { recursive: true });
    await fs.writeFile(
      path.join(source, 'easy', 'one.json'),
      JSON.stringify({
        ...challengeInput({ id: 'HC-101', published: true }),
        flag: 'HC{import_flag}',
      }),
    );
    const result = await importChallenges(env.challengeService, source);
    assert.deepEqual(result.imported, ['HC-101']);
    assert.equal(result.errors.length, 0);
    const raw = await env.challengeService.getRaw('HC-101');
    assert.ok(raw.active);
    const file = await fs.readFile(path.join(env.dir, 'challenges.json'), 'utf8');
    assert.ok(!file.includes('HC{import_flag}'));
    assert.equal(await env.challengeService.verify(raw, 'HC{import_flag}'), true);
  } finally {
    await fs.rm(source, { recursive: true, force: true });
    await env.cleanup();
  }
});

test('a challenge with prerequisites stays locked until the gate is captured', async () => {
  const env = await createTestEnv();
  try {
    const first = await env.challengeService.create(challengeInput({ title: 'First Contact' }));
    await env.challengeService.publish(first.id);
    const second = await env.challengeService.create(
      challengeInput({ title: 'Second Contact', prerequisites: [first.id], flag: 'HC{second_flag}' }),
    );
    await env.challengeService.publish(second.id);

    const blocked = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: second.id,
      flag: 'HC{second_flag}',
    });
    assert.equal(blocked.status, 'locked-prerequisite');
    assert.deepEqual(blocked.missing, [first.id]);
    assert.equal(await env.storage.submissionsRepo.attempts('user-1', second.id), 0);

    const gate = await env.challengeService.prerequisiteState('user-1', second);
    assert.equal(gate.locked, true);

    await env.challengeService.submit({
      userId: 'user-1',
      challengeId: first.id,
      flag: 'HC{test_flag}',
    });

    const unlocked = await env.challengeService.submit({
      userId: 'user-1',
      challengeId: second.id,
      flag: 'HC{second_flag}',
    });
    assert.equal(unlocked.status, 'solved');

    const other = await env.challengeService.prerequisiteState('user-2', second);
    assert.equal(other.locked, true);
    assert.deepEqual(other.missing, [first.id]);
  } finally {
    await env.cleanup();
  }
});

test('the challenge list reports locked entries per operator', async () => {
  const env = await createTestEnv();
  try {
    const first = await env.challengeService.create(challengeInput({ title: 'First Contact' }));
    await env.challengeService.publish(first.id);
    const second = await env.challengeService.create(
      challengeInput({ title: 'Second Contact', prerequisites: [first.id], flag: 'HC{second_flag}' }),
    );
    await env.challengeService.publish(second.id);

    const before = await env.challengeService.list({ userId: 'user-1' });
    const lockedEntry = before.find((challenge) => challenge.id === second.id);
    assert.equal(lockedEntry.locked, true);
    assert.deepEqual(lockedEntry.missingPrerequisites, [first.id]);

    await env.challengeService.submit({
      userId: 'user-1',
      challengeId: first.id,
      flag: 'HC{test_flag}',
    });

    const after = await env.challengeService.list({ userId: 'user-1' });
    const openEntry = after.find((challenge) => challenge.id === second.id);
    assert.equal(openEntry.locked, false);
    assert.deepEqual(openEntry.missingPrerequisites, []);
  } finally {
    await env.cleanup();
  }
});

test('hints and challenges behind a gate stay out of reach', async () => {
  const env = await createTestEnv();
  try {
    const first = await env.challengeService.create(challengeInput({ title: 'First Contact' }));
    await env.challengeService.publish(first.id);
    const second = await env.challengeService.create(
      challengeInput({ title: 'Second Contact', prerequisites: [first.id], flag: 'HC{second_flag}' }),
    );
    await env.challengeService.publish(second.id);

    await assert.rejects(
      () =>
        env.challengeService.requestHint({
          userId: 'user-1',
          challengeId: second.id,
          index: 0,
          username: 'tester',
        }),
      /locked/i,
    );
  } finally {
    await env.cleanup();
  }
});

test('a challenge cannot require itself', async () => {
  const env = await createTestEnv();
  try {
    await assert.rejects(
      () => env.challengeService.create(challengeInput({ prerequisites: ['HC-001'] })),
      /cannot require itself/i,
    );
  } finally {
    await env.cleanup();
  }
});

test('import carries prerequisites and reports unknown gates', async () => {
  const env = await createTestEnv();
  const source = await fs.mkdtemp(path.join(env.dir, 'import-'));
  try {
    await fs.mkdir(path.join(source, 'easy'), { recursive: true });
    await fs.writeFile(
      path.join(source, 'easy', 'gate.json'),
      JSON.stringify({
        ...challengeInput({ id: 'HC-101', published: true }),
        flag: 'HC{import_flag}',
        prerequisites: ['HC-100'],
      }),
    );

    const result = await importChallenges(env.challengeService, source);
    assert.deepEqual(result.imported, ['HC-101']);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].error, /unknown prerequisite HC-100/);

    const raw = await env.challengeService.getRaw('HC-101');
    assert.deepEqual(raw.prerequisites, ['HC-100']);
  } finally {
    await fs.rm(source, { recursive: true, force: true });
    await env.cleanup();
  }
});

test('import can be limited to selected challenge ids', async () => {
  const env = await createTestEnv();
  const source = await fs.mkdtemp(path.join(env.dir, 'import-'));
  try {
    await fs.mkdir(path.join(source, 'easy'), { recursive: true });
    for (const id of ['HC-201', 'HC-202']) {
      await fs.writeFile(
        path.join(source, 'easy', `${id.toLowerCase()}.json`),
        JSON.stringify({
          ...challengeInput({ id, published: true }),
          flag: `HC{${id.toLowerCase()}}`,
        }),
      );
    }

    const result = await importChallenges(env.challengeService, source, { only: ['hc-202'] });
    assert.deepEqual(result.imported, ['HC-202']);
    assert.deepEqual(result.skipped, ['HC-201']);
    assert.equal(await env.challengeService.getRaw('HC-201'), null);
    assert.ok(await env.challengeService.getRaw('HC-202'));
  } finally {
    await fs.rm(source, { recursive: true, force: true });
    await env.cleanup();
  }
});
