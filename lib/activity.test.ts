import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activityRetentionCutoff,
  classifyActivityActor,
  isActivityPathExcluded,
  queryActivity,
  recordActivityEvent,
  resolveActivityChannel,
  pruneActivity,
} from './activity';
import { closeDb, getDb, initDb } from './db';

const dayMs = 86_400_000;

describe('activity events', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-activity-'));
    initDb(join(dir, 'test.db'));
    process.env.LOOKUP_RETENTION_DAYS = '7';
  });

  afterEach(() => {
    delete process.env.LOOKUP_RETENTION_DAYS;
    closeDb();
  });

  it('classifies browser, bot, and unknown user agents', () => {
    expect(classifyActivityActor('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBe('browser');
    expect(classifyActivityActor('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('bot');
    expect(classifyActivityActor(null)).toBe('unknown');
    expect(classifyActivityActor('')).toBe('unknown');
  });

  it('resolves UI and API channels and excludes non-visitor paths', () => {
    expect(resolveActivityChannel('/')).toBe('ui');
    expect(resolveActivityChannel('/api/ip')).toBe('api');
    expect(resolveActivityChannel('https://host/api/ip?target=8.8.8.8')).toBe('api');
    expect(resolveActivityChannel('/unexpected')).toBe('unknown');
    expect(isActivityPathExcluded('/api/health')).toBe(true);
    expect(isActivityPathExcluded('https://host/api/health')).toBe(true);
    expect(isActivityPathExcluded('/admin')).toBe(true);
    expect(isActivityPathExcluded('/_next/static/chunk.js')).toBe(true);
    expect(isActivityPathExcluded('/api/history')).toBe(true);
    expect(isActivityPathExcluded('/api/stats')).toBe(true);
    expect(isActivityPathExcluded('/api/ip')).toBe(false);
  });

  it('excludes successful health, admin, static, history, and stats paths', () => {
    for (const path of [
      '/api/health',
      '/admin',
      '/admin/settings',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/api/history',
      '/api/stats',
    ]) {
      expect(isActivityPathExcluded(new Request(`http://localhost${path}`))).toBe(true);
    }
  });

  it('records target and partial outcome fields', () => {
    recordActivityEvent({
      ip: '203.0.113.10',
      iso: 'US',
      ts: 1_000,
      lookupType: 'whois',
      channel: 'api',
      actor: 'browser',
      target: '8.8.8.8',
      outcome: 'partial',
      partial: true,
    });

    expect(getDb().prepare('SELECT ip, iso, ts, lookup_type, channel, actor, target, outcome, partial FROM activity_events').get()).toEqual({
      ip: '203.0.113.10',
      iso: 'US',
      ts: 1_000,
      lookup_type: 'whois',
      channel: 'api',
      actor: 'browser',
      target: '8.8.8.8',
      outcome: 'partial',
      partial: 1,
    });
  });

  it('filters and aggregates attributed events with bounded pagination', () => {
    const now = 10 * dayMs;
    const events = [
      ['203.0.113.1', 'US', now - 1_000, 'page', 'ui', 'browser', '8.8.8.8', 'success', false],
      ['203.0.113.1', 'US', now - 2_000, 'ip', 'api', 'bot', null, 'success', false],
      ['203.0.113.2', 'DE', now - 3_000, 'dns', 'api', 'unknown', 'example.com', 'partial', true],
    ] as const;
    for (const [ip, iso, ts, lookupType, channel, actor, target, outcome, partial] of events) {
      recordActivityEvent({ ip, iso, ts, lookupType, channel, actor, target, outcome, partial });
    }
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.1', 'FR', now - 4_000);

    const result = queryActivity({ from: now - 5_000, to: now, limit: 4, offset: 0 });
    expect(result.totalSuccessfulEvents).toBe(3);
    expect(result.uniqueIps).toBe(3);
    expect(result.countries).toEqual([
      { iso: 'DE', count: 1 },
      { iso: 'FR', count: 1 },
      { iso: 'US', count: 2 },
    ]);
    expect(result.types).toEqual([
      { value: 'dns', count: 1 },
      { value: 'ip', count: 1 },
      { value: 'legacy', count: 1 },
      { value: 'page', count: 1 },
    ]);
    expect(result.outcomes).toEqual([
      { value: 'partial', count: 1 },
      { value: 'success', count: 3 },
    ]);
    expect(result.events).toHaveLength(4);
    expect(result.events[0]).toMatchObject({ ip: '203.0.113.1', lookupType: 'page' });
    expect(result.events[3]).toMatchObject({ source: 'legacy', lookupType: 'legacy', channel: 'unknown', actor: 'unknown', outcome: 'success' });
    expect(result.legacy).toHaveLength(1);
  });

  it('applies time, type, channel, actor, and country filters', () => {
    recordActivityEvent({ ip: '203.0.113.20', iso: 'US', ts: 100, lookupType: 'page', channel: 'ui', actor: 'browser', target: null, outcome: 'success', partial: false });
    recordActivityEvent({ ip: '203.0.113.21', iso: 'DE', ts: 200, lookupType: 'dns', channel: 'api', actor: 'bot', target: 'example.com', outcome: 'partial', partial: true });

    const result = queryActivity({ from: 150, to: 250, type: 'dns', channel: 'api', actor: 'bot', country: 'DE', outcome: 'partial', limit: 50 });
    expect(result.totalSuccessfulEvents).toBe(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ ip: '203.0.113.21', lookupType: 'dns', partial: true });

    recordActivityEvent({ ip: '203.0.113.22', iso: 'GB', ts: 300, lookupType: 'ip', channel: 'unknown', actor: 'unknown', target: null, outcome: 'success', partial: false });
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('203.0.113.23', 'GB', 300);
    expect(queryActivity({ from: 300, to: 300, channel: 'unknown', actor: 'unknown', limit: 10 }).events).toHaveLength(2);
  });

  it('uses an exact strict retention cutoff and never prunes lookups', () => {
    const now = 10 * dayMs;
    const cutoff = activityRetentionCutoff(now);
    recordActivityEvent({ ip: '198.51.100.10', iso: 'US', ts: cutoff - 1, lookupType: 'page', channel: 'ui', actor: 'browser', target: null, outcome: 'success', partial: false });
    recordActivityEvent({ ip: '198.51.100.11', iso: 'US', ts: cutoff, lookupType: 'page', channel: 'ui', actor: 'browser', target: null, outcome: 'success', partial: false });
    getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run('198.51.100.12', 'US', cutoff - 1);

    expect(pruneActivity(now)).toBe(1);
    expect(getDb().prepare('SELECT ip FROM activity_events ORDER BY ip').all()).toEqual([{ ip: '198.51.100.11' }]);
    expect(getDb().prepare('SELECT ip FROM lookups').all()).toEqual([{ ip: '198.51.100.12' }]);
  });

  it('returns empty aggregates and events when no rows match', () => {
    expect(queryActivity({ from: 1, to: 2, limit: 10 })).toEqual({
      totalSuccessfulEvents: 0,
      uniqueIps: 0,
      countries: [],
      types: [],
      outcomes: [],
      events: [],
      legacy: [],
    });
  });
});
