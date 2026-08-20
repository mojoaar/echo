import { adminNotFound, adminNoStoreHeaders, isAdminEnabled, verifyAdminSession, ADMIN_SESSION_COOKIE } from './admin-auth';
import { extractVisitorIp } from './ip';
import { getRateLimiter } from './ratelimit';

function sessionValue(request: Request): string | undefined {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const value = cookies.find((cookie) => cookie.trim().startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.trim().slice(ADMIN_SESSION_COOKIE.length + 1));
  } catch {
    return undefined;
  }
}

export function requireAdmin(request: Request): Response | null {
  if (!isAdminEnabled()) return adminNotFound();
  if (verifyAdminSession(sessionValue(request)).valid) return null;
  const identity = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('admin-session').allow(identity);
  if (!rate.allowed) {
    return adminJson(
      { error: 'rate limit exceeded', code: 'rate_limited' },
      429,
      {
        'x-ratelimit-limit': String(rate.limit),
        'x-ratelimit-remaining': String(rate.remaining),
        'retry-after': String(Math.ceil(rate.retryAfter / 1000)),
      },
    );
  }
  return adminNotFound();
}

export function adminJson(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers: { ...adminNoStoreHeaders(), ...headers } });
}
