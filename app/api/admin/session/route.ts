import { adminJson, requireAdmin } from '@/lib/admin-route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return requireAdmin(request) ?? adminJson({ authenticated: true });
}
