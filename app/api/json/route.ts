import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup } from '@/lib/db';
import { getRateLimiter } from '@/lib/ratelimit';
import { apiError, withRateHeaders } from '@/lib/api';
import { classifyActivityActor, isActivityPathExcluded, recordActivityEvent, resolveActivityChannel } from '@/lib/activity';

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
  if (url.searchParams.getAll('ip').length > 1) {
    return apiError(400, 'invalid ip address', 'invalid_input', corsHeaders);
  }
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  if (raw && !isValidIp(normalizeIp(raw))) {
    return apiError(400, 'invalid ip address', 'invalid_input', corsHeaders);
  }
  const ip = raw ? normalizeIp(raw) : extractVisitorIp(request.headers);
  if (!ip) {
    return apiError(400, 'could not determine ip', 'invalid_input', corsHeaders);
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('json').allow(key);
  if (!rate.allowed) {
    return apiError(
      429,
      'rate limit exceeded',
      'rate_limited',
      withRateHeaders(corsHeaders, rate),
    );
  }
  const info = await lookupInfo(ip);
  const startedAt = Date.now();
  try {
    insertLookup(info.ip, info.country);
  } catch {
    console.error(JSON.stringify({
      category: 'database_write',
      endpoint: '/api/json',
      status: 'error',
      durationMs: Math.max(0, Date.now() - startedAt),
    }));
  }
  if (!isActivityPathExcluded(request)) try {
    recordActivityEvent({
      ip: extractVisitorIp(request.headers) ?? 'unknown',
      iso: info.country,
      ts: Date.now(),
      lookupType: 'geo',
      channel: resolveActivityChannel(request),
      actor: classifyActivityActor(request.headers.get('user-agent')),
      target: info.ip,
      outcome: info.country ? 'success' : 'partial',
      partial: !info.country,
    });
  } catch {}
  return Response.json(info, { headers: withRateHeaders(corsHeaders, rate) });
}
