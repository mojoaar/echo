import { adminNotFound, adminNoStoreHeaders, verifyAdminSession } from './admin-auth';

const SESSION_COOKIE = 'echo_admin_session';

function sessionValue(request: Request): string | undefined {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const value = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.trim().slice(SESSION_COOKIE.length + 1));
  } catch {
    return undefined;
  }
}

export function requireAdmin(request: Request): Response | null {
  if (!verifyAdminSession(sessionValue(request)).valid) return adminNotFound();
  return null;
}

export function adminJson(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers: { ...adminNoStoreHeaders(), ...headers } });
}

export function adminSessionCookie(request: Request): string | undefined {
  return sessionValue(request);
}

export { SESSION_COOKIE };
