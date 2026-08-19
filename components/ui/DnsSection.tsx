'use client';
import { useState } from 'react';
import type { DnsRecords } from '@/lib/dns';
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
  const [result, setResult] = useState<{ name: string; records: DnsRecords } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) {
      setError('Enter a hostname.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dns?name=${encodeURIComponent(name)}`, {
        headers: { accept: 'application/json' },
      });
      if (res.status === 429) {
        setError('Rate limited. Try again shortly.');
        return;
      }
      if (!res.ok) {
        setError('Enter a valid hostname.');
        return;
      }
      const body = await res.json();
      if (!isDnsResponse(body)) {
        setResult(null);
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
      <form className="form" role="search" onSubmit={submit}>
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
      {error && <p className="form-error" role="alert">{error}</p>}
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
    </section>
  );
}
