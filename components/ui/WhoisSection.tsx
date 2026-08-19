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

  const ipOrganization = data?.ip?.organization ?? null;
  const asnOrganization = data?.asn?.organization ?? null;
  const ipAbuse = [data?.ip?.abuse?.email, data?.ip?.abuse?.phone].filter(Boolean).join(' · ') || null;
  const asnAbuse = [data?.asn?.abuse?.email, data?.asn?.abuse?.phone].filter(Boolean).join(' · ') || null;
  const sharedAbuse = ipAbuse && ipAbuse === asnAbuse ? ipAbuse : null;
  const registrationRows: Array<{ label: string; value: string | null }> = [
    {
      label: 'IP netblock',
      value:
        data?.ip?.startAddress && data.ip.endAddress
          ? `${data.ip.startAddress} – ${data.ip.endAddress}`
          : null,
    },
    { label: 'IP CIDR', value: data?.ip?.cidr ?? null },
    { label: 'IP handle', value: data?.ip?.handle ?? null },
    { label: 'Registrant', value: data?.ip?.registrant ?? null },
    { label: 'IP organization', value: ipOrganization },
    { label: 'ASN organization', value: asnOrganization && asnOrganization !== ipOrganization ? asnOrganization : null },
    { label: 'ASN name', value: data?.asn?.name ?? null },
    { label: 'ASN country', value: data?.asn?.country ?? null },
    {
      label: 'ASN range',
      value:
        data?.asn?.startAutnum != null && data.asn.endAutnum != null
          ? `AS${data.asn.startAutnum} – AS${data.asn.endAutnum}`
          : null,
    },
    { label: 'ASN handle', value: data?.asn?.handle ?? null },
    { label: 'Abuse contact', value: sharedAbuse },
    { label: 'IP abuse contact', value: sharedAbuse ? null : ipAbuse },
    { label: 'ASN abuse contact', value: sharedAbuse ? null : asnAbuse },
  ];

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
          <section aria-labelledby="whois-registration-title">
            <h3 className="whois-subtitle" id="whois-registration-title">WHOIS registration</h3>
            {data.ip || data.asn ? <WhoisRows rows={registrationRows} /> : <p className="whois-hint muted">Registration data is unavailable. Retry to check again.</p>}
          </section>
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
