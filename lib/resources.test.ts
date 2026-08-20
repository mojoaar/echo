import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, getDb, initDb } from './db';
import {
  getResourceSamplerStatus,
  pruneResourceSamples,
  readResourceSample,
  startResourceSampler,
  stopResourceSampler,
} from './resources';

const DAY_MS = 86_400_000;
const FIVE_MINUTES_MS = 300_000;

let root: string;
let dataPath: string;
let cgroupPath: string;
let dbPath: string;
let samplerCleanup: (() => void) | null = null;

function setFile(path: string, value: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, value);
}

function configurePaths(): void {
  process.env.DB_PATH = dbPath;
  process.env.RESOURCE_DATA_PATH = dataPath;
  process.env.RESOURCE_CGROUP_PATH = cgroupPath;
  process.env.TZ = 'UTC';
  vi.stubEnv('NODE_ENV', '');
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
  samplerCleanup?.();
  samplerCleanup = null;
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

  it('falls back to UTC for an invalid configured timezone', () => {
    process.env.TZ = 'Invalid/Timezone';

    const sample = readResourceSample(1_700_000_000_000);

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
    const databasePath = join(dataPath, 'state', 'app.sqlite');
    process.env.RESOURCE_DATABASE_PATH = databasePath;
    mkdirSync(join(dataPath, 'state'), { recursive: true });
    writeFileSync(databasePath, 'database');
    const databaseBytes = statSync(databasePath).size;
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.1', 'US', 1);
    getDb()
      .prepare(
        'INSERT INTO activity_events (ip, iso, ts, lookup_type, channel, actor, target, outcome, partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('203.0.113.1', 'US', 1, 'page', 'ui', 'browser', null, 'success', 0);
    writeFileSync(`${databasePath}-wal`, 'wal');
    writeFileSync(`${databasePath}-shm`, 'shm');
    writeFileSync(join(dataPath, 'uploads.bin'), 'other');

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.databaseBytes).toBe(databaseBytes);
    expect(sample.walBytes).toBe(3);
    expect(sample.shmBytes).toBe(3);
    expect(sample.otherDataBytes).toBe(5);
    expect(sample.lookupRows).toBeNull();
    expect(sample.activityRows).toBe(1);
    expect(sample.dataUsedBytes).toBeGreaterThanOrEqual(19);
  });

  it('does not subtract configured database files outside data from other data', () => {
    const databasePath = join(root, 'outside.sqlite');
    process.env.RESOURCE_DATABASE_PATH = databasePath;
    writeFileSync(databasePath, 'database');
    writeFileSync(`${databasePath}-wal`, 'wal');
    writeFileSync(`${databasePath}-shm`, 'shm');
    writeFileSync(join(dataPath, 'echo.db-wal'), 'legacy-wal');
    writeFileSync(join(dataPath, 'echo.db-shm'), 'legacy-shm');
    writeFileSync(join(dataPath, 'local.bin'), 'local');

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.databaseBytes).toBe(8);
    expect(sample.walBytes).toBe(3);
    expect(sample.shmBytes).toBe(3);
    expect(sample.otherDataBytes).toBe(5 + 10 + 10);
  });

  it('does not subtract database components symlinked outside data from other data', () => {
    const databasePath = join(dataPath, 'linked.sqlite');
    const outsideDatabasePath = join(root, 'outside.sqlite');
    const outsideWalPath = join(root, 'outside.sqlite-wal');
    const outsideShmPath = join(root, 'outside.sqlite-shm');
    process.env.RESOURCE_DATABASE_PATH = databasePath;
    writeFileSync(outsideDatabasePath, 'database');
    writeFileSync(outsideWalPath, 'wal');
    writeFileSync(outsideShmPath, 'shm');
    symlinkSync(outsideDatabasePath, databasePath);
    symlinkSync(outsideWalPath, `${databasePath}-wal`);
    symlinkSync(outsideShmPath, `${databasePath}-shm`);
    writeFileSync(join(dataPath, 'local.bin'), 'local');

    const sample = readResourceSample(1_700_000_000_000);

    expect(sample.databaseBytes).toBe(8);
    expect(sample.walBytes).toBe(3);
    expect(sample.shmBytes).toBe(3);
    expect(sample.otherDataBytes).toBe(5);
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

  it('does not start directly in test mode even when ADMIN_TOKEN is configured', () => {
    vi.stubEnv('NODE_ENV', 'test');
    process.env.ADMIN_TOKEN = 'configured';

    samplerCleanup = startResourceSampler();
    expect(samplerCleanup).toBeNull();
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: false, running: false });
  });

  it('stops sampling after ADMIN_TOKEN is removed', () => {
    process.env.ADMIN_TOKEN = 'configured';
    vi.useFakeTimers();
    samplerCleanup = startResourceSampler();

    expect(samplerCleanup).toEqual(expect.any(Function));
    delete process.env.ADMIN_TOKEN;
    vi.advanceTimersByTime(FIVE_MINUTES_MS);

    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 1 });
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: false, running: false });
    samplerCleanup?.();
  });

  it('clears the CPU baseline when the sampler is stopped and restarted', () => {
    process.env.ADMIN_TOKEN = 'configured';
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    samplerCleanup = startResourceSampler();

    setFile(join(cgroupPath, 'cpu.stat'), 'usage_usec 200000\n');
    vi.advanceTimersByTime(FIVE_MINUTES_MS);
    samplerCleanup?.();
    samplerCleanup = null;

    setFile(join(cgroupPath, 'cpu.stat'), 'usage_usec 300000\n');
    samplerCleanup = startResourceSampler();

    const sample = getDb()
      .prepare('SELECT cpu_percent AS cpuPercent FROM resource_samples ORDER BY id DESC LIMIT 1')
      .get() as { cpuPercent: number | null };
    expect(sample.cpuPercent).toBeNull();
  });

  it('starts with a sample, schedules every five minutes, prunes 30-day history, and cleans up', () => {
    process.env.ADMIN_TOKEN = 'configured';
    vi.useFakeTimers();
    samplerCleanup = startResourceSampler();

    expect(samplerCleanup).toEqual(expect.any(Function));
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

    samplerCleanup?.();
    expect(getResourceSamplerStatus()).toMatchObject({ enabled: true, running: true });
    vi.advanceTimersByTime(FIVE_MINUTES_MS);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 4 });
  });

  it('self-heals a configured but stopped sampler on status check', () => {
    process.env.ADMIN_TOKEN = 'configured';
    vi.useFakeTimers();

    expect(getResourceSamplerStatus()).toMatchObject({ enabled: true, running: true });
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 1 });

    vi.advanceTimersByTime(FIVE_MINUTES_MS);
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM resource_samples').get()).toEqual({ count: 2 });

    stopResourceSampler();
  });

  it('retains only the last 30 days of resource samples in SQLite', () => {
    const now = 1_700_000_000_000;
    const insert = getDb().prepare('INSERT INTO resource_samples (ts) VALUES (?)');
    insert.run(now - 30 * DAY_MS - 1);
    insert.run(now - 30 * DAY_MS);
    insert.run(now);

    expect(pruneResourceSamples(now)).toBe(1);
    expect(getDb().prepare('SELECT ts FROM resource_samples ORDER BY ts ASC').all()).toEqual([
      { ts: now - 30 * DAY_MS },
      { ts: now },
    ]);
  });

  it('does not create duplicate samplers', () => {
    process.env.ADMIN_TOKEN = 'configured';
    const first = (samplerCleanup = startResourceSampler());
    const second = startResourceSampler();

    expect(first).toEqual(expect.any(Function));
    expect(second).toBeNull();
    first?.();
    samplerCleanup = null;
  });
});
