import { apiError } from '@/lib/api';
import { activityRetentionCutoff, queryActivity, type ActivityActor, type ActivityChannel, type ActivityLookupType, type ActivityOutcome } from '@/lib/activity';
import { adminJson, requireAdmin } from '@/lib/admin-route';
import { getRetentionDays } from '@/lib/db';
import { isValidIp } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const lookupTypes = new Set<ActivityLookupType | 'legacy'>(['page', 'geo', 'ip', 'whois', 'dns', 'legacy']);
const channels = new Set<ActivityChannel>(['ui', 'api', 'unknown']);
const actors = new Set<ActivityActor>(['browser', 'bot', 'unknown']);
const outcomes = new Set<ActivityOutcome>(['success', 'partial']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function invalidInput(): Response {
  return apiError(400, 'invalid input', 'invalid_input', { 'cache-control': 'no-store' });
}

function parseDate(value: string | null): number | null {
  if (!value || !datePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return Number.isFinite(date.getTime()) && normalized === value ? date.getTime() : null;
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

function dateRange(url: URL): { from: number; to: number } | null {
  const now = Date.now();
  const fromValue = url.searchParams.get('from');
  const toValue = url.searchParams.get('to');
  const from = fromValue ? parseDate(fromValue) : activityRetentionCutoff(now);
  const parsedTo = toValue ? parseDate(toValue) : now;
  if (from === null || parsedTo === null || from > parsedTo || parsedTo > now) return null;
  if (now - from > getRetentionDays() * DAY_MS) return null;
  return { from, to: toValue ? parsedTo + DAY_MS - 1 : parsedTo };
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const url = new URL(request.url);
  const range = dateRange(url);
  const type = parseList(url, 'type', lookupTypes);
  const channel = parseList(url, 'channel', channels);
  const actor = parseList(url, 'actor', actors);
  const outcomeValues = values(url, 'outcome');
  const outcome = outcomeValues.length ? outcomeValues[0] : undefined;
  const country = url.searchParams.get('country')?.trim().toUpperCase();
  const ip = url.searchParams.get('ip')?.trim();
  const limit = parseNonNegative(url, 'limit', 50, 100);
  const offset = parseNonNegative(url, 'offset', 0, 10_000);
  if (!range || type === null || channel === null || actor === null || limit === null || offset === null ||
    (outcome !== undefined && (!outcomes.has(outcome as ActivityOutcome) || outcomeValues.length !== 1)) ||
    (country !== undefined && !/^[A-Z]{2}$/.test(country)) ||
    (ip !== undefined && !isValidIp(ip))) return invalidInput();

  const startedAt = Date.now();
  try {
    return adminJson(queryActivity({
      from: range.from,
      to: range.to,
      type: type?.length && type.every((value): value is ActivityLookupType => value !== 'legacy') ? type : type as 'legacy'[] | undefined,
      channel,
      actor,
      country,
      outcome: outcome as ActivityOutcome | undefined,
      ip,
      limit,
      offset,
    }));
  } catch {
    console.error(JSON.stringify({ category: 'database_read', endpoint: '/api/admin/activity', status: 500, durationMs: Math.max(0, Date.now() - startedAt) }));
    return apiError(500, 'internal server error', 'internal_error', { 'cache-control': 'no-store' });
  }
}
