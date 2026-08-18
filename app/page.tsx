import { headers } from 'next/headers';
import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup, listRecent } from '@/lib/db';
import type { HistoryEntry, IpInfo } from '@/lib/types';
import CopyButton from '@/components/ui/CopyButton';
import RefreshButton from '@/components/ui/RefreshButton';
import LookupForm from '@/components/ui/LookupForm';
import { MapTrigger } from '@/components/ui/MapModal';
import RecentFeed from '@/components/ui/RecentFeed';
import ThemeToggle from '@/components/ui/ThemeToggle';

export const dynamic = 'force-dynamic';

type InfoCardProps = {
  label: string;
  value: string | null;
  hint?: string;
  code?: string | null;
  children?: React.ReactNode;
};

function InfoCard({ label, value, hint, code, children }: InfoCardProps) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      {value ? (
        <div className="card-value">{value}</div>
      ) : (
        <div className="card-value muted">unavailable</div>
      )}
      {code ? <span className="chip">{code}</span> : null}
      {hint ? <div className="card-hint">{hint}</div> : null}
      {children}
    </div>
  );
}

function dedupeConsecutive(rows: HistoryEntry[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (!last || last.ip !== row.ip || last.iso !== row.iso) out.push(row);
  }
  return out;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string }>;
}) {
  const params = await searchParams;
  const rawTarget = params.ip?.trim() ?? null;
  const visitorIp = extractVisitorIp(await headers());

  let target: string | null = null;
  let error: string | null = null;

  if (rawTarget) {
    const normalized = normalizeIp(rawTarget);
    if (isValidIp(normalized)) {
      target = normalized;
    } else {
      error = `"${rawTarget}" is not a valid IP address.`;
    }
  } else if (visitorIp) {
    target = normalizeIp(visitorIp);
  } else {
    error = 'Could not determine your IP address.';
  }

  let info: IpInfo | null = null;
  if (target) {
    info = await lookupInfo(target, { hostname: true });
    try {
      insertLookup(info.ip, info.country);
    } catch {}
  }

  let recent: HistoryEntry[] = [];
  try {
    recent = dedupeConsecutive(listRecent(12));
  } catch {}

  const showsOwnIp = !target || !rawTarget;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">echo</span>
          <span className="brand-tag">what the internet sees when you connect</span>
        </div>
        <ThemeToggle />
      </header>

      <main>
        <section className="hero">
          <p className="hero-label">{showsOwnIp ? 'Your IP address' : 'Lookup result'}</p>
          {info ? (
            <>
              <h1 className="ip-hero">
                {info.isPrivate ? 'You are on a private network' : info.ip}
              </h1>
              <div className="hero-actions">
                {!info.isPrivate && <CopyButton value={info.ip} label="Copy" />}
                <CopyButton value={JSON.stringify(info, null, 2)} label="Copy as JSON" />
                {showsOwnIp && <RefreshButton />}
              </div>
            </>
          ) : (
            <h1 className="ip-hero muted">—</h1>
          )}
          {error && <p className="error">{error}</p>}
        </section>

        <LookupForm />

        <section className="cards" aria-label="Lookup details">
          <InfoCard
            label="Location"
            value={info ? [info.city, info.region].filter(Boolean).join(', ') || null : null}
          />
          <InfoCard
            label="Country"
            value={info?.countryName ? `${info.flag ?? ''} ${info.countryName}`.trim() : null}
            code={info?.countryCode ?? null}
          />
          <InfoCard
            label="Coordinates"
            value={
              info?.latitude != null && info?.longitude != null
                ? `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}`
                : null
            }
          >
            {info?.latitude != null && info?.longitude != null ? (
              <MapTrigger lat={info.latitude} lon={info.longitude} />
            ) : null}
          </InfoCard>
          <InfoCard
            label="ISP / ASN"
            value={info ? [info.org, info.asn].filter(Boolean).join(' · ') || null : null}
          />
          <InfoCard
            label="Timezone"
            value={
              info?.timezone
                ? `${info.timezone}${info.utcOffset ? ` (UTC ${info.utcOffset})` : ''}`
                : null
            }
          />
          <InfoCard label="Hostname" value={info?.hostname ?? null} />
        </section>

        <RecentFeed entries={recent} />
      </main>

      <footer>
        <p>echo — IP + geo lookup. Data via db-ip (CC BY 4.0).</p>
        <p>
          <code>curl https://echo.johansen.foo/api/ip</code> ·{' '}
          <code>curl https://echo.johansen.foo/api/json</code>
        </p>
      </footer>
    </div>
  );
}