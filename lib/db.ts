import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { CountryCount } from './types';

export interface ResourceSampleRecord {
  ts: number;
  cpuPercent: number | null;
  memoryUsedBytes: number | null;
  memoryLimitBytes: number | null;
  dataUsedBytes: number | null;
  databaseBytes: number | null;
  walBytes: number | null;
  shmBytes: number | null;
  otherDataBytes: number | null;
  lookupRows: number | null;
  activityRows: number | null;
  uptimeSeconds: number | null;
  localTs: string | null;
  imageSizeBytes: number | null;
  networkIngressBps: number | null;
  networkEgressBps: number | null;
}

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
  instance.prepare('DELETE FROM activity_events WHERE ts < ?').run(cutoff);
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
  ensureResourceSampleColumns(instance);
  db = instance;
  return instance;
}

function ensureResourceSampleColumns(instance: Database.Database): void {
  const columns = new Set((instance.prepare('PRAGMA table_info(resource_samples)').all() as Array<{ name: string }>).map((column) => column.name));
  const additions: Array<[string, string]> = [
    ['network_ingress_bps', 'network_ingress_bps REAL'],
    ['network_egress_bps', 'network_egress_bps REAL'],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) instance.exec(`ALTER TABLE resource_samples ADD COLUMN ${definition}`);
  }
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

export function countSince(tsMs: number): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM activity_events WHERE ts >= ?').get(tsMs) as { n: number };
  return row.n;
}

export function topCountryCodes(limit = 10): CountryCount[] {
  return getDb()
    .prepare(
      'SELECT iso, COUNT(*) AS count FROM activity_events WHERE iso IS NOT NULL GROUP BY iso ORDER BY count DESC, iso ASC LIMIT ?'
    )
    .all(limit) as CountryCount[];
}

export function countLookups(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM activity_events').get() as { n: number };
  return row.n;
}

export function topIps(limit = 10): { ip: string; count: number }[] {
  return getDb()
    .prepare('SELECT ip, COUNT(*) AS count FROM activity_events GROUP BY ip ORDER BY count DESC, ip ASC LIMIT ?')
    .all(limit) as { ip: string; count: number }[];
}

export function dailyCounts(sinceTs: number, days = 7): { day: string; count: number }[] {
  return getDb()
    .prepare(
      "SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS count FROM activity_events WHERE ts >= ? GROUP BY day ORDER BY day ASC LIMIT ?"
    )
    .all(sinceTs, days) as { day: string; count: number }[];
}

export function insertResourceSample(sample: ResourceSampleRecord): void {
  getDb()
    .prepare(
      `INSERT INTO resource_samples
        (ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes,
         wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts,
         image_size_bytes, network_ingress_bps, network_egress_bps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sample.ts,
      sample.cpuPercent,
      sample.memoryUsedBytes,
      sample.memoryLimitBytes,
      sample.dataUsedBytes,
      sample.databaseBytes,
      sample.walBytes,
      sample.shmBytes,
      sample.otherDataBytes,
      sample.lookupRows,
      sample.activityRows,
      sample.uptimeSeconds,
      sample.localTs,
      sample.imageSizeBytes,
      sample.networkIngressBps,
      sample.networkEgressBps,
    );
}

export function activityRetentionCutoff(nowMs = Date.now()): number {
  return nowMs - getRetentionDays() * DAY_MS;
}

export interface StorageItem {
  name: string;
  kind: 'table' | 'index';
  bytes: number;
  pages: number;
  cells: number;
}

export interface StorageBreakdown {
  fileBytes: number;
  pageSize: number;
  pageCount: number;
  freelistCount: number;
  freelistBytes: number;
  items: StorageItem[];
}

export function readDatabaseBreakdown(): StorageBreakdown | null {
  try {
    const instance = getDb();
    const { page_size: pageSize } = instance.prepare('PRAGMA page_size').get() as { page_size: number };
    const { page_count: pageCount } = instance.prepare('PRAGMA page_count').get() as { page_count: number };
    const { freelist_count: freelistCount } = instance.prepare('PRAGMA freelist_count').get() as { freelist_count: number };
    const rows = instance
      .prepare('SELECT name, SUM(pgsize) AS bytes, SUM(ncell) AS cells, COUNT(*) AS pages FROM dbstat GROUP BY name ORDER BY bytes DESC')
      .all() as { name: string; bytes: number; cells: number; pages: number }[];
    return {
      fileBytes: pageSize * pageCount,
      pageSize,
      pageCount,
      freelistCount,
      freelistBytes: freelistCount * pageSize,
      items: rows.map((row) => ({
        name: row.name,
        kind: row.name.startsWith('idx_') ? 'index' : 'table',
        bytes: row.bytes,
        pages: row.pages,
        cells: row.cells,
      })),
    };
  } catch {
    return null;
  }
}

export function pruneActivity(nowMs = Date.now()): number {
  if (db) return db.prepare('DELETE FROM activity_events WHERE ts < ?').run(activityRetentionCutoff(nowMs)).changes;

  const instance = openDb(process.env.DB_PATH ?? 'echo.db');
  try {
    return instance.prepare('DELETE FROM activity_events WHERE ts < ?').run(activityRetentionCutoff(nowMs)).changes;
  } finally {
    closeDb();
  }
}
