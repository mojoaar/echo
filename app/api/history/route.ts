import { countLookups, countSince, topCountryCodes } from '@/lib/db';
import { extractVisitorIp } from '@/lib/ip';
import { getRateLimiter } from '@/lib/ratelimit';
import { apiError, withRateHeaders } from '@/lib/api';

export const dynamic = 'force-dynamic';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('history').allow(key);
  if (!rate.allowed) {
    return apiError(
      429,
      'rate limit exceeded',
      'rate_limited',
      withRateHeaders(corsHeaders, rate),
    );
  }
  const now = Date.now();
  const startedAt = Date.now();
  let body;
  try {
    body = {
      total: countLookups(),
      last24h: countSince(now - 86_400_000),
      topCountries: topCountryCodes(10),
    };
  } catch {
    console.error(JSON.stringify({
      category: 'database_read',
      endpoint: '/api/history',
      status: 500,
      durationMs: Math.max(0, Date.now() - startedAt),
    }));
    return apiError(
      500,
      'internal server error',
      'internal_error',
      withRateHeaders(corsHeaders, rate),
    );
  }
  return Response.json(body, { headers: withRateHeaders(corsHeaders, rate) });
}
