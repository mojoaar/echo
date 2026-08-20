import type { ActivityQueryResult, ActivityRow } from '@/lib/activity';
import type { ResourceSamplerStatus } from '@/lib/resources';
import type { StorageBreakdown } from '@/lib/db';

export type AdminActivityResult = ActivityQueryResult;

export type AdminResourceRow = {
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
};

export type AdminResources = {
  current: AdminResourceRow | null;
  sampler: ResourceSamplerStatus;
  history: AdminResourceRow[];
  storage: StorageBreakdown | null;
};

export type AdminActivityRow = ActivityRow;
