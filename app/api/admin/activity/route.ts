import { queryActivity, type ActivityActor, type ActivityChannel, type ActivityLookupType, type ActivityOutcome, type ActivitySort } from '@/lib/activity';
import { adminDateRange } from '@/lib/admin-date';
import { adminJson, requireAdmin } from '@/lib/admin-route';
import { getRetentionDays } from '@/lib/db';
import { isValidIp } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const lookupTypes = new Set<ActivityLookupType | 'legacy'>(['page', 'geo', 'ip', 'whois', 'dns', 'legacy']);
const channels = new Set<ActivityChannel>(['ui', 'api', 'unknown']);
const actors = new Set<ActivityActor>(['browser', 'bot', 'unknown']);
const outcomes = new Set<ActivityOutcome>(['success', 'partial']);
const sorts = new Set<ActivitySort>(['asc', 'desc']);

function invalidInput(): Response {
  return adminJson({ error: 'invalid input', code: 'invalid_input' }, 400);
}

function values(url: URL, name: string): string[] {
  return url.searchParams.getAll(name).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function parseList<T>(url: URL, name: string, allowed: Set<T>): T[] | undefined | null {
  const entries = values(url, name);
  if (!entries.length) return undefined;
  if (!entries.every((entry) => allowed.has(entry as T))) return null;
  return entries as T[];
}

function parseNonNegative(url: URL, name: string, fallback: number, maximum: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  return Math.min(Number(raw), maximum);
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const url = new URL(request.url);
  const range = adminDateRange(url, getRetentionDays());
  const type = parseList(url, 'type', lookupTypes);
  const channel = parseList(url, 'channel', channels);
  const actor = parseList(url, 'actor', actors);
  const outcomeValues = values(url, 'outcome');
  const outcome = outcomeValues.length ? outcomeValues[0] : undefined;
  const country = url.searchParams.get('country')?.trim().toUpperCase();
  const ip = url.searchParams.get('ip')?.trim();
  const limit = parseNonNegative(url, 'limit', 50, 100);
  const offset = parseNonNegative(url, 'offset', 0, 10_000);
  const sortValues = url.searchParams.getAll('sort');
  const sort = sortValues.length ? sortValues[0] : undefined;
  if (!range || type === null || channel === null || actor === null || limit === null || offset === null ||
    (sort !== undefined && (sortValues.length !== 1 || !sorts.has(sort as ActivitySort))) ||
    (outcome !== undefined && (!outcomes.has(outcome as ActivityOutcome) || outcomeValues.length !== 1)) ||
    (country !== undefined && !/^[A-Z]{2}$/.test(country)) ||
    (ip !== undefined && !isValidIp(ip))) return invalidInput();

  const startedAt = Date.now();
  try {
    return adminJson(queryActivity({
      from: range.from,
      to: range.to,
      type,
      channel,
      actor,
      country,
      outcome: outcome as ActivityOutcome | undefined,
      ip,
      limit,
      offset,
      sort: sort as ActivitySort | undefined,
    }));
  } catch {
    console.error(JSON.stringify({ category: 'database_read', endpoint: '/api/admin/activity', status: 500, durationMs: Math.max(0, Date.now() - startedAt) }));
    return adminJson({ error: 'internal server error', code: 'internal_error' }, 500);
  }
}
