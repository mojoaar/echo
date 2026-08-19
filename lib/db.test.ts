import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup, countLookups, countSince, topCountryCodes, topIps, dailyCounts } from './db';

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
    await sleep(5);
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

  it('lists top ips by descending count', () => {
    insertLookup('8.8.8.8', 'US');
    const top = topIps(10);
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((r) => r.ip && r.count >= 1)).toBe(true);
    expect(top.some((r) => r.ip === '8.8.8.8')).toBe(true);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].count).toBeGreaterThanOrEqual(top[i].count);
    }
  });

  it('breaks lookups down by calendar day', () => {
    const daily = dailyCounts(0, 365);
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day))).toBe(true);
    const sum = daily.reduce((acc, r) => acc + r.count, 0);
    expect(sum).toBe(countLookups());
  });
});
