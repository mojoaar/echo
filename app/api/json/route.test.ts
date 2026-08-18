import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET, OPTIONS } from './route';
import { initDb, closeDb } from '@/lib/db';

describe('GET /api/json', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-json-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  it('returns the full payload for the visitor ip', async () => {
    const req = new Request('http://localhost/api/json', {
      headers: { 'x-forwarded-for': '8.8.8.8' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.ip).toBe('8.8.8.8');
    expect(typeof body.isPrivate).toBe('boolean');
  });

  it('supports ?ip= arbitrary lookups', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=192.168.1.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ip).toBe('192.168.1.1');
    expect(body.isPrivate).toBe(true);
  });

  it('rejects invalid ip values with 400', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=not-an-ip'));
    expect(res.status).toBe(400);
  });

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
