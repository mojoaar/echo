import { createHash, timingSafeEqual } from 'node:crypto';
import { countLookups, countSince, topCountryCodes, topIps, dailyCounts } from '@/lib/db';
import { extractVisitorIp } from '@/lib/ip';
import { apiError, withRateHeaders } from '@/lib/api';
import { getRateLimiter } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.STATS_TOKEN;
  const queryToken = url.searchParams.get('token');
  const auth = request.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const provided = bearer ?? queryToken;
  if (!expected || !provided || !safeEqual(provided, expected)) {
    const key = extractVisitorIp(request.headers) ?? 'anonymous';
    const rate = getRateLimiter('stats-auth').allow(key);
    if (!rate.allowed) {
      return apiError(
        429,
        'rate limit exceeded',
        'rate_limited',
        withRateHeaders({ 'cache-control': 'no-store' }, rate),
      );
    }
    return apiError(
      404,
      'not found',
      'not_found',
      withRateHeaders({ 'cache-control': 'no-store' }, rate),
    );
  }
  const now = Date.now();
  let body;
  try {
    body = {
      total: countLookups(),
      last24h: countSince(now - 86_400_000),
      topCountries: topCountryCodes(10),
      topIps: topIps(10),
      daily: dailyCounts(now - 7 * 86_400_000, 7),
    };
  } catch {
    return apiError(500, 'internal server error', 'internal_error', { 'cache-control': 'no-store' });
  }
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
