import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { getRateLimiter } from '@/lib/ratelimit';
import { apiError, withRateHeaders } from '@/lib/api';
import { classifyActivityActor, isActivityPathExcluded, recordActivityEvent, resolveActivityChannel } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const baseHeaders: Record<string, string> = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.getAll('ip').length > 1) {
    return apiError(400, 'invalid ip address', 'invalid_input', baseHeaders);
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('ip').allow(key);
  if (!rate.allowed) {
    return apiError(429, 'rate limit exceeded', 'rate_limited', withRateHeaders(baseHeaders, rate));
  }
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  let ip: string | null;
  if (raw) {
    const normalized = normalizeIp(raw);
    if (!isValidIp(normalized)) {
      return apiError(400, 'invalid ip address', 'invalid_input', baseHeaders);
    }
    ip = normalized;
  } else {
    ip = extractVisitorIp(request.headers);
  }
  if (!ip) {
    return apiError(400, 'could not determine ip', 'invalid_input', baseHeaders);
  }
  if (!isActivityPathExcluded(request)) try {
    recordActivityEvent({
      ip: extractVisitorIp(request.headers) ?? 'unknown',
      iso: null,
      ts: Date.now(),
      lookupType: 'ip',
      channel: resolveActivityChannel(request),
      actor: classifyActivityActor(request.headers.get('user-agent')),
      target: ip,
      outcome: 'success',
      partial: false,
    });
  } catch {}
  return new Response(`${ip}\n`, {
    headers: withRateHeaders(baseHeaders, rate),
  });
}
