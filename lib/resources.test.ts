import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, getDb, initDb } from './db';
import {
  getResourceSamplerStatus,
  pruneResourceSamples,
  readResourceSample,
  startResourceSampler,
} from './resources';

const DAY_MS = 86_400_000;
const FIVE_MINUTES_MS = 300_000;

let root: string;
let dataPath: string;
let cgroupPath: string;
let dbPath: string;

function setFile(path: string, value: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, value);
}

function configurePaths(): void {
  process.env.DB_PATH = dbPath;
  process.env.RESOURCE_DATA_PATH = dataPath;
  process.env.RESOURCE_CGROUP_PATH = cgroupPath;
  process.env.TZ = 'UTC';
  delete process.env.ADMIN_TOKEN;
  delete process.env.ECHO_IMAGE_SIZE_BYTES;
  delete process.env.RESOURCE_DATABASE_PATH;
  mkdirSync(dataPath, { recursive: true });
  mkdirSync(cgroupPath, { recursive: true });
  setFile(join(cgroupPath, 'memory.current'), '4096\n');
  setFile(join(cgroupPath, 'memory.max'), '16384\n');
  setFile(join(cgroupPath, 'cpu.stat'), 'usage_usec 100000\n');
  setFile(join(cgroupPath, 'cpu.max'), '100000 100000\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'echo-resources-'));
  dataPath = join(root, 'data');
  cgroupPath = join(root, 'cgroup');
  dbPath = join(root, 'database.sqlite');
  configurePaths();
  initDb(dbPath);
});

afterEach(() => {
  vi.useRealTimers();
  closeDb();
  delete process.env.DB_PATH;
  delete process.env.RESOURCE_DATA_PATH;
  delete process.env.RESOURCE_CGROUP_PATH;
  delete process.env.TZ;
  delete process.env.ADMIN_TOKEN;
  delete process.env.ECHO_IMAGE_SIZE_BYTES;
  delete process.env.RESOURCE_DATABASE_PATH;
  rmSync(root, { recursive: true, force: true });
});

describe('resource measurements', () => {
  it('reads cgroup v2 memory limits and reports an unavailable first CPU sample', () => {
    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.memoryUsedBytes).toBe(4096);
    expect(sample.memoryLimitBytes).toBe(16384);
    expect(sample.cpuPercent).toBeNull();
    expect(sample.localTs).toBe('2023-11-14 22:13:20');
  });

  it('falls back to cgroup v1 memory files', () => {
    rmSync(join(cgroupPath, 'memory.current'));
    rmSync(join(cgroupPath, 'memory.max'));
    setFile(join(cgroupPath, 'memory', 'memory.usage_in_bytes'), '2048\n');
    setFile(join(cgroupPath, 'memory', 'memory.limit_in_bytes'), '8192\n');

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.memoryUsedBytes).toBe(2048);
    expect(sample.memoryLimitBytes).toBe(8192);
  });

  it('calculates CPU percentage from a cgroup usage delta', () => {
    readResourceSample(1_700_000_000_000);
    setFile(join(cgroupPath, 'cpu.stat'), 'usage_usec 200000\n');

    const sample = readResourceSample(1_700_000_001_000);

    expect(sample.cpuPercent).toBe(10);
  });

  it('breaks down data files and SQLite rows', () => {
    const databasePath = join(dataPath, 'echo.db');
    process.env.RESOURCE_DATABASE_PATH = databasePath;
    writeFileSync(databasePath, 'database');
    const databaseBytes = statSync(databasePath).size;
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.1', 'US', 1);
    getDb()
      .prepare(
        'INSERT INTO activity_events (ip, iso, ts, lookup_type, channel, actor, target, outcome, partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('203.0.113.1', 'US', 1, 'page', 'ui', 'browser', null, 'success', 0);
    writeFileSync(join(dataPath, 'echo.db-wal'), 'wal');
    writeFileSync(join(dataPath, 'echo.db-shm'), 'shm');
    writeFileSync(join(dataPath, 'uploads.bin'), 'other');

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.databaseBytes).toBe(databaseBytes);
    expect(sample.walBytes).toBe(3);
    expect(sample.shmBytes).toBe(3);
    expect(sample.otherDataBytes).toBe(5);
    expect(sample.lookupRows).toBe(1);
    expect(sample.activityRows).toBe(1);
    expect(sample.dataUsedBytes).toBeGreaterThanOrEqual(19);
  });

  it('reports uptime and an optional image size', () => {
    process.env.ECHO_IMAGE_SIZE_BYTES = '12345';
    vi.spyOn(process, 'uptime').mockReturnValue(42.9);

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.uptimeSeconds).toBe(42);
    expect(sample.imageSizeBytes).toBe(12345);
  });
});

describe('resource sampler lifecycle', () => {
  it('does not start when ADMIN_TOKEN is unset', () => {
    expect(startResourceSampler()).toBeNull();
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: false, running: false });
  });

  it('starts with a sample, schedules every five minutes, prunes 30-day history, and cleans up', () => {
    process.env.ADMIN_TOKEN = 'configured';
    vi.useFakeTimers();
    const cleanup = startResourceSampler();

    expect(cleanup).toEqual(expect.any(Function));
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 1 });
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: true, running: true });

    vi.advanceTimersByTime(FIVE_MINUTES_MS - 1);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 1 });
    vi.advanceTimersByTime(1);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 2 });

    const now = 1_700_000_000_000;
    getDb().prepare('INSERT INTO resource_samples (ts) VALUES (?)').run(now - 30 * DAY_MS - 1);
    getDb().prepare('INSERT INTO resource_samples (ts) VALUES (?)').run(now - 30 * DAY_MS);
    expect(pruneResourceSamples(now)).toBe(1);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 3 });

    cleanup?.();
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: true, running: false });
    vi.advanceTimersByTime(FIVE_MINUTES_MS);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 3 });
  });

  it('does not create duplicate samplers', () => {
    process.env.ADMIN_TOKEN = 'configured';
    const first = startResourceSampler();
    const second = startResourceSampler();

    expect(first).toEqual(expect.any(Function));
    expect(second).toBeNull();
    first?.();
  });
});
