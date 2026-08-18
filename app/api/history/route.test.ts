import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './route';
import { closeDb, initDb, insertLookup } from '@/lib/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/history', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-hist-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  it('returns recent lookups newest first', async () => {
    insertLookup('8.8.8.8', 'US');
    await sleep(5);
    insertLookup('1.1.1.1', 'AU');
    const res = await GET(new Request('http://localhost/api/history?limit=10'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].ip).toBe('1.1.1.1');
    expect(body[0].iso).toBe('AU');
    expect(typeof body[0].ts).toBe('number');
  });

  it('caps the limit between 1 and 100', async () => {
    const low = await GET(new Request('http://localhost/api/history?limit=0'));
    expect(await low.json()).toHaveLength(1);
    const defaulted = await GET(new Request('http://localhost/api/history'));
    expect(defaulted.status).toBe(200);
  });
});
