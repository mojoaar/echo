import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { fetchRdap } from '@/lib/rdap';
import { fetchRdapAsn } from '@/lib/rdap';
import { createReaders } from '@/lib/geo';
import type { AsnRecord } from '@/lib/types';
import { getRateLimiter } from '@/lib/ratelimit';
import { apiError, withRateHeaders } from '@/lib/api';

export const dynamic = 'force-dynamic';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  if (raw && !isValidIp(normalizeIp(raw))) {
    return apiError(400, 'invalid ip address', 'invalid_input', corsHeaders);
  }
  const ip = raw ? normalizeIp(raw) : extractVisitorIp(request.headers);
  if (!ip) {
    return apiError(400, 'could not determine ip', 'invalid_input', corsHeaders);
  }
  const key = extractVisitorIp(request.headers) ?? 'anonymous';
  const rate = getRateLimiter('whois').allow(key);
  if (!rate.allowed) {
    return apiError(
      429,
      'rate limit exceeded',
      'rate_limited',
      withRateHeaders(corsHeaders, rate),
    );
  }
  const ipData = await fetchRdap(ip);
  const asnRecord = createReaders().asn?.get(ip) as AsnRecord | null | undefined;
  const asnNumber = asnRecord?.autonomous_system_number;
  const asn = typeof asnNumber === 'number' && Number.isSafeInteger(asnNumber) && asnNumber >= 0
    ? await fetchRdapAsn(asnNumber)
    : null;
  return Response.json({ ip: ipData, asn }, { headers: withRateHeaders(corsHeaders, rate) });
}
