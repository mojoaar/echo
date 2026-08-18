import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup } from '@/lib/db';
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
  const url = new URL(request.url);
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  if (raw && !isValidIp(normalizeIp(raw))) {
    return Response.json({ error: 'invalid ip address' }, { status: 400, headers: corsHeaders });
  }
  const ip = raw ? normalizeIp(raw) : extractVisitorIp(request.headers);
  if (!ip) {
    return Response.json({ error: 'could not determine ip' }, { status: 400, headers: corsHeaders });
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter().allow(key);
  if (!rate.allowed) {
    const headers = { ...corsHeaders, 'retry-after': String(rate.retryAfter) };
    return Response.json({ error: 'rate limit exceeded' }, { status: 429, headers });
  }
  const info = await lookupInfo(ip);
  try {
    insertLookup(info.ip, info.country);
  } catch {}
  const headers = {
    ...corsHeaders,
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
  };
  return Response.json(info, { headers });
}