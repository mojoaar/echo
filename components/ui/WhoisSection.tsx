'use client';
import { useState } from 'react';
import type { RdapResponse } from '@/lib/guards';
import { isRdapResponse } from '@/lib/guards';

export default function WhoisSection({ ip }: { ip: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RdapResponse | undefined>(undefined);

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

  const ipRows: Array<{ label: string; value: string | null }> = data?.ip
    ? [
        { label: 'Organization', value: data.ip.organization },
        { label: 'Registrant', value: data.ip.registrant },
        {
          label: 'Abuse contact',
          value: [data.ip.abuse?.email, data.ip.abuse?.phone].filter(Boolean).join(' · ') || null,
        },
        {
          label: 'Netblock',
          value:
            data.ip.startAddress && data.ip.endAddress
              ? `${data.ip.startAddress} – ${data.ip.endAddress}`
              : null,
        },
        { label: 'CIDR', value: data.ip.cidr },
        { label: 'Handle', value: data.ip.handle },
      ]
    : [];

  const asnRows: Array<{ label: string; value: string | null }> = data?.asn
    ? [
        { label: 'Organization', value: data.asn.organization },
        { label: 'Name', value: data.asn.name },
        { label: 'Country', value: data.asn.country },
        {
          label: 'ASN range',
          value:
            data.asn.startAutnum != null && data.asn.endAutnum != null
              ? `AS${data.asn.startAutnum} – AS${data.asn.endAutnum}`
              : null,
        },
        { label: 'Handle', value: data.asn.handle },
        {
          label: 'Abuse contact',
          value: [data.asn.abuse?.email, data.asn.abuse?.phone].filter(Boolean).join(' · ') || null,
        },
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
      {data && (
        <>
          <h3 className="whois-subtitle">IP registration and netblock</h3>
          {data.ip ? <WhoisRows rows={ipRows} /> : <p className="whois-hint muted">IP registration data is unavailable.</p>}
          <h3 className="whois-subtitle">ASN registration</h3>
          {data.asn ? <WhoisRows rows={asnRows} /> : <p className="whois-hint muted">ASN registration data is unavailable. Retry to check again.</p>}
        </>
      )}
    </section>
  );
}

function WhoisRows({ rows }: { rows: Array<{ label: string; value: string | null }> }) {
  return (
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
  );
}
