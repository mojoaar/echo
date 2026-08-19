'use client';
import { useState } from 'react';
import type { RdapInfo } from '@/lib/rdap';
import { isRdapResponse } from '@/lib/guards';

export default function WhoisSection({ ip }: { ip: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RdapInfo | null | undefined>(undefined);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whois?ip=${encodeURIComponent(ip)}`, { headers: { accept: 'application/json' } });
      if (res.status === 429) {
        setError('Rate limited. Try again shortly.');
        setData(undefined);
        return;
      }
      if (!res.ok) {
        setError('Could not load WHOIS data.');
        setData(undefined);
        return;
      }
      const body = await res.json();
      if (!isRdapResponse(body)) {
        setError('Could not load WHOIS data.');
        setData(undefined);
        return;
      }
      setData(body);
    } catch {
      setError('Could not load WHOIS data.');
      setData(undefined);
    } finally {
      setLoading(false);
    }
  }

  const rows: Array<{ label: string; value: string | null }> = data
    ? [
        { label: 'Organization', value: data.organization },
        { label: 'Registrant', value: data.registrant },
        {
          label: 'Abuse contact',
          value: [data.abuse?.email, data.abuse?.phone].filter(Boolean).join(' · ') || null,
        },
        {
          label: 'Netblock',
          value:
            data.startAddress && data.endAddress
              ? `${data.startAddress} – ${data.endAddress}`
              : null,
        },
        { label: 'CIDR', value: data.cidr },
        { label: 'Handle', value: data.handle },
      ]
    : [];

  return (
    <section className="whois">
      <div className="whois-head">
        <h2 className="section-title">WHOIS</h2>
        <button className="btn" type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : data ? 'Refresh WHOIS' : 'Load WHOIS data'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {data === undefined && !error && (
        <p className="whois-hint muted">
          Who owns this IP? Load registration data for {ip}.
        </p>
      )}
      {data === null && <p className="whois-hint muted">No registration data found for {ip}.</p>}
      {rows.length > 0 && (
        <div className="card whois-body">
          <dl className="whois-rows">
            {rows.map(
              (row) =>
                row.value && (
                  <div className="feed-row" key={row.label}>
                    <dt className="whois-label">{row.label}</dt>
                    <dd className="whois-value">{row.value}</dd>
                  </div>
                ),
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
