import test from 'node:test';
import assert from 'node:assert/strict';
import { CooldownManager } from '../src/utils/cooldowns.js';
import { AntiSpamTracker } from '../src/utils/antiSpam.js';

test('cooldowns block until the window expires and then allow again', async () => {
  let now = 1000;
  const manager = new CooldownManager({ now: () => now });
  assert.equal(manager.remaining('key', 5), 0);
  assert.equal(await manager.guard('key', 5), 0);
  assert.ok(manager.remaining('key', 5) > 0);
  const blocked = await manager.guard('key', 5);
  assert.ok(blocked > 0);
  now += 5000;
  assert.equal(manager.remaining('key', 5), 0);
  assert.equal(await manager.guard('key', 5), 0);
});

test('cooldown keys are isolated per user/command', async () => {
  const manager = new CooldownManager({ now: () => 0 });
  assert.equal(await manager.guard('ping:user-a', 3), 0);
  assert.equal(await manager.guard('ping:user-b', 3), 0);
  assert.ok((await manager.guard('ping:user-a', 3)) > 0);
});

test('anti-spam detects message floods', () => {
  let now = 0;
  const tracker = new AntiSpamTracker({ now: () => now });
  for (let i = 0; i < 8; i += 1) {
    const result = tracker.record('user-1', `message ${i}`);
    assert.equal(result.violation, null);
  }
  const violation = tracker.record('user-1', 'message 8');
  assert.equal(violation.violation, 'rate');
});

test('anti-spam detects duplicate message patterns and throttles warnings', () => {
  let now = 0;
  const tracker = new AntiSpamTracker({ now: () => now });
  for (let i = 0; i < 4; i += 1) {
    assert.equal(tracker.record('user-1', 'same content').violation, null);
  }
  const violation = tracker.record('user-1', 'same content');
  assert.equal(violation.violation, 'duplicate');
  assert.equal(tracker.canWarn('user-1'), true);
  assert.equal(tracker.canWarn('user-1'), false);
  now += 61_000;
  assert.equal(tracker.canWarn('user-1'), true);
});
