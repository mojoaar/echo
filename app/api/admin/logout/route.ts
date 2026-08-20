import { adminJson, requireAdmin } from '@/lib/admin-route';
import { ADMIN_SESSION_COOKIE, revokeAdminSession, serializeAdminCookie } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (sessionCookie) revokeAdminSession(decodeURIComponent(sessionCookie.trim().slice(ADMIN_SESSION_COOKIE.length + 1)));
  const response = adminJson({ authenticated: false });
  response.headers.set('set-cookie', serializeAdminCookie('', 0));
  return response;
}
