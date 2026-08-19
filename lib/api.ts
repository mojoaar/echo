import type { RateLimitResult } from '@/lib/ratelimit';

export type ApiErrorCode =
  | 'invalid_input'
  | 'rate_limited'
  | 'upstream_timeout'
  | 'upstream_unavailable'
  | 'not_found'
  | 'internal_error';

export function apiError(
  status: number,
  error: string,
  code: ApiErrorCode,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return Response.json({ error, code }, { status, headers: responseHeaders });
}

export function withRateHeaders(headers: HeadersInit, rate: RateLimitResult): Headers {
  const result = new Headers(headers);
  result.set('x-ratelimit-limit', String(rate.limit));
  result.set('x-ratelimit-remaining', String(rate.remaining));
  if (!rate.allowed) {
    result.set('retry-after', String(Math.ceil(rate.retryAfter / 1000)));
  }
  return result;
}
