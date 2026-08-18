import { isIP } from 'node:net';
import { isValidIp, isValidIpv4 } from './validate';

export type IpKind = 'public' | 'private' | 'loopback' | 'linklocal' | 'reserved';

const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

export function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  const mapped = IPV4_MAPPED_RE.exec(trimmed);
  if (mapped && isValidIpv4(mapped[1])) return mapped[1];
  return trimmed;
}

export function extractVisitorIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const normalized = normalizeIp(xff.split(',')[0]);
    if (isValidIp(normalized)) return normalized;
  }
  const xri = headers.get('x-real-ip');
  if (xri) {
    const normalized = normalizeIp(xri);
    if (isValidIp(normalized)) return normalized;
  }
  return null;
}

export function classifyIp(ip: string): IpKind {
  const normalized = normalizeIp(ip);
  if (normalized === '::1' || normalized.startsWith('127.')) return 'loopback';
  if (normalized === '0.0.0.0') return 'reserved';
  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return 'reserved';
    const first = normalized.split(':')[0].padStart(4, '0');
    if (first >= 'fc00' && first <= 'fdff') return 'private';
    if (first >= 'fe80' && first <= 'febf') return 'linklocal';
    if (first >= 'ff00') return 'reserved';
    return 'public';
  }
  const parts = normalized.split('.').map((p) => Number(p));
  if (parts[0] === 0) return 'reserved';
  if (parts[0] === 10) return 'private';
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 'private';
  if (parts[0] === 192 && parts[1] === 168) return 'private';
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return 'private';
  if (parts[0] === 169 && parts[1] === 254) return 'linklocal';
  if (parts[0] >= 224) return 'reserved';
  return 'public';
}

export function isPublicIp(ip: string): boolean {
  return isIP(normalizeIp(ip)) !== 0 && classifyIp(ip) === 'public';
}