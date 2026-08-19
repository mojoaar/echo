import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initDb,
  closeDb,
  insertLookup,
  countLookups,
  countSince,
  topCountryCodes,
  topIps,
  dailyCounts,
  pruneOldLookups,
  getRetentionDays,
} from './db';
import { getDb } from './db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let dbPath: string;

describe('sqlite lookup log', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-db-'));
    dbPath = join(dir, 'test.db');
    process.env.LOOKUP_RETENTION_DAYS = '1';
    initDb(dbPath);
  });

  afterAll(() => {
    delete process.env.LOOKUP_RETENTION_DAYS;
    delete process.env.DB_PATH;
    closeDb();
  });

  it('initializes the schema idempotently', () => {
    expect(() => initDb()).not.toThrow();
    expect(countLookups()).toBe(0);
    expect(topCountryCodes()).toEqual([]);
    expect(dailyCounts(Date.now())).toEqual([]);
    expect(getRetentionDays()).toBe(1);
    process.env.LOOKUP_RETENTION_DAYS = '0';
    expect(getRetentionDays()).toBe(90);
    process.env.LOOKUP_RETENTION_DAYS = '1';
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

  it('groups timestamps by UTC calendar day', () => {
    const previousRetention = process.env.LOOKUP_RETENTION_DAYS;
    process.env.LOOKUP_RETENTION_DAYS = '90';
    const midnight = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    const before = new Map(dailyCounts(midnight - 1, 2).map((row) => [row.day, row.count]));
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.1', 'US', midnight - 1);
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.2', 'US', midnight);
    const daily = dailyCounts(midnight - 1, 2);
    const previousDay = new Date(midnight - 1).toISOString().slice(0, 10);
    const currentDay = new Date(midnight).toISOString().slice(0, 10);
    expect((daily.find((row) => row.day === previousDay)?.count ?? 0) - (before.get(previousDay) ?? 0)).toBe(1);
    expect((daily.find((row) => row.day === currentDay)?.count ?? 0) - (before.get(currentDay) ?? 0)).toBe(1);
    process.env.LOOKUP_RETENTION_DAYS = previousRetention;
  });

  it('keeps null country values out of country aggregates', () => {
    insertLookup('192.0.2.1', null);
    const top = topCountryCodes(10);
    expect(top.some((country) => country.iso === null)).toBe(false);
  });

  it('reopens the same database without losing rows', () => {
    const before = countLookups();
    closeDb();
    initDb(dbPath);
    expect(countLookups()).toBe(before);
  });

  it('prunes rows strictly older than the exact retention cutoff', () => {
    const now = Date.now();
    process.env.LOOKUP_RETENTION_DAYS = '90';
    const cutoff = now - 90 * 86_400_000;
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.1', 'US', cutoff - 1);
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.2', 'US', cutoff);
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.3', 'US', now);

    expect(pruneOldLookups(now)).toBe(1);
    expect(getDb().prepare('SELECT ip FROM lookups WHERE ip LIKE ? ORDER BY ip').all('198.51.100.%')).toEqual([
      { ip: '198.51.100.2' },
      { ip: '198.51.100.3' },
    ]);
  });

  it('uses the supplied timestamp without scheduled pruning first', () => {
    const currentTime = Date.now();
    process.env.LOOKUP_RETENTION_DAYS = '1';
    const clock = vi.spyOn(Date, 'now').mockReturnValue(currentTime - 3_600_001);
    try {
      closeDb();
      const instance = initDb(dbPath);

      const suppliedNow = currentTime - 2 * 86_400_000;
      const cutoff = suppliedNow - 86_400_000;
      instance.prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.10', 'US', cutoff);
      instance.prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.11', 'US', cutoff - 1);

      clock.mockReturnValue(currentTime);
      expect(pruneOldLookups(suppliedNow)).toBe(1);
      expect(instance.prepare('SELECT ip FROM lookups WHERE ip IN (?, ?) ORDER BY ip').all('203.0.113.10', '203.0.113.11')).toEqual([
        { ip: '203.0.113.10' },
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not prune again until the one-hour interval elapses', () => {
    const currentTime = Date.now();
    process.env.LOOKUP_RETENTION_DAYS = '1';
    const clock = vi.spyOn(Date, 'now').mockReturnValue(currentTime);
    try {
      pruneOldLookups(currentTime);
      getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.10', 'US', currentTime - 2 * 86_400_000);
      getDb();
      expect(getDb().prepare('SELECT COUNT(*) AS count FROM lookups WHERE ip = ?').get('198.51.100.10')).toEqual({ count: 1 });
      clock.mockReturnValue(currentTime + 3_600_001);
      getDb();
      expect(getDb().prepare('SELECT COUNT(*) AS count FROM lookups WHERE ip = ?').get('198.51.100.10')).toEqual({ count: 0 });
    } finally {
      clock.mockRestore();
    }
  });
});
