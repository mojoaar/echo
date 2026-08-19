import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { getRateLimiter } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const baseHeaders: Record<string, string> = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
};

export async function GET(request: Request) {
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter().allow(key);
  if (!rate.allowed) {
    return new Response('', {
      status: 429,
      headers: { ...baseHeaders, 'retry-after': String(rate.retryAfter) },
    });
  }
  const url = new URL(request.url);
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  let ip: string | null;
  if (raw) {
    const normalized = normalizeIp(raw);
    if (!isValidIp(normalized)) {
      return new Response('', { status: 400, headers: baseHeaders });
    }
    ip = normalized;
  } else {
    ip = extractVisitorIp(request.headers);
  }
  if (!ip) {
    return new Response('', { status: 400, headers: baseHeaders });
  }
  return new Response(`${ip}\n`, {
    headers: {
      ...baseHeaders,
      'x-ratelimit-limit': String(rate.limit),
      'x-ratelimit-remaining': String(rate.remaining),
    },
  });
}