import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { adminJson, requireAdmin } from '@/lib/admin-route';
import { getResourceSamplerStatus } from '@/lib/resources';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function invalidInput(): Response {
  return apiError(400, 'invalid input', 'invalid_input', { 'cache-control': 'no-store' });
}

function parseDate(value: string | null): number | null {
  if (!value || !datePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return Number.isFinite(date.getTime()) && normalized === value ? date.getTime() : null;
}

function dateRange(url: URL): { from: number; to: number } | null {
  const now = Date.now();
  const fromValue = url.searchParams.get('from');
  const toValue = url.searchParams.get('to');
  const from = fromValue ? parseDate(fromValue) : now - 30 * DAY_MS;
  const parsedTo = toValue ? parseDate(toValue) : now;
  if (from === null || parsedTo === null || from > parsedTo || parsedTo > now || now - from > 30 * DAY_MS) return null;
  return { from, to: toValue ? parsedTo + DAY_MS - 1 : parsedTo };
}

function resourceRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ts: row.ts,
    cpuPercent: row.cpu_percent,
    memoryUsedBytes: row.memory_used_bytes,
    memoryLimitBytes: row.memory_limit_bytes,
    dataUsedBytes: row.data_used_bytes,
    databaseBytes: row.database_bytes,
    walBytes: row.wal_bytes,
    shmBytes: row.shm_bytes,
    otherDataBytes: row.other_data_bytes,
    lookupRows: row.lookup_rows,
    activityRows: row.activity_rows,
    uptimeSeconds: row.uptime_seconds,
    localTs: row.local_ts,
    imageSizeBytes: row.image_size_bytes,
  };
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const range = dateRange(new URL(request.url));
  if (!range) return invalidInput();
  const startedAt = Date.now();
  try {
    const rows = getDb().prepare(
      'SELECT ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes, wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts, image_size_bytes FROM resource_samples WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?',
    ).all(range.from, range.to, 1_000) as Array<Record<string, unknown>>;
    return adminJson({ current: rows[0] ? resourceRow(rows[0]) : null, sampler: getResourceSamplerStatus(), history: rows.map(resourceRow) });
  } catch {
    console.error(JSON.stringify({ category: 'database_read', endpoint: '/api/admin/resources', status: 500, durationMs: Math.max(0, Date.now() - startedAt) }));
    return apiError(500, 'internal server error', 'internal_error', { 'cache-control': 'no-store' });
  }
}
