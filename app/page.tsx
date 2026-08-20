import { headers } from 'next/headers';
import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup, countLookups, countSince, topCountryCodes } from '@/lib/db';
import type { IpInfo } from '@/lib/types';
import CopyButton from '@/components/ui/CopyButton';
import CopyLinkButton from '@/components/ui/CopyLinkButton';
import RefreshButton from '@/components/ui/RefreshButton';
import LookupForm from '@/components/ui/LookupForm';
import { MapTrigger } from '@/components/ui/MapModal';
import FeedStats from '@/components/ui/FeedStats';
import WhoisSection from '@/components/ui/WhoisSection';
import DnsSection from '@/components/ui/DnsSection';
import ThemeToggle from '@/components/ui/ThemeToggle';
import TypeOnText from '@/components/ui/TypeOnText';
import ConnectivitySection from '@/components/ui/ConnectivitySection';
import { getVersion } from '@/lib/version';
import type { Metadata } from 'next';
import { classifyActivityActor, isActivityPathExcluded, recordActivityEvent, resolveActivityChannel } from '@/lib/activity';

export const dynamic = 'force-dynamic';

function logOperationalEvent(event: {
  category: string;
  endpoint: string;
  status: string;
  durationMs: number;
}): void {
  console.error(JSON.stringify({
    category: event.category,
    endpoint: event.endpoint,
    status: event.status,
    durationMs: Math.max(0, Math.round(event.durationMs)),
  }));
}

const appVersion = getVersion();
const defaultSiteUrl = 'https://echo.johansen.foo';

function queryIp(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string | string[] }>;
}): Promise<Metadata> {
  const rawTarget = queryIp((await searchParams).ip);
  if (!rawTarget) return {};

  const normalized = normalizeIp(rawTarget);
  if (!isValidIp(normalized)) return {};

  const siteUrl = process.env.APP_URL || defaultSiteUrl;
  const canonicalUrl = new URL(siteUrl);
  canonicalUrl.pathname = '/';
  canonicalUrl.search = '';
  canonicalUrl.hash = '';

  return {
    title: `IP lookup: ${normalized} | echo`,
    description: `Lookup location, ISP, hostname and connectivity details for ${normalized} with echo.`,
    alternates: { canonical: canonicalUrl.toString() },
    robots: { index: false, follow: true },
  };
}

type InfoCardProps = {
  label: string;
  value: string | null;
  children?: React.ReactNode;
};

function InfoCard({ label, value, children }: InfoCardProps) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      {value ? (
        <div className="card-value">{value}</div>
      ) : (
        <div className="card-value muted">unavailable</div>
      )}
      {children}
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawTarget = queryIp(params.ip);
  const requestHeaders = await headers();
  const visitorIp = extractVisitorIp(requestHeaders);
  const baseUrl = process.env.APP_URL || defaultSiteUrl;

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
    const startedAt = Date.now();
    try {
      insertLookup(info.ip, info.country);
    } catch {
      logOperationalEvent({ category: 'database_write', endpoint: 'page', status: 'error', durationMs: Date.now() - startedAt });
    }
    if (!isActivityPathExcluded('/')) try {
      recordActivityEvent({
        ip: visitorIp ?? 'unknown',
        iso: info.country,
        ts: Date.now(),
        lookupType: 'page',
        channel: resolveActivityChannel('/'),
        actor: classifyActivityActor(requestHeaders.get('user-agent')),
        target: info.ip,
        outcome: info.country ? 'success' : 'partial',
        partial: !info.country,
      });
    } catch {}
  }

  const stats = { total: 0, last24h: 0, topCountries: [] as { iso: string; count: number }[] };
  try {
    stats.total = countLookups();
    stats.last24h = countSince(Date.now() - 86_400_000);
    stats.topCountries = topCountryCodes(12);
  } catch {
    logOperationalEvent({ category: 'database_read', endpoint: 'page', status: 'error', durationMs: 0 });
  }

  const showsOwnIp = !target || !rawTarget;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'echo',
      url: baseUrl,
      description: 'See your IP address, location, ISP and more.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'echo',
      url: baseUrl,
      description: 'What the internet sees when you connect.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];

  return (
    <div className="shell">
      {jsonLd.map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
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
              {info.isPrivate ? (
                <h1 className="ip-hero">You are on a private network</h1>
              ) : (
                <TypeOnText text={info.ip} />
              )}
              <div className="hero-actions">
                {!info.isPrivate && (
                  <>
                    <CopyButton value={info.ip} label="Copy" />
                    <CopyButton value={JSON.stringify(info, null, 2)} label="Copy as JSON" />
                    <CopyLinkButton ip={info.ip} baseUrl={process.env.APP_URL || undefined} />
                  </>
                )}
                <RefreshButton />
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

        {info && !info.isPrivate ? <WhoisSection ip={info.ip} /> : null}

        <DnsSection />

        <ConnectivitySection
          ipv4Url={process.env.CONNECTIVITY_IPV4_URL}
          ipv6Url={process.env.CONNECTIVITY_IPV6_URL}
        />

        <FeedStats total={stats.total} last24h={stats.last24h} topCountries={stats.topCountries} />
      </main>

      <footer>
        <p>
          echo — IP + geo lookup. Data via{' '}
          <a href="https://db-ip.com/" target="_blank" rel="noreferrer">
            db-ip
          </a>{' '}
          (CC BY 4.0).
        </p>
        <p>
          <code>curl {baseUrl}/api/ip</code> ·{' '}
          <code>curl {baseUrl}/api/json</code>
        </p>
        <p>
          Built with{' '}
          <span title="Love" aria-hidden="true">❤️</span>{' '}&{' '}
          <span title="AI" aria-hidden="true">🤖</span> by{' '}
          <a href="https://johansen.foo/" target="_blank" rel="noreferrer">
            Morten Johansen
          </a>{' '}
          (
          <a
            href="https://github.com/mojoaar/echo"
            target="_blank"
            rel="noreferrer"
          >
            v{appVersion}
          </a>
          )
        </p>
      </footer>
    </div>
  );
}
