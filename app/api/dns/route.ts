import { resolveRecords, isValidHostname } from '@/lib/dns';
import { getRateLimiter } from '@/lib/ratelimit';
import { extractVisitorIp } from '@/lib/ip';
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
  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim() ?? null;
  if (!name || !isValidHostname(name)) {
    return apiError(400, 'invalid hostname', 'invalid_input', corsHeaders);
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('dns').allow(key);
  if (!rate.allowed) {
    return apiError(
      429,
      'rate limit exceeded',
      'rate_limited',
      withRateHeaders(corsHeaders, rate),
    );
  }
  const records = await resolveRecords(name);
  return Response.json({ name, records }, { headers: withRateHeaders(corsHeaders, rate) });
}
