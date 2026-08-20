import { adminJson, requireAdmin } from '@/lib/admin-route';
import { serializeAdminCookie } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const response = adminJson({ authenticated: false });
  response.headers.set('set-cookie', serializeAdminCookie('', 0));
  return response;
}
