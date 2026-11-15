import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from '../src/storage/jsonStore.js';
import { makeTempDir, silentLogger } from './helpers.js';

test('JsonStore initializes missing files with defaults', async () => {
  const dir = await makeTempDir();
  try {
    const store = new JsonStore({ dir, file: 'test.json', defaults: { count: 0 }, logger: silentLogger });
    const data = await store.read();
    assert.equal(data.count, 0);
    const raw = JSON.parse(await fs.readFile(path.join(dir, 'test.json'), 'utf8'));
    assert.equal(raw.count, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('JsonStore serializes concurrent updates without lost writes', async () => {
  const dir = await makeTempDir();
  try {
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
    assert.equal(data.count, 50);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('JsonStore quarantines malformed data and recovers from backup', async () => {
  const dir = await makeTempDir();
  try {
    const store = new JsonStore({ dir, file: 'test.json', defaults: { value: 0 }, logger: silentLogger });
    await store.read();
    await store.write({ value: 1 });
    await store.write({ value: 2 });
    await fs.writeFile(path.join(dir, 'test.json'), '{ this is not json', 'utf8');

    const recovered = await store.read();
    assert.equal(recovered.value, 1);
    const files = await fs.readdir(dir);
    assert.ok(files.some((file) => file.startsWith('test.json.corrupt-')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('JsonStore rejects invalid writes and preserves prior data', async () => {
  const dir = await makeTempDir();
  try {
    const store = new JsonStore({
      dir,
      file: 'test.json',
      defaults: { count: 0 },
      validate: (data) => (typeof data.count === 'number' ? true : 'count must be a number'),
      logger: silentLogger,
    });
    await store.read();
    await assert.rejects(() => store.write({ count: 'nope' }), /validation failed/i);
    const data = await store.read();
    assert.equal(data.count, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('JsonStore backupTo copies the current snapshot', async () => {
  const dir = await makeTempDir();
  const backupDir = await makeTempDir();
  try {
    const store = new JsonStore({ dir, file: 'test.json', defaults: { value: 7 }, logger: silentLogger });
    await store.read();
    const target = await store.backupTo(backupDir);
    assert.ok(target);
    const copied = JSON.parse(await fs.readFile(target, 'utf8'));
    assert.equal(copied.value, 7);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(backupDir, { recursive: true, force: true });
  }
});
