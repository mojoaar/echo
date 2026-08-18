export const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_RE.test(ip);
}

export function isValidIpv6(ip: string): boolean {
  if (ip.includes(':::')) return false;
  const hasDouble = ip.includes('::');
  const sides = ip.split('::');
  if (sides.length > 2) return false;
  const chunks = (s: string) => (s.length ? s.split(':') : []);
  const all = chunks(sides[0]).concat(sides.length === 2 ? chunks(sides[1]) : []);
  if (!all.every((h) => HEXTET_RE.test(h))) return false;
  const total = all.length;
  if (!hasDouble && total !== 8) return false;
  if (hasDouble && total > 7) return false;
  return true;
}

export function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}