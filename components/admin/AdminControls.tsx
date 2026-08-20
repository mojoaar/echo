'use client';

import { useState, useTransition } from 'react';
import ActivityTable from './ActivityTable';
import ResourceCards from './ResourceCards';
import ResourceCharts from './ResourceCharts';
import type { AdminActivityResult, AdminResources } from './types';

type Preset = 'daily' | 'weekly' | 'monthly' | 'custom';

type AdminControlsProps = {
  today: string;
  timezone: string;
  initialActivity: AdminActivityResult;
  initialResources: AdminResources;
  initialActivityError?: string | null;
  initialResourceError?: string | null;
};

const emptyResources: AdminResources = {
  current: null,
  sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null },
  history: [],
};

async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim() ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function sameOriginAdminPath(path: string): string | null {
  return path.startsWith('/api/admin/') ? path : null;
}

function shift(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateRangeForPreset(preset: Preset, today: string, customFrom?: string, customTo?: string): { from: string; to: string } {
  if (preset === 'custom') return { from: customFrom || today, to: customTo || today };
  const days = preset === 'daily' ? 0 : preset === 'weekly' ? 6 : 29;
  return { from: shift(today, -days), to: today };
}

export default function AdminControls({ today, timezone, initialActivity, initialResources, initialActivityError = null, initialResourceError = null }: AdminControlsProps) {
  const [preset, setPreset] = useState<Preset>('daily');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [activity, setActivity] = useState(initialActivity);
  const [resources, setResources] = useState(initialResources);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState(initialActivityError);
  const [resourceError, setResourceError] = useState(initialResourceError);
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');
  const [actor, setActor] = useState('');
  const [country, setCountry] = useState('');
  const [outcome, setOutcome] = useState('');
  const [ip, setIp] = useState('');

  function rangeFor(presetValue: Preset, customFrom = from, customTo = to) {
    return dateRangeForPreset(presetValue, today, customFrom, customTo);
  }

  function load(nextPreset: Preset, nextFrom = from, nextTo = to, nextPage = 1) {
    const range = rangeFor(nextPreset, nextFrom, nextTo);
    const params = new URLSearchParams({ from: range.from, to: range.to, limit: '50', offset: String((nextPage - 1) * 50) });
    if (type) params.set('type', type);
    if (channel) params.set('channel', channel);
    if (actor) params.set('actor', actor);
    if (country) params.set('country', country);
    if (outcome) params.set('outcome', outcome);
    if (ip) params.set('ip', ip);
    startTransition(async () => {
      setError(null);
      setActivityError(null);
      setResourceError(null);
      setActivity({ totalSuccessfulEvents: 0, uniqueIps: 0, countries: [], types: [], channels: [], actors: [], outcomes: [], partials: [], events: [], legacy: [], legacySummary: { count: 0, uniqueIps: 0 }, trend: [] });
      try {
        const activityResponse = await fetch(sameOriginAdminPath(`/api/admin/activity?${params}`) as string, { credentials: 'same-origin', cache: 'no-store' });
        if (activityResponse.status === 404) throw new Error('expired');
        if (!activityResponse.ok) throw new Error(await apiErrorMessage(activityResponse, 'Unable to load admin activity.'));
        const nextActivity = await activityResponse.json() as AdminActivityResult;
        setActivity(nextActivity);
        setPage(nextPage);
        setResources(emptyResources);
        const resourceResponse = await fetch(`/api/admin/resources?from=${range.from}&to=${range.to}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!resourceResponse.ok) {
          if (resourceResponse.status === 404) throw new Error('expired');
          setResourceError(await apiErrorMessage(resourceResponse, 'Unable to load resource data.'));
          return;
        }
        const nextResources = await resourceResponse.json() as AdminResources;
        setResources(nextResources);
      } catch (loadError) {
        setError(loadError instanceof Error && loadError.message === 'expired'
          ? 'Session expired. Log in again.'
          : loadError instanceof Error ? loadError.message : 'Unable to load admin data.');
      }
    });
  }

  function choosePreset(value: Preset) {
    setPreset(value);
    const range = rangeFor(value);
    setFrom(range.from);
    setTo(range.to);
    load(value, range.from, range.to);
  }

  async function logout() {
    setError(null);
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      if (response.ok) window.location.reload();
      else setError(response.status === 404 ? 'Session expired. Log in again.' : 'Unable to log out.');
    } catch {
      setError('Unable to log out.');
    }
  }

  return (
    <main className="admin-content">
      <header className="admin-topbar">
        <div><p className="admin-kicker">echo / private</p><h1>Admin dashboard</h1><p className="admin-note">Container timezone: {timezone}</p></div>
        <button className="btn" type="button" onClick={logout}>Log out</button>
      </header>
      <section className="admin-panel admin-controls" aria-label="Dashboard controls">
        <div className="admin-control-row">
          <span className="admin-control-label">Range</span>
          <button className={`btn ${preset === 'daily' ? 'primary' : ''}`} type="button" onClick={() => choosePreset('daily')}>Daily / 24h</button>
          <button className={`btn ${preset === 'weekly' ? 'primary' : ''}`} type="button" onClick={() => choosePreset('weekly')}>Weekly / 7d</button>
          <button className={`btn ${preset === 'monthly' ? 'primary' : ''}`} type="button" onClick={() => choosePreset('monthly')}>Monthly / 30d</button>
          <button className={`btn ${preset === 'custom' ? 'primary' : ''}`} type="button" onClick={() => setPreset('custom')}>Custom range</button>
        </div>
        <div className="admin-control-grid">
          <label>From<input type="date" value={from} max={today} onChange={(event) => { setFrom(event.target.value); setPreset('custom'); }} /></label>
          <label>To<input type="date" value={to} max={today} onChange={(event) => { setTo(event.target.value); setPreset('custom'); }} /></label>
          <label>Lookup type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option><option value="page">page</option><option value="geo">geo</option><option value="ip">ip</option><option value="whois">whois</option><option value="dns">dns</option><option value="legacy">legacy</option></select></label>
          <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">All channels</option><option value="ui">ui</option><option value="api">api</option><option value="unknown">unknown</option></select></label>
          <label>Actor<select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">All actors</option><option value="browser">browser</option><option value="bot">bot</option><option value="unknown">unknown</option></select></label>
          <label>Country<input value={country} maxLength={2} placeholder="US" onChange={(event) => setCountry(event.target.value.toUpperCase())} /></label>
          <label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All outcomes</option><option value="success">success</option><option value="partial">partial</option></select></label>
          <label>IP<input value={ip} placeholder="203.0.113.10" onChange={(event) => setIp(event.target.value)} /></label>
        </div>
        <button className="btn primary" type="button" disabled={pending} onClick={() => load(preset)}>{pending ? 'Loading...' : 'Apply filters'}</button>
        {activityError ? <p className="error" role="alert">{activityError}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <ActivityTable result={activity} timezone={timezone} page={page} hasNext={activity.events.length === 50} onPrevious={() => load(preset, from, to, page - 1)} onNext={() => load(preset, from, to, page + 1)} />
      <ResourceCards resources={resources} timezone={timezone} error={resourceError} />
      <ResourceCharts history={resources.history} />
    </main>
  );
}
