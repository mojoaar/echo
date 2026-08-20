import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from './db';
import { getHealth } from './health';
import { getVersion } from './version';

describe('health payloads', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-health-'));
    process.env.LOOKUP_RETENTION_DAYS = '7';
    initDb(join(dir, 'health.db'));
  });

  afterAll(() => {
    delete process.env.LOOKUP_RETENTION_DAYS;
    closeDb();
  });

  it('returns only the public liveness status', () => {
    expect(getHealth(false)).toEqual({ status: 'ok' });
  });

  it('returns the authenticated readiness contract without sensitive details', () => {
    const payload = getHealth(true);
    expect(payload).toEqual({
      status: 'ok',
      database: { ready: true },
      mmdb: { ready: true },
      version: getVersion(),
      uptimeSeconds: expect.any(Number),
      retentionDays: 7,
    });
    expect(JSON.stringify(payload)).not.toMatch(/echo\.db|schema\.sql|127\.0\.0\.1|secret|token/i);
  });
});
