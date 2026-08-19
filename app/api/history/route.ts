import { countLookups, countSince, topCountryCodes } from '@/lib/db';
import { extractVisitorIp } from '@/lib/ip';
import { getRateLimiter } from '@/lib/ratelimit';

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
  const rate = getRateLimiter().allow(key);
  if (!rate.allowed) {
    const headers = { ...corsHeaders, 'retry-after': String(rate.retryAfter) };
    return Response.json({ error: 'rate limit exceeded' }, { status: 429, headers });
  }
  const now = Date.now();
  const body = {
    total: countLookups(),
    last24h: countSince(now - 86_400_000),
    topCountries: topCountryCodes(10),
  };
  const headers = {
    ...corsHeaders,
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
  };
  return Response.json(body, { headers });
}
