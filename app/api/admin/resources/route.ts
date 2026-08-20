import { adminDateRange } from '@/lib/admin-date';
import { getDb, readDatabaseBreakdown } from '@/lib/db';
import { adminJson, requireAdmin } from '@/lib/admin-route';
import { getResourceSamplerStatus } from '@/lib/resources';

export const dynamic = 'force-dynamic';


function invalidInput(): Response {
  return adminJson({ error: 'invalid input', code: 'invalid_input' }, 400);
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
  const range = adminDateRange(new URL(request.url), 30);
  if (!range) return invalidInput();
  const startedAt = Date.now();
  try {
    const db = getDb();
    const current = db.prepare(
      'SELECT ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes, wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts, image_size_bytes FROM resource_samples ORDER BY ts DESC LIMIT 1',
    ).get() as Record<string, unknown> | undefined;
    const rows = db.prepare(
      'SELECT ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes, wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts, image_size_bytes FROM resource_samples WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?',
    ).all(range.from, range.to, 1_000) as Array<Record<string, unknown>>;
    return adminJson({
      current: current ? resourceRow(current) : null,
      sampler: getResourceSamplerStatus(),
      history: rows.map(resourceRow),
      storage: readDatabaseBreakdown(),
    });
  } catch {
    console.error(JSON.stringify({ category: 'database_read', endpoint: '/api/admin/resources', status: 500, durationMs: Math.max(0, Date.now() - startedAt) }));
    return adminJson({ error: 'internal server error', code: 'internal_error' }, 500);
  }
}
