import { resolveRecords, isPublicHostname } from '@/lib/dns';
import { getRateLimiter } from '@/lib/ratelimit';
import { extractVisitorIp } from '@/lib/ip';
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
  const name = url.searchParams.get('name')?.trim() ?? null;
  if (!name || !isPublicHostname(name)) {
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
  try {
    const result = await resolveRecords(name);
    if (!isActivityPathExcluded(request)) try {
      recordActivityEvent({
        ip: extractVisitorIp(request.headers) ?? 'unknown',
        iso: null,
        ts: Date.now(),
        lookupType: 'dns',
        channel: resolveActivityChannel(request),
        actor: classifyActivityActor(request.headers.get('user-agent')),
        target: name.toLowerCase(),
        outcome: result.partial ? 'partial' : 'success',
        partial: result.partial,
      });
    } catch {}
    return Response.json({ name: name.toLowerCase(), ...result }, {
      headers: withRateHeaders(corsHeaders, rate),
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'upstream_timeout') {
      return apiError(504, 'dns lookup timed out', 'upstream_timeout', withRateHeaders(corsHeaders, rate));
    }
    if (code === 'upstream_unavailable') {
      return apiError(502, 'dns resolver unavailable', 'upstream_unavailable', withRateHeaders(corsHeaders, rate));
    }
    return apiError(500, 'dns lookup failed', 'internal_error', withRateHeaders(corsHeaders, rate));
  }
}
