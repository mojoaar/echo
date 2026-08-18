import { listRecent } from '@/lib/db';

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
  const raw = url.searchParams.get('limit');
  let limit = 20;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      limit = Math.min(Math.max(parsed, 1), 100);
    }
  }
  const rows = listRecent(limit);
  return Response.json(rows, { headers: corsHeaders });
}