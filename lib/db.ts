import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { CountryCount } from './types';

let db: Database.Database | null = null;
let lastPrunedAt = 0;

const DAY_MS = 86_400_000;
const PRUNE_INTERVAL_MS = 3_600_000;

function schemaSql(): string {
  const schemaPath = process.env.SCHEMA_PATH ?? join(process.cwd(), 'schema.sql');
  return readFileSync(schemaPath, 'utf-8');
}

function configuredRetentionDays(): number {
  const value = Number.parseInt(process.env.LOOKUP_RETENTION_DAYS ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : 90;
}

function pruneWithDatabase(instance: Database.Database, nowMs: number): number {
  const cutoff = nowMs - configuredRetentionDays() * DAY_MS;
  const result = instance.prepare('DELETE FROM lookups WHERE ts < ?').run(cutoff);
  lastPrunedAt = nowMs;
  return result.changes;
}

function pruneIfDue(instance: Database.Database, nowMs: number): void {
  if (nowMs - lastPrunedAt >= PRUNE_INTERVAL_MS) pruneWithDatabase(instance, nowMs);
}

function openDb(path: string): Database.Database {
  const instance = new Database(path);
  instance.pragma('journal_mode = WAL');
  instance.exec(schemaSql());
  db = instance;
  return instance;
}

export function initDb(path = process.env.DB_PATH ?? 'echo.db'): Database.Database {
  if (db) {
    pruneIfDue(db, Date.now());
    return db;
  }
  const instance = openDb(path);
  pruneWithDatabase(instance, Date.now());
  return instance;
}

export function getDb(): Database.Database {
  if (!db) return initDb();
  pruneIfDue(db, Date.now());
  return db;
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      console.error(JSON.stringify({ category: 'database_close', endpoint: 'database', status: 'error', durationMs: 0 }));
    }
    db = null;
    lastPrunedAt = 0;
  }
}

export function pruneOldLookups(nowMs = Date.now()): number {
  return pruneWithDatabase(db ?? openDb(process.env.DB_PATH ?? 'echo.db'), nowMs);
}

export function getRetentionDays(): number {
  return configuredRetentionDays();
}

export function isDbReady(): boolean {
  if (!db?.open) return false;
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

export function insertLookup(ip: string, iso: string | null): { id: number; ts: number } {
  const ts = Date.now();
  const result = getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run(ip, iso, ts);
  return { id: Number(result.lastInsertRowid), ts };
}

export function countSince(tsMs: number): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM lookups WHERE ts >= ?').get(tsMs) as { n: number };
  return row.n;
}

export function topCountryCodes(limit = 10): CountryCount[] {
  return getDb()
    .prepare(
      'SELECT iso, COUNT(*) AS count FROM lookups WHERE iso IS NOT NULL GROUP BY iso ORDER BY count DESC, iso ASC LIMIT ?'
    )
    .all(limit) as CountryCount[];
}

export function countLookups(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM lookups').get() as { n: number };
  return row.n;
}

export function topIps(limit = 10): { ip: string; count: number }[] {
  return getDb()
    .prepare('SELECT ip, COUNT(*) AS count FROM lookups GROUP BY ip ORDER BY count DESC, ip ASC LIMIT ?')
    .all(limit) as { ip: string; count: number }[];
}

export function dailyCounts(sinceTs: number, days = 7): { day: string; count: number }[] {
  return getDb()
    .prepare(
      "SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS count FROM lookups WHERE ts >= ? GROUP BY day ORDER BY day ASC LIMIT ?"
    )
    .all(sinceTs, days) as { day: string; count: number }[];
}

export function activityRetentionCutoff(nowMs = Date.now()): number {
  return nowMs - getRetentionDays() * DAY_MS;
}

export function pruneActivity(nowMs = Date.now()): number {
  const instance = db ?? openDb(process.env.DB_PATH ?? 'echo.db');
  return instance.prepare('DELETE FROM activity_events WHERE ts < ?').run(activityRetentionCutoff(nowMs)).changes;
}
