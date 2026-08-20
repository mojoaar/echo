import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, isAdminEnabled, verifyAdminSession } from '@/lib/admin-auth';
import { adminDateRange, containerDate } from '@/lib/admin-date';
import { queryActivity, type ActivityQueryResult } from '@/lib/activity';
import { getDb, getRetentionDays } from '@/lib/db';
import { getResourceSamplerStatus } from '@/lib/resources';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminControls from '@/components/admin/AdminControls';
import type { AdminResources, AdminResourceRow } from '@/components/admin/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'echo admin',
  robots: { index: false, follow: false },
};

function resourceRow(row: Record<string, unknown>): AdminResourceRow {
  return {
    ts: Number(row.ts),
    cpuPercent: typeof row.cpuPercent === 'number' ? row.cpuPercent : row.cpu_percent as number | null,
    memoryUsedBytes: typeof row.memoryUsedBytes === 'number' ? row.memoryUsedBytes : row.memory_used_bytes as number | null,
    memoryLimitBytes: typeof row.memoryLimitBytes === 'number' ? row.memoryLimitBytes : row.memory_limit_bytes as number | null,
    dataUsedBytes: typeof row.dataUsedBytes === 'number' ? row.dataUsedBytes : row.data_used_bytes as number | null,
    databaseBytes: typeof row.databaseBytes === 'number' ? row.databaseBytes : row.database_bytes as number | null,
    walBytes: typeof row.walBytes === 'number' ? row.walBytes : row.wal_bytes as number | null,
    shmBytes: typeof row.shmBytes === 'number' ? row.shmBytes : row.shm_bytes as number | null,
    otherDataBytes: typeof row.otherDataBytes === 'number' ? row.otherDataBytes : row.other_data_bytes as number | null,
    lookupRows: typeof row.lookupRows === 'number' ? row.lookupRows : row.lookup_rows as number | null,
    activityRows: typeof row.activityRows === 'number' ? row.activityRows : row.activity_rows as number | null,
    uptimeSeconds: typeof row.uptimeSeconds === 'number' ? row.uptimeSeconds : row.uptime_seconds as number | null,
    localTs: typeof row.localTs === 'string' ? row.localTs : row.local_ts as string | null,
    imageSizeBytes: typeof row.imageSizeBytes === 'number' ? row.imageSizeBytes : row.image_size_bytes as number | null,
  };
}

function initialResources(): AdminResources {
  const range = adminDateRange(new URL('https://echo.test/admin'), 30);
  if (!range) return { current: null, sampler: getResourceSamplerStatus(), history: [] };
  const db = getDb();
  const current = db.prepare(
    'SELECT ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes, wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts, image_size_bytes FROM resource_samples ORDER BY ts DESC LIMIT 1',
  ).get() as Record<string, unknown> | undefined;
  const history = db.prepare(
    'SELECT ts, cpu_percent, memory_used_bytes, memory_limit_bytes, data_used_bytes, database_bytes, wal_bytes, shm_bytes, other_data_bytes, lookup_rows, activity_rows, uptime_seconds, local_ts, image_size_bytes FROM resource_samples WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?',
  ).all(range.from, range.to, 1_000) as Array<Record<string, unknown>>;
  return {
    current: current ? resourceRow(current) : null,
    sampler: getResourceSamplerStatus(),
    history: history.map(resourceRow),
  };
}

export default async function Page() {
  noStore();
  if (!isAdminEnabled()) notFound();

  const session = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSession(session).valid) return <AdminLogin />;

  const today = containerDate();
  const emptyActivity: ActivityQueryResult = { totalSuccessfulEvents: 0, uniqueIps: 0, countries: [], types: [], channels: [], actors: [], outcomes: [], partials: [], events: [], legacy: [], legacySummary: { count: 0, uniqueIps: 0 }, trend: [] };
  let activity = emptyActivity;
  let activityError: string | null = null;
  try {
    const activityRange = adminDateRange(new URL(`https://echo.test/admin?from=${today}&to=${today}`), getRetentionDays());
    if (activityRange) {
      activity = queryActivity({ from: activityRange.from, to: activityRange.to, limit: 50, offset: 0 });
    }
  } catch {
    activityError = 'Unable to load admin activity.';
  }
  let resources: AdminResources;
  let resourceError: string | null = null;
  try {
    resources = initialResources();
  } catch {
    resources = { current: null, sampler: { enabled: true, running: false, lastSuccessTs: null, lastError: 'sample_failed' }, history: [] };
    resourceError = 'Unable to load resource data.';
  }

  return (
    <div className="admin-shell">
      <AdminControls today={today} timezone={process.env.TZ || 'UTC'} initialActivity={activity} initialResources={resources} initialActivityError={activityError} initialResourceError={resourceError} />
    </div>
  );
}
