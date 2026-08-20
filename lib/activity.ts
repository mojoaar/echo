import { getDb, activityRetentionCutoff as dbActivityRetentionCutoff, pruneActivity as dbPruneActivity } from './db';

export type ActivityLookupType = 'page' | 'geo' | 'ip' | 'whois' | 'dns';
export type ActivityChannel = 'ui' | 'api' | 'unknown';
export type ActivityActor = 'browser' | 'bot' | 'unknown';
export type ActivityOutcome = 'success' | 'partial';
export type ActivityLegacyOutcome = 'unknown';

export interface ActivityEvent {
  ip: string;
  iso: string | null;
  ts: number;
  lookupType: ActivityLookupType;
  channel: ActivityChannel;
  actor: ActivityActor;
  target: string | null;
  outcome: ActivityOutcome;
  partial: boolean;
}

export interface ActivityQuery {
  from?: number;
  to?: number;
  type?: ActivityLookupType | 'legacy' | Array<ActivityLookupType | 'legacy'>;
  channel?: ActivityChannel | ActivityChannel[];
  actor?: ActivityActor | ActivityActor[];
  country?: string;
  outcome?: ActivityOutcome;
  ip?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityRow {
  id: number | null;
  source: 'activity' | 'legacy';
  ip: string;
  iso: string | null;
  ts: number;
  lookupType: ActivityLookupType | 'legacy';
  channel: ActivityChannel;
  actor: ActivityActor;
  target: string | null;
  outcome: ActivityOutcome | ActivityLegacyOutcome;
  partial: boolean;
}

export interface ActivityBreakdown {
  value: string;
  count: number;
}

export interface ActivityCountryBreakdown {
  iso: string;
  count: number;
}

export interface ActivityQueryResult {
  totalSuccessfulEvents: number;
  uniqueIps: number;
  countries: ActivityCountryBreakdown[];
  types: ActivityBreakdown[];
  outcomes: ActivityBreakdown[];
  channels: ActivityBreakdown[];
  actors: ActivityBreakdown[];
  partials: ActivityBreakdown[];
  events: ActivityRow[];
  legacy: ActivityRow[];
  legacySummary: { count: number; uniqueIps: number };
  trend: ActivityBreakdown[];
}

const lookupTypes = new Set<ActivityLookupType>(['page', 'geo', 'ip', 'whois', 'dns']);
const channels = new Set<ActivityChannel>(['ui', 'api', 'unknown']);
const actors = new Set<ActivityActor>(['browser', 'bot', 'unknown']);
const outcomes = new Set<ActivityOutcome>(['success', 'partial']);

function asList<T>(value: T | T[] | undefined): T[] | undefined {
  return value === undefined ? undefined : Array.isArray(value) ? value : [value];
}

function requestPath(input: string | URL | Request): string {
  if (typeof input === 'string') {
    try {
      return new URL(input).pathname || '/';
    } catch {
      return input.split('?')[0] || '/';
    }
  }
  return new URL(input instanceof Request ? input.url : input).pathname;
}

export function classifyActivityActor(userAgent: string | null | undefined): ActivityActor {
  if (!userAgent?.trim()) return 'unknown';
  return /bot|crawler|spider|slurp|headless|curl|wget|httpie|uptime|monitor/i.test(userAgent) ? 'bot' : 'browser';
}

export function resolveActivityChannel(input: string | URL | Request): ActivityChannel {
  const path = requestPath(input);
  if (path.startsWith('/api/')) return 'api';
  if (path === '/') return 'ui';
  return 'unknown';
}

export function isActivityPathExcluded(input: string | URL | Request): boolean {
  const path = requestPath(input);
  return path === '/admin' || path.startsWith('/admin/') || path.startsWith('/_next/') || path === '/favicon.ico' ||
    path === '/api/health' || path === '/api/history' || path === '/api/stats' || path.startsWith('/api/admin/');
}

export function recordActivityEvent(event: ActivityEvent): void {
  getDb()
    .prepare(
      `INSERT INTO activity_events
        (ip, iso, ts, lookup_type, channel, actor, target, outcome, partial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(event.ip, event.iso, event.ts, event.lookupType, event.channel, event.actor, event.target, event.outcome, event.partial ? 1 : 0);
}

function placeholders(values: string[]): string {
  return values.map(() => '?').join(', ');
}

function filterSql(options: ActivityQuery, source: 'activity' | 'legacy'): { sql: string; params: Array<string | number> } {
  const clauses = ['ts >= ?', 'ts <= ?'];
  const params: Array<string | number> = [options.from ?? 0, options.to ?? Date.now()];
  const types = asList(options.type);
  const channel = asList(options.channel);
  const actor = asList(options.actor);

  if (types) {
    const accepted = types.filter((value) => value !== 'legacy' && lookupTypes.has(value as ActivityLookupType));
    if (source === 'legacy' && !types.includes('legacy')) clauses.push('1 = 0');
    if (source === 'activity' && !accepted.length) clauses.push('1 = 0');
    if (source === 'activity' && accepted.length) clauses.push(`lookup_type IN (${placeholders(accepted)})`), params.push(...accepted);
  }
  if (channel) {
    const accepted = channel.filter((value) => channels.has(value));
    if (source === 'legacy') {
      if (!accepted.includes('unknown')) clauses.push('1 = 0');
    } else {
      if (!accepted.length) clauses.push('1 = 0');
      else clauses.push(`channel IN (${placeholders(accepted)})`), params.push(...accepted);
    }
  }
  if (actor) {
    const accepted = actor.filter((value) => actors.has(value));
    if (source === 'legacy') {
      if (!accepted.includes('unknown')) clauses.push('1 = 0');
    } else {
      if (!accepted.length) clauses.push('1 = 0');
      else clauses.push(`actor IN (${placeholders(accepted)})`), params.push(...accepted);
    }
  }
  if (options.country !== undefined) clauses.push('iso = ?'), params.push(options.country);
  if (options.outcome !== undefined) {
    if (source === 'legacy') {
      clauses.push('1 = 0');
    } else if (!outcomes.has(options.outcome)) clauses.push('1 = 0');
    else clauses.push('outcome = ?'), params.push(options.outcome);
  }
  if (options.ip !== undefined) clauses.push('ip = ?'), params.push(options.ip);
  return { sql: clauses.join(' AND '), params };
}

function normalizedLimit(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 50), 0), 100);
}

function normalizedOffset(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 0), 0), 10_000);
}

function localDay(ts: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: process.env.TZ || 'UTC' }).format(new Date(ts));
}

export function queryActivity(options: ActivityQuery = {}): ActivityQueryResult {
  const db = getDb();
  const activityFilter = filterSql(options, 'activity');
  const legacyFilter = filterSql(options, 'legacy');
  const activityUnion = `SELECT id, ip, iso, ts, lookup_type AS lookupType, channel, actor, target, outcome, partial FROM activity_events WHERE ${activityFilter.sql}`;
  const count = db.prepare(`SELECT COUNT(*) AS count FROM (${activityUnion}) WHERE outcome = 'success'`).get(...activityFilter.params) as { count: number };
  const unique = db.prepare(`SELECT COUNT(DISTINCT ip) AS count FROM (${activityUnion})`).get(...activityFilter.params) as { count: number };
  const countries = db.prepare(`SELECT iso, COUNT(*) AS count FROM (${activityUnion}) WHERE iso IS NOT NULL GROUP BY iso ORDER BY iso ASC`).all(...activityFilter.params) as ActivityCountryBreakdown[];
  const types = db.prepare(`SELECT lookupType AS value, COUNT(*) AS count FROM (${activityUnion}) GROUP BY lookupType ORDER BY value ASC`).all(...activityFilter.params) as ActivityBreakdown[];
  const channelRows = db.prepare(`SELECT channel AS value, COUNT(*) AS count FROM (${activityUnion}) GROUP BY channel ORDER BY value ASC`).all(...activityFilter.params) as ActivityBreakdown[];
  const actorRows = db.prepare(`SELECT actor AS value, COUNT(*) AS count FROM (${activityUnion}) GROUP BY actor ORDER BY value ASC`).all(...activityFilter.params) as ActivityBreakdown[];
  const outcomeRows = db.prepare(`SELECT outcome AS value, COUNT(*) AS count FROM (${activityUnion}) GROUP BY outcome ORDER BY value ASC`).all(...activityFilter.params) as ActivityBreakdown[];
  const partialRows = db.prepare(`SELECT CASE WHEN partial = 1 THEN 'partial' ELSE 'complete' END AS value, COUNT(*) AS count FROM (${activityUnion}) GROUP BY partial ORDER BY value ASC`).all(...activityFilter.params) as ActivityBreakdown[];
  const trendRows = db.prepare(`SELECT ts FROM (${activityUnion}) ORDER BY ts DESC`).all(...activityFilter.params) as Array<{ ts: number }>;
  trendRows.reverse();
  const trendMap = new Map<string, number>();
  for (const row of trendRows) trendMap.set(localDay(row.ts), (trendMap.get(localDay(row.ts)) ?? 0) + 1);
  const trend = [...trendMap].map(([value, count]) => ({ value, count })).slice(-31);
  const legacySummary = db.prepare(`SELECT COUNT(*) AS count, COUNT(DISTINCT ip) AS uniqueIps FROM lookups WHERE ${legacyFilter.sql}`).get(...legacyFilter.params) as { count: number; uniqueIps: number };
  const events = db
    .prepare(`SELECT id, 'activity' AS source, ip, iso, ts, lookup_type AS lookupType, channel, actor, target, outcome, partial FROM activity_events WHERE ${activityFilter.sql} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...activityFilter.params, normalizedLimit(options.limit), normalizedOffset(options.offset)) as Array<Omit<ActivityRow, 'partial'> & { partial: number }>;
  const legacyRows = db
    .prepare(`SELECT NULL AS id, 'legacy' AS source, ip, iso, ts, 'legacy' AS lookupType, 'unknown' AS channel, 'unknown' AS actor, NULL AS target, 'unknown' AS outcome, 0 AS partial FROM lookups WHERE ${legacyFilter.sql} ORDER BY ts DESC, ip ASC`)
    .all(...legacyFilter.params) as Array<Omit<ActivityRow, 'partial'> & { partial: number }>;
  const normalizedEvents = events.map((row) => ({ ...row, partial: row.partial === 1 })) as ActivityRow[];
  const normalizedLegacy = legacyRows.map((row) => ({ ...row, partial: false })) as ActivityRow[];
  return {
    totalSuccessfulEvents: count.count,
    uniqueIps: unique.count,
    countries,
    types,
    channels: channelRows,
    actors: actorRows,
    outcomes: outcomeRows,
    partials: partialRows,
    events: normalizedEvents,
    legacy: normalizedLegacy,
    legacySummary,
    trend,
  };
}

export function activityRetentionCutoff(nowMs?: number): number {
  return dbActivityRetentionCutoff(nowMs);
}

export function pruneActivity(nowMs?: number): number {
  return dbPruneActivity(nowMs);
}
