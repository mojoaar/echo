import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { CountryCount } from './types';

let db: Database.Database | null = null;

function schemaSql(): string {
  const schemaPath = process.env.SCHEMA_PATH ?? join(process.cwd(), 'schema.sql');
  return readFileSync(schemaPath, 'utf-8');
}

export function initDb(path = process.env.DB_PATH ?? 'echo.db'): Database.Database {
  if (db) return db;
  const instance = new Database(path);
  instance.pragma('journal_mode = WAL');
  instance.exec(schemaSql());
  db = instance;
  return instance;
}

export function getDb(): Database.Database {
  return db ?? initDb();
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
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