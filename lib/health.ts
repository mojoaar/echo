import { isDbReady, getRetentionDays } from './db';
import { createReaders } from './geo';
import { getVersion } from './version';

export type HealthPayload =
  | { status: 'ok' }
  | {
      status: 'ok' | 'degraded';
      database: { ready: boolean };
      mmdb: { ready: boolean };
      version: string;
      uptimeSeconds: number;
      retentionDays: number;
    };

export function getHealth(readiness: boolean): HealthPayload {
  if (!readiness) return { status: 'ok' };
  const databaseReady = isDbReady();
  const readers = createReaders();
  const mmdbReady = readers.city !== null && readers.asn !== null;
  return {
    status: databaseReady && mmdbReady ? 'ok' : 'degraded',
    database: { ready: databaseReady },
    mmdb: { ready: mmdbReady },
    version: getVersion(),
    uptimeSeconds: Math.floor(process.uptime()),
    retentionDays: getRetentionDays(),
  };
}
