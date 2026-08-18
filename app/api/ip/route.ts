import { extractVisitorIp } from '@/lib/ip';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ip = extractVisitorIp(request.headers);
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