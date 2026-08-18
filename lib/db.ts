import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { HistoryEntry } from './types';

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

export function listRecent(limit = 20): HistoryEntry[] {
  return getDb()
    .prepare('SELECT ip, iso, ts FROM lookups ORDER BY ts DESC, id DESC LIMIT ?')
    .all(limit) as HistoryEntry[];
}

export function countLookups(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM lookups').get() as { n: number };
  return row.n;
}