'use client';
import { useState } from 'react';
import type { DnsLookupResult, DnsRecords } from '@/lib/dns';
import { isDnsResponse } from '@/lib/guards';

type Group = { type: string; values: string[] };

const GROUPS: Array<{ type: string; key: keyof DnsRecords }> = [
  { type: 'A', key: 'a' },
  { type: 'AAAA', key: 'aaaa' },
  { type: 'MX', key: 'mx' },
  { type: 'NS', key: 'ns' },
  { type: 'TXT', key: 'txt' },
  { type: 'SOA', key: 'soa' },
];

export default function DnsSection() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(DnsLookupResult & { name: string }) | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) {
      setResult(null);
      setError('Enter a hostname.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/dns?name=${encodeURIComponent(name)}`, {
        headers: { accept: 'application/json' },
      });
      if (res.status === 429) {
        setError('Rate limited. Try again shortly.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { code?: string } | null;
        setError(
          body?.code === 'rate_limited'
            ? 'Rate limited. Try again shortly.'
            : body?.code === 'upstream_timeout'
              ? 'DNS lookup timed out.'
              : body?.code === 'upstream_unavailable'
                ? 'DNS resolver unavailable.'
                : 'Enter a valid public hostname.',
        );
        return;
      }
      const body = await res.json();
      if (
        !isDnsResponse(body) ||
        !isDnsLookupMetadata(body)
      ) {
        setError('Could not resolve DNS records.');
        return;
      }
      setResult(body);
    } catch {
      setError('Could not resolve DNS records.');
    } finally {
      setLoading(false);
    }
  }

  const groups: Group[] = result
    ? GROUPS.map(({ type, key }) => ({ type, values: result.records[key] })).filter(
        (g) => g.values.length > 0,
      )
    : [];

  return (
    <section className="dns">
      <h2 className="section-title">DNS lookup</h2>
      <form className="form" id="dns-form" role="search" onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Resolve DNS records for a hostname — e.g. johansen.foo"
          aria-label="Hostname to resolve"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Resolving…' : 'Resolve'}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button className="text-button" type="submit" form="dns-form">Retry</button>
        </p>
      )}
      {result ? (
        groups.length > 0 ? (
          <div className="card dns-body">
            {groups.map((group) => (
              <div className="dns-group" key={group.type}>
                <div className="dns-type">{group.type}</div>
                <ul className="dns-values">
                  {group.values.map((v, i) => (
                    <li className="dns-value" key={`${group.type}-${i}`}>
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="dns-empty muted">No records found for {result.name}.</p>
        )
      ) : null}
      {result && (
        <div className="dns-meta" aria-live="polite">
          <span>{result.cache === 'hit' ? 'Cached result' : 'Fresh result'}</span>
          <span>{new Date(result.resolvedAt).toLocaleString()}</span>
          <span>{result.durationMs} ms</span>
        </div>
      )}
      {result?.partial && (
        <p className="dns-warning" role="status">
          Some record types could not be resolved. <button className="text-button" type="submit" form="dns-form">Retry</button>
        </p>
      )}
    </section>
  );
}

function isDnsLookupMetadata(value: unknown): value is DnsLookupResult & { name: string } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.cache === 'hit' || candidate.cache === 'miss') &&
    typeof candidate.resolvedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.resolvedAt)) &&
    typeof candidate.durationMs === 'number' &&
    Number.isFinite(candidate.durationMs) &&
    candidate.durationMs >= 0 &&
    typeof candidate.partial === 'boolean'
  );
}
