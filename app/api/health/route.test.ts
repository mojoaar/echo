import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from '@/lib/db';
import * as db from '@/lib/db';
import { getVersion } from '@/lib/version';
import { GET } from './route';

const { recordActivityEvent } = vi.hoisted(() => ({ recordActivityEvent: vi.fn() }));

vi.mock('@/lib/activity', () => ({ recordActivityEvent }));

describe('GET /api/health', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-health-route-'));
    process.env.LOOKUP_RETENTION_DAYS = '7';
    process.env.HEALTH_TOKEN = 'health-secret';
    initDb(join(dir, 'health.db'));
  });

  afterAll(() => {
    delete process.env.HEALTH_TOKEN;
    delete process.env.LOOKUP_RETENTION_DAYS;
    closeDb();
  });

  it('returns minimal public liveness without touching write APIs', async () => {
    recordActivityEvent.mockClear();
    const insert = vi.spyOn(db, 'insertResourceSample');
    const response = await GET(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(insert).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
    insert.mockRestore();
  });

  it('returns the same not-found response for invalid readiness credentials', async () => {
    const missing = await GET(new Request('http://localhost/api/health?readiness=1'));
    const wrong = await GET(new Request('http://localhost/api/health?readiness=1', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not found', code: 'not_found' });
    expect(await wrong.json()).toEqual({ error: 'not found', code: 'not_found' });
  });

  it('returns not-found when readiness is not configured', async () => {
    const token = process.env.HEALTH_TOKEN;
    delete process.env.HEALTH_TOKEN;
    const response = await GET(new Request('http://localhost/api/health?readiness=1', {
      headers: { authorization: 'Bearer health-secret' },
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found', code: 'not_found' });
    process.env.HEALTH_TOKEN = token;
  });

  it('returns the restricted readiness contract for a valid bearer token', async () => {
    recordActivityEvent.mockClear();
    const insert = vi.spyOn(db, 'insertResourceSample');
    const response = await GET(new Request('http://localhost/api/health?readiness=1', {
      headers: { authorization: 'Bearer health-secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      database: { ready: true },
      mmdb: { ready: true },
      version: getVersion(),
      uptimeSeconds: expect.any(Number),
      retentionDays: 7,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
    insert.mockRestore();
  });
});
