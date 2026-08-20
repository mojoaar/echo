import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_SESSION_TTL_SECONDS = 28_800;
const SESSION_PURPOSE = 'echo-admin-session-v1';

function adminToken(): string | undefined {
  const token = process.env.ADMIN_TOKEN;
  return token ? token : undefined;
}

function sessionTtlSeconds(): number {
  const value = Number(process.env.ADMIN_SESSION_TTL_SECONDS);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_SESSION_TTL_SECONDS;
}

function signingKey(token: string): Buffer {
  return createHash('sha256')
    .update(SESSION_PURPOSE)
    .update('\0')
    .update(token)
    .digest();
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function sign(payload: string, token: string): string {
  return encode(createHmac('sha256', signingKey(token)).update(payload).digest());
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export function isAdminEnabled(): boolean {
  return adminToken() !== undefined;
}

export function verifyAdminToken(value: string | undefined): boolean {
  const expected = adminToken();
  return expected !== undefined && value !== undefined && safeEqual(value, expected);
}

export function createAdminSession(): string {
  const token = adminToken();
  if (!token) return '';
  const expiresAt = Math.min(
    Number.MAX_SAFE_INTEGER,
    Date.now() + sessionTtlSeconds() * 1000,
  );
  const payload = `${expiresAt}.${encode(randomBytes(18))}`;
  return `${encode(payload)}.${sign(payload, token)}`;
}

export function verifyAdminSession(value: string | undefined): { valid: boolean; expiresAt: number } {
  if (!value || !adminToken()) return { valid: false, expiresAt: 0 };
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, expiresAt: 0 };

  let payload: string;
  try {
    payload = decode(parts[0]).toString('utf8');
  } catch {
    return { valid: false, expiresAt: 0 };
  }

  const payloadParts = payload.split('.');
  const expiresAt = Number(payloadParts[0]);
  if (
    payloadParts.length !== 2 ||
    !payloadParts[1] ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    !/^[0-9]+$/.test(payloadParts[0])
  ) {
    return { valid: false, expiresAt: 0 };
  }

  const expectedSignature = sign(payload, adminToken() as string);
  if (!safeEqual(parts[1], expectedSignature)) return { valid: false, expiresAt };
  return { valid: expiresAt > Date.now(), expiresAt };
}

export function adminCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: true;
  sameSite: 'strict';
  path: '/';
  maxAge: number;
} {
  return { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge };
}

export function adminNoStoreHeaders(): Record<string, string> {
  return { 'cache-control': 'no-store' };
}

export function adminNotFound(): Response {
  return Response.json(
    { error: 'not found', code: 'not_found' },
    { status: 404, headers: adminNoStoreHeaders() },
  );
}
