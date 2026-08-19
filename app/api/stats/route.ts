import { createHash, timingSafeEqual } from 'node:crypto';
import { countLookups, countSince, topCountryCodes, topIps, dailyCounts } from '@/lib/db';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function GET(request: Request) {
  const expected = process.env.STATS_TOKEN;
  if (!expected) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  const auth = request.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const provided = queryToken ?? bearer;
  if (!provided || !safeEqual(provided, expected)) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  const now = Date.now();
  const body = {
    total: countLookups(),
    last24h: countSince(now - 86_400_000),
    topCountries: topCountryCodes(10),
    topIps: topIps(10),
    daily: dailyCounts(now - 7 * 86_400_000, 7),
  };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
