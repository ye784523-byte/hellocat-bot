import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv } from './helpers.js';
import { SHOP_ITEMS } from '../src/constants/index.js';

test('economy credits and debits with duplicate-reference protection', async () => {
  const env = await createTestEnv();
  try {
    const first = await env.economyService.credit('user-1', 100, { reason: 'test', ref: 'ref-1' });
    assert.equal(first.credited, 100);
    assert.equal(first.duplicate, false);

    const duplicate = await env.economyService.credit('user-1', 100, { reason: 'test', ref: 'ref-1' });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.credited, 0);
    assert.equal(await env.economyService.getBalance('user-1'), 100);

    await env.economyService.debit('user-1', 40, { reason: 'test' });
    assert.equal(await env.economyService.getBalance('user-1'), 60);

    await assert.rejects(
      () => env.economyService.debit('user-1', 1000, { reason: 'test' }),
      /insufficient/i,
    );
    assert.equal(await env.economyService.getBalance('user-1'), 60);
  } finally {
    await env.cleanup();
  }
});

test('shop purchase debits coins, grants inventory and blocks duplicates', async () => {
  const env = await createTestEnv();
  try {
    await env.economyService.credit('user-1', 1000, { reason: 'test' });
    const item = SHOP_ITEMS[0];
    const result = await env.economyService.purchase('user-1', item.id);
    assert.equal(result.account.coins, 1000 - item.price);
    assert.equal(result.item.id, item.id);

    const inventory = await env.economyService.inventory('user-1');
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].itemId, item.id);

    await assert.rejects(() => env.economyService.purchase('user-1', item.id), /already own/i);
    await assert.rejects(() => env.economyService.purchase('user-1', 'does-not-exist'), /does not exist/i);
  } finally {
    await env.cleanup();
  }
});

test('insufficient funds prevent purchase and leave balance intact', async () => {
  const env = await createTestEnv();
  try {
    await env.economyService.credit('user-1', 10, { reason: 'test' });
    const item = SHOP_ITEMS.find((entry) => entry.price > 10);
    await assert.rejects(() => env.economyService.purchase('user-1', item.id), /insufficient/i);
    assert.equal(await env.economyService.getBalance('user-1'), 10);
    assert.equal((await env.economyService.inventory('user-1')).length, 0);
  } finally {
    await env.cleanup();
  }
});

test('negative or zero amounts are rejected', async () => {
  const env = await createTestEnv();
  try {
    await assert.rejects(() => env.economyService.credit('user-1', -5), /positive integer/i);
    await assert.rejects(() => env.economyService.credit('user-1', 0), /positive integer/i);
    await assert.rejects(() => env.economyService.debit('user-1', -5), /positive integer/i);
  } finally {
    await env.cleanup();
  }
});
