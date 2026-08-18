import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup } from '@/lib/db';

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
    return Response.json({ error: 'invalid ip address' }, { status: 400, headers: corsHeaders });
  }
  const ip = raw ? normalizeIp(raw) : extractVisitorIp(request.headers);
  if (!ip) {
    return Response.json({ error: 'could not determine ip' }, { status: 400, headers: corsHeaders });
  }
  const info = await lookupInfo(ip);
  try {
    insertLookup(info.ip, info.country);
  } catch {}
  return Response.json(info, { headers: corsHeaders });
}