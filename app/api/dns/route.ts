import { resolveRecords, isValidHostname } from '@/lib/dns';
import { getRateLimiter } from '@/lib/ratelimit';
import { extractVisitorIp } from '@/lib/ip';

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
    return Response.json({ error: 'invalid hostname' }, { status: 400, headers: corsHeaders });
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter().allow(key);
  if (!rate.allowed) {
    const headers = { ...corsHeaders, 'retry-after': String(rate.retryAfter) };
    return Response.json({ error: 'rate limit exceeded' }, { status: 429, headers });
  }
  const records = await resolveRecords(name);
  const headers = {
    ...corsHeaders,
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
  };
  return Response.json({ name, records }, { headers });
}
