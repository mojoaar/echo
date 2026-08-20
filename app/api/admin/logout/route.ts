import { adminCookieOptions } from '@/lib/admin-auth';
import { adminJson, requireAdmin, SESSION_COOKIE } from '@/lib/admin-route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const response = adminJson({ authenticated: false });
  response.headers.set('set-cookie', `${SESSION_COOKIE}=; Max-Age=${adminCookieOptions(0).maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  return response;
}
