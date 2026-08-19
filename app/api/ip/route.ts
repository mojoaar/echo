import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  let ip: string | null;
  if (raw) {
    const normalized = normalizeIp(raw);
    if (!isValidIp(normalized)) {
      return new Response('', {
        status: 400,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    ip = normalized;
  } else {
    ip = extractVisitorIp(request.headers);
  }
  if (!ip) {
    return new Response('', {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
  return new Response(`${ip}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}