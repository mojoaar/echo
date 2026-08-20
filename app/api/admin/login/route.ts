import { adminNotFound, adminNoStoreHeaders, adminSessionTtlSeconds, createAdminSession, isAdminEnabled, serializeAdminCookie, verifyAdminToken } from '@/lib/admin-auth';
import { adminJson } from '@/lib/admin-route';
import { extractVisitorIp } from '@/lib/ip';
import { getRateLimiter } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

function failedLogin(request: Request): Response {
  const identity = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('admin-login').allow(identity);
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

export async function POST(request: Request): Promise<Response> {
  if (!isAdminEnabled()) return adminNotFound();
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return failedLogin(request);
  }
  let token: string | undefined;
  try {
    token = (await request.formData()).get('token')?.toString();
  } catch {
    return failedLogin(request);
  }
  if (!verifyAdminToken(token)) return failedLogin(request);

  const response = adminJson({ authenticated: true });
  response.headers.set('set-cookie', serializeAdminCookie(createAdminSession(), adminSessionTtlSeconds()));
  response.headers.set('cache-control', adminNoStoreHeaders()['cache-control']);
  return response;
}
