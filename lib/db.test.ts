import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup, listRecent, countLookups } from './db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('sqlite lookup log', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-db-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  it('initializes the schema idempotently', () => {
    expect(() => initDb()).not.toThrow();
    expect(countLookups()).toBe(0);
  });

  it('inserts lookups and timestamps them', async () => {
    const before = Date.now();
    const row = insertLookup('8.8.8.8', 'US');
    expect(row.id).toBeGreaterThan(0);
    expect(row.ts).toBeGreaterThanOrEqual(before);
    expect(countLookups()).toBe(1);
    await sleep(5);
  });

  it('lists entries newest first and respects limit', () => {
    insertLookup('1.1.1.1', 'AU');
    const all = listRecent(10);
    expect(all).toHaveLength(2);
    expect(all[0].ip).toBe('1.1.1.1');
    expect(all[0].iso).toBe('AU');
    expect(typeof all[0].ts).toBe('number');
    const one = listRecent(1);
    expect(one).toHaveLength(1);
    expect(one[0].ip).toBe('1.1.1.1');
  });

  it('allows a null iso', () => {
    insertLookup('192.168.0.1', null);
    const rows = listRecent(10);
    expect(rows[0].ip).toBe('192.168.0.1');
    expect(rows[0].iso).toBeNull();
  });
});
