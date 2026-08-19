import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup, countLookups, countSince, topCountryCodes } from './db';

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

  it('counts lookups since a timestamp', async () => {
    insertLookup('1.1.1.1', 'AU');
    insertLookup('9.9.9.9', 'DE');
    const now = Date.now();
    await sleep(5);
    insertLookup('2.2.2.2', 'DE');
    expect(countSince(now)).toBe(1);
    expect(countSince(0)).toBe(4);
  });

  it('aggregates top country codes excluding null iso', () => {
    const top = topCountryCodes(10);
    const de = top.find((c) => c.iso === 'DE')?.count ?? 0;
    expect(de).toBe(2);
    expect(top.some((c) => c.iso === 'US')).toBe(true);
    expect(top.every((c) => /^[A-Z]{2}$/.test(c.iso))).toBe(true);
  });
});
