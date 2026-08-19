import { createHash, timingSafeEqual } from 'node:crypto';
import { apiError } from '@/lib/api';
import { getHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const readinessRequested = new URL(request.url).searchParams.get('readiness') === '1';
  if (!readinessRequested) {
    return Response.json(getHealth(false), { headers: { 'cache-control': 'no-store' } });
  }
  const expected = process.env.HEALTH_TOKEN;
  const authorization = request.headers.get('authorization');
  const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return apiError(404, 'not found', 'not_found', { 'cache-control': 'no-store' });
  }
  return Response.json(getHealth(true), { headers: { 'cache-control': 'no-store' } });
}
