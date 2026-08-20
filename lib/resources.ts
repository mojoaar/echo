import { readdirSync, readFileSync, realpathSync, statfsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { getDb, insertResourceSample, type ResourceSampleRecord } from './db';

const FIVE_MINUTES_MS = 300_000;
const RESOURCE_RETENTION_MS = 30 * 86_400_000;

export type ResourceSampleInput = ResourceSampleRecord;

export interface ResourceSamplerStatus {
  enabled: boolean;
  running: boolean;
  lastSuccessTs: number | null;
  lastError: string | null;
}

interface CpuSample {
  path: string;
  usage: number;
  nowMs: number;
}

let samplerTimer: ReturnType<typeof setInterval> | null = null;
let lastCpuSample: CpuSample | null = null;
let lastSuccessTs: number | null = null;
let lastError: string | null = null;

function adminConfigured(): boolean {
  return process.env.NODE_ENV !== 'test' && Boolean(process.env.ADMIN_TOKEN?.trim());
}

function readNumber(path: string): number | null {
  try {
    const value = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function cgroupPath(): string {
  return process.env.RESOURCE_CGROUP_PATH ?? '/sys/fs/cgroup';
}

function memoryMeasurement(): Pick<ResourceSampleInput, 'memoryUsedBytes' | 'memoryLimitBytes'> {
  const root = cgroupPath();
  const v2Used = readNumber(join(root, 'memory.current'));
  const v2LimitRaw = (() => {
    try {
      return readFileSync(join(root, 'memory.max'), 'utf8').trim();
    } catch {
      return null;
    }
  })();
  if (v2Used !== null || v2LimitRaw !== null) {
    const limit = v2LimitRaw && v2LimitRaw !== 'max' ? Number.parseInt(v2LimitRaw, 10) : null;
    return {
      memoryUsedBytes: v2Used,
      memoryLimitBytes: Number.isSafeInteger(limit) && (limit as number) >= 0 ? limit : null,
    };
  }
  return {
    memoryUsedBytes: readNumber(join(root, 'memory', 'memory.usage_in_bytes')),
    memoryLimitBytes: readNumber(join(root, 'memory', 'memory.limit_in_bytes')),
  };
}

function cpuMeasurement(nowMs: number): number | null {
  const root = cgroupPath();
  let usage: number | null = null;
  let usageUnit = 1;
  const v2Usage = (() => {
    try {
      const line = readFileSync(join(root, 'cpu.stat'), 'utf8').split('\n').find((entry) => entry.startsWith('usage_usec '));
      return line ? Number.parseInt(line.slice('usage_usec '.length), 10) : null;
    } catch {
      return null;
    }
  })();
  if (v2Usage !== null && Number.isSafeInteger(v2Usage)) usage = v2Usage;
  else {
    const v1Usage = readNumber(join(root, 'cpuacct', 'cpuacct.usage'));
    if (v1Usage !== null) {
      usage = v1Usage;
      usageUnit = 1_000;
    }
  }
  if (usage === null) return null;
  const current = { path: root, usage, nowMs };
  const previous = lastCpuSample;
  lastCpuSample = current;
  if (!previous || previous.path !== root || nowMs <= previous.nowMs || usage < previous.usage) return null;
  const elapsedMicros = (nowMs - previous.nowMs) * 1_000;
  const usageMicros = (usage - previous.usage) / usageUnit;
  const v2Quota = (() => {
    try {
      const [quotaValue, periodValue] = readFileSync(join(root, 'cpu.max'), 'utf8').trim().split(/\s+/);
      return quotaValue === 'max' ? null : { quota: Number.parseInt(quotaValue, 10), period: Number.parseInt(periodValue, 10) };
    } catch {
      return null;
    }
  })();
  const quota = v2Quota?.quota ?? readNumber(join(root, 'cpu', 'cpu.cfs_quota_us'));
  const period = v2Quota?.period ?? readNumber(join(root, 'cpu', 'cpu.cfs_period_us'));
  const cpuCapacity = quota !== null && period !== null && period > 0 ? quota / period : 1;
  const percent = (usageMicros / elapsedMicros / cpuCapacity) * 100;
  return Number.isFinite(percent) ? Math.round(percent * 100) / 100 : null;
}

function dataPath(): string {
  return process.env.RESOURCE_DATA_PATH ?? '/data';
}

function fileSize(path: string): number {
  try {
    const stat = statSync(path);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function directorySize(path: string): number {
  try {
    const stat = statSync(path);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
      if (entry.isSymbolicLink()) return total;
      return total + directorySize(join(path, entry.name));
    }, 0);
  } catch {
    return 0;
  }
}

function isRealPathInData(root: string, path: string): boolean {
  try {
    const relativePath = relative(realpathSync(root), realpathSync(path));
    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
  } catch {
    return false;
  }
}

function dataMeasurement(): Pick<ResourceSampleInput, 'dataUsedBytes' | 'databaseBytes' | 'walBytes' | 'shmBytes' | 'otherDataBytes'> {
  const root = dataPath();
  const databasePath = process.env.RESOURCE_DATABASE_PATH ?? process.env.DB_PATH ?? join(root, 'echo.db');
  const databaseBytes = fileSize(databasePath);
  const walBytes = fileSize(`${databasePath}-wal`);
  const shmBytes = fileSize(`${databasePath}-shm`);
  let dataUsedBytes: number | null = null;
  try {
    const stat = statfsSync(root);
    dataUsedBytes = Math.max(0, (stat.blocks - stat.bavail) * stat.bsize);
  } catch {
    dataUsedBytes = directorySize(root);
  }
  const componentPaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  const dataComponents = componentPaths.filter((path) => isRealPathInData(root, path));
  const dataComponentBytes = dataComponents.reduce((total, path) => total + fileSize(path), 0);
  const otherDataBytes = Math.max(0, directorySize(root) - dataComponentBytes);
  return { dataUsedBytes, databaseBytes, walBytes, shmBytes, otherDataBytes };
}

function localTimestamp(nowMs: number): string | null {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: process.env.TZ || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const values = new Map(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${values.get('year')}-${values.get('month')}-${values.get('day')} ${values.get('hour')}:${values.get('minute')}:${values.get('second')}`;
  } catch {
    return null;
  }
}

function imageSize(): number | null {
  const value = Number.parseInt(process.env.ECHO_IMAGE_SIZE_BYTES ?? '', 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readRowCount(table: 'lookups' | 'activity_events'): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

export function readResourceSample(nowMs = Date.now()): ResourceSampleInput {
  const memory = memoryMeasurement();
  const data = dataMeasurement();
  return {
    ts: nowMs,
    cpuPercent: cpuMeasurement(nowMs),
    ...memory,
    ...data,
    lookupRows: readRowCount('lookups'),
    activityRows: readRowCount('activity_events'),
    uptimeSeconds: Math.floor(process.uptime()),
    localTs: localTimestamp(nowMs),
    imageSizeBytes: imageSize(),
  };
}

export function pruneResourceSamples(nowMs = Date.now()): number {
  return getDb().prepare('DELETE FROM resource_samples WHERE ts < ?').run(nowMs - RESOURCE_RETENTION_MS).changes;
}

function saveResourceSample(): void {
  const sample = readResourceSample();
  insertResourceSample(sample);
  pruneResourceSamples(sample.ts);
  lastSuccessTs = sample.ts;
  lastError = null;
}

function stopResourceSampler(): void {
  if (samplerTimer) clearInterval(samplerTimer);
  samplerTimer = null;
  lastCpuSample = null;
}

export function startResourceSampler(): (() => void) | null {
  if (!adminConfigured()) {
    if (samplerTimer) stopResourceSampler();
    return null;
  }
  if (samplerTimer) return null;
  try {
    saveResourceSample();
  } catch {
    lastError = 'sample_failed';
  }
  samplerTimer = setInterval(() => {
    if (!adminConfigured()) {
      stopResourceSampler();
      return;
    }
    try {
      saveResourceSample();
    } catch {
      lastError = 'sample_failed';
    }
  }, FIVE_MINUTES_MS);
  return stopResourceSampler;
}

export function getResourceSamplerStatus(): ResourceSamplerStatus {
  if (!adminConfigured() && samplerTimer) stopResourceSampler();
  return {
    enabled: adminConfigured(),
    running: samplerTimer !== null,
    lastSuccessTs,
    lastError,
  };
}
