import type { Metadata } from 'next';
import DocsHighlight from '@/components/docs/DocsHighlight';
import SiteFooter from '@/components/ui/SiteFooter';
import SiteHeader from '@/components/ui/SiteHeader';

export const dynamic = 'force-dynamic';

const defaultSiteUrl = 'https://echo.johansen.foo';

export const metadata: Metadata = {
  title: 'Docs — echo',
  description: 'General usage, API reference and deployment notes for echo.',
};

function MethodBadge({ method }: { method: string }) {
  return <span className={`method-badge method-${method.toLowerCase()}`}>{method}</span>;
}

function Endpoint({
  id,
  method,
  path,
  desc,
  children,
}: {
  id?: string;
  method: string;
  path: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="endpoint">
      <h4>
        <MethodBadge method={method} /> <code>{path}</code>
      </h4>
      <p className="endpoint-desc">{desc}</p>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

function NavGroup({ label }: { label: string }) {
  return <div className="docs-nav-group">{label}</div>;
}

export default function DocsPage() {
  const siteUrl = process.env.APP_URL || defaultSiteUrl;

  return (
    <div className="shell">
      <DocsHighlight />
      <SiteHeader />

      <main className="docs-wrap">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <NavGroup label="Getting started" />
          <a className="docs-nav-link" href="#introduction">Introduction</a>
          <a className="docs-nav-link" href="#what-echo-does">What echo does</a>
          <a className="docs-nav-link" href="#lookup">Lookup any IP</a>
          <a className="docs-nav-link" href="#share">Share links</a>
          <a className="docs-nav-link" href="#map-and-copy">Map and copy</a>
          <a className="docs-nav-link" href="#connectivity">Connectivity diagnostics</a>
          <a className="docs-nav-link" href="#privacy">Privacy model</a>

          <NavGroup label="API reference" />
          <a className="docs-nav-link" href="#overview">Overview</a>
          <a className="docs-nav-link" href="#rate-limiting">Rate limiting and errors</a>
          <a className="docs-nav-link" href="#api-ip">/api/ip</a>
          <a className="docs-nav-link" href="#api-json">/api/json</a>
          <a className="docs-nav-link" href="#api-whois">/api/whois</a>
          <a className="docs-nav-link" href="#api-dns">/api/dns</a>
          <a className="docs-nav-link" href="#api-history">/api/history</a>
          <a className="docs-nav-link" href="#api-stats">/api/stats</a>
          <a className="docs-nav-link" href="#api-health">/api/health</a>

          <NavGroup label="Operations" />
          <a className="docs-nav-link" href="#environment">Environment variables</a>
          <a className="docs-nav-link" href="#deployment">Deployment</a>
          <a className="docs-nav-link" href="#nginx">Nginx Proxy Manager</a>
          <a className="docs-nav-link" href="#probes">Connectivity probes</a>
          <a className="docs-nav-link" href="#admin">Private admin dashboard</a>
          <a className="docs-nav-link" href="#releasing">Releasing</a>
          <a className="docs-nav-link" href="#data">Data and attribution</a>
        </aside>

        <div className="docs-content">
          <h1>Documentation</h1>
          <p>
            echo shows you exactly what the internet sees when you connect: your IP
            address, location, ISP and more. This page covers general usage, the public
            API, and running it yourself.
          </p>

          <h2 id="introduction">Introduction</h2>
          <p>
            echo is a server-side IP and geo lookup tool. When you open the site it
            detects your public IP, looks it up against a bundled geo database, and
            shows location, country, coordinates, ISP/ASN, timezone and hostname. You
            can also look up any IP address, resolve DNS records, and query WHOIS
            registration data — all without a client-side geo call.
          </p>

          <h2 id="what-echo-does">What echo does</h2>
          <ul>
            <li>Shows your public IP and geo information from a bundled database</li>
            <li>Looks up any IP via <code>?ip=</code> on the home page or the API</li>
            <li>Resolves forward DNS records (A, AAAA, MX, NS, TXT, SOA)</li>
            <li>Queries WHOIS/RDAP registration and ASN data on demand</li>
            <li>Runs an optional IPv4/IPv6 connectivity diagnostic from your browser</li>
            <li>Logs aggregate lookup statistics — never raw visitor IPs publicly</li>
          </ul>

          <h2 id="lookup">Lookup any IP</h2>
          <p>
            Add <code>?ip=8.8.8.8</code> to the home page URL to look up any public IP:
          </p>
          <Code>{`${siteUrl}/?ip=8.8.8.8`}</Code>
          <p>
            Both IPv4 and IPv6 are supported. The page shows the lookup result instead
            of your own details and the copy and share actions work for the looked-up
            address.
          </p>

          <h2 id="share">Share links</h2>
          <p>
            Use the copy link button to get a shareable <code>?ip=</code> URL. It uses
            the configured <code>APP_URL</code> when set, otherwise the address you are
            viewing from. Lookup pages set <code>noindex</code> metadata so search
            engines do not index query-specific URLs.
          </p>

          <h2 id="map-and-copy">Map and copy</h2>
          <p>
            The coordinates card opens a Leaflet map centred on the approximate
            city-level location. Copy and copy-as-JSON buttons put the IP or the full
            lookup payload on your clipboard. Clipboard failures are reported honestly.
          </p>

          <h2 id="connectivity">Connectivity diagnostics</h2>
          <p>
            When <code>CONNECTIVITY_IPV4_URL</code> or <code>CONNECTIVITY_IPV6_URL</code>{' '}
            are configured, a connectivity section lets your browser probe each
            endpoint and report IPv4/IPv6 reachability with latency. This measures
            browser reachability only — it never changes the IP recorded by the server.
            The section is hidden when no probe URL is configured.
          </p>

          <h2 id="privacy">Privacy model</h2>
          <p>
            The public site never exposes raw visitor IPs. Recent lookups are shown as
            aggregate totals and top countries. Exact IPs are visible only in the
            token-protected admin dashboard. Lookup rows are pruned after{' '}
            <code>LOOKUP_RETENTION_DAYS</code> (default 90 days). No cookies are used
            except the optional admin session cookie.
          </p>

          <h2 id="overview">Overview</h2>
          <p>
            All public endpoints are <code>GET</code>, return JSON with{' '}
            <code>Access-Control-Allow-Origin: *</code>, and are rate limited per
            visitor IP. The visitor IP is read from <code>X-Real-IP</code> first, then{' '}
            <code>X-Forwarded-For</code>; your reverse proxy must overwrite these
            headers with the verified client address.
          </p>
          <p>JSON errors use a stable shape:</p>
          <Code>{`{ "error": "human readable message", "code": "stable_code" }`}</Code>

          <h2 id="rate-limiting">Rate limiting and errors</h2>
          <p>
            Each public endpoint has its own fixed-window budget (defaults below). A
            response carries <code>x-ratelimit-limit</code> and{' '}
            <code>x-ratelimit-remaining</code>. When a budget is exhausted the API
            returns HTTP 429 with a <code>retry-after</code> header in seconds.
          </p>
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Default budget (per 60s)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>/api/ip</td><td>60</td></tr>
              <tr><td>/api/json</td><td>30</td></tr>
              <tr><td>/api/history</td><td>30</td></tr>
              <tr><td>/api/whois</td><td>10</td></tr>
              <tr><td>/api/dns</td><td>10</td></tr>
            </tbody>
          </table>

          <Endpoint id="api-ip" method="GET" path="/api/ip" desc="Returns the visitor IP as plain text, or a specific IP when ?ip= is provided.">
            <Code>{`curl ${siteUrl}/api/ip`}</Code>
            <Code>{`203.0.113.7`}</Code>
            <Code>{`curl "${siteUrl}/api/ip?ip=8.8.8.8"`}</Code>
            <Code>{`8.8.8.8`}</Code>
          </Endpoint>

          <Endpoint id="api-json" method="GET" path="/api/json" desc="Returns the full normalized lookup payload for the visitor or for ?ip=.">
            <Code>{`curl "${siteUrl}/api/json?ip=8.8.8.8"`}</Code>
            <Code>{`{
  "ip": "8.8.8.8",
  "city": "Mountain View",
  "region": "California",
  "country": "US",
  "countryName": "United States",
  "flag": "🇺🇸",
  "org": "Google LLC",
  "asn": "AS15169",
  "timezone": "America/Los_Angeles",
  "utcOffset": "-07:00",
  "latitude": 37.422,
  "longitude": -122.085,
  "hostname": "dns.google",
  "isPrivate": false
}`}</Code>
          </Endpoint>

          <Endpoint id="api-whois" method="GET" path="/api/whois" desc="Returns WHOIS/RDAP registration and ASN data for ?ip= (on demand, cached).">
            <Code>{`curl "${siteUrl}/api/whois?ip=8.8.8.8"`}</Code>
            <Code>{`{
  "ip": {
    "handle": "NET-8-8-8-0-2",
    "name": "GOGL",
    "startAddress": "8.8.8.0",
    "endAddress": "8.8.8.255",
    "country": "US",
    "cidr": "8.8.8.0/24",
    "organization": "Google LLC",
    "registrant": "Google LLC",
    "abuse": null
  },
  "asn": {
    "handle": "AS15169",
    "name": "GOOGLE",
    "country": "US",
    "organization": "Google LLC"
  }
}`}</Code>
          </Endpoint>

          <Endpoint id="api-dns" method="GET" path="/api/dns" desc="Resolves A, AAAA, MX, NS, TXT and SOA records for ?name= with cache metadata.">
            <Code>{`curl "${siteUrl}/api/dns?name=example.com"`}</Code>
            <Code>{`{
  "name": "example.com",
  "records": {
    "a": ["93.184.216.34"],
    "aaaa": [],
    "mx": [],
    "ns": ["a.iana-servers.net"],
    "txt": [],
    "soa": ["a.iana-servers.net hostmaster.iana.org"]
  },
  "cache": "miss",
  "resolvedAt": "2026-08-20T10:00:00.000Z",
  "durationMs": 42,
  "partial": false
}`}</Code>
          </Endpoint>

          <Endpoint id="api-history" method="GET" path="/api/history" desc="Returns aggregate lookup statistics: totals and top countries, never raw IPs.">
            <Code>{`curl ${siteUrl}/api/history`}</Code>
            <Code>{`{
  "total": 1234,
  "last24h": 56,
  "topCountries": [
    { "iso": "US", "count": 42 },
    { "iso": "DE", "count": 7 }
  ]
}`}</Code>
          </Endpoint>

          <Endpoint id="api-stats" method="GET" path="/api/stats" desc="Private owner analytics guarded by STATS_TOKEN. Pass ?token= or an Authorization: Bearer header.">
            <Code>{`curl -H "Authorization: Bearer $STATS_TOKEN" ${siteUrl}/api/stats`}</Code>
            <Code>{`{
  "total": 1234,
  "last24h": 56,
  "topCountries": [],
  "topIps": [{ "ip": "203.0.113.7", "count": 12 }],
  "daily": [{ "day": "2026-08-20", "count": 56 }]
}`}</Code>
          </Endpoint>

          <Endpoint id="api-health" method="GET" path="/api/health" desc="Public liveness check returning {status:ok}. Readiness detail requires the HEALTH_TOKEN.">
            <Code>{`curl ${siteUrl}/api/health`}</Code>
            <Code>{`{ "status": "ok" }`}</Code>
          </Endpoint>

          <h2 id="environment">Environment variables</h2>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>APP_URL</td><td>https://echo.johansen.foo</td><td>Public origin used for metadata, sitemap and share links</td></tr>
              <tr><td>TZ</td><td>Europe/Copenhagen</td><td>Container timezone for logs and admin timestamps</td></tr>
              <tr><td>RATE_LIMIT_MAX</td><td>(per endpoint)</td><td>Legacy global fallback for request budget per window</td></tr>
              <tr><td>RATE_LIMIT_WINDOW_MS</td><td>60000</td><td>Legacy global fallback window</td></tr>
              <tr><td>RATE_LIMIT_&lt;ENDPOINT&gt;_MAX</td><td>ip 60, json 30, history 30, whois 10, dns 10, stats-auth 5</td><td>Per-endpoint budget</td></tr>
              <tr><td>RATE_LIMIT_&lt;ENDPOINT&gt;_WINDOW_MS</td><td>60000</td><td>Per-endpoint window</td></tr>
              <tr><td>DNS_TIMEOUT_MS</td><td>6000</td><td>Overall DNS resolution deadline</td></tr>
              <tr><td>DNS_MAX_CONCURRENCY</td><td>2</td><td>Concurrent resolver jobs</td></tr>
              <tr><td>DNS_CACHE_TTL_MS</td><td>30000</td><td>Successful DNS cache lifetime</td></tr>
              <tr><td>DNS_FAILURE_TTL_MS</td><td>5000</td><td>Failed DNS cache lifetime</td></tr>
              <tr><td>DNS_CACHE_MAX</td><td>100</td><td>Maximum cached hostnames</td></tr>
              <tr><td>LOOKUP_RETENTION_DAYS</td><td>90</td><td>How long lookup rows are kept</td></tr>
              <tr><td>STATS_TOKEN</td><td>(unset)</td><td>Secret protecting /api/stats; endpoint disabled when unset</td></tr>
              <tr><td>HEALTH_TOKEN</td><td>(unset)</td><td>Secret protecting authenticated readiness detail</td></tr>
              <tr><td>ADMIN_TOKEN</td><td>(unset)</td><td>Secret enabling the /admin dashboard; hidden when unset</td></tr>
              <tr><td>ADMIN_SESSION_TTL_SECONDS</td><td>28800</td><td>Admin session lifetime in seconds</td></tr>
              <tr><td>CONNECTIVITY_IPV4_URL</td><td>(unset)</td><td>IPv4 probe endpoint used by the browser diagnostic</td></tr>
              <tr><td>CONNECTIVITY_IPV6_URL</td><td>(unset)</td><td>IPv6 probe endpoint used by the browser diagnostic</td></tr>
              <tr><td>ECHO_IMAGE_SIZE_BYTES</td><td>(unset)</td><td>Optional deployed image size shown in admin resources</td></tr>
              <tr><td>UMAMI_SCRIPT_URL</td><td>https://umami.johansen.foo/script.js</td><td>Umami script URL; analytics only when set</td></tr>
              <tr><td>UMAMI_WEBSITE_ID</td><td>(unset)</td><td>Umami website id; analytics only when set</td></tr>
            </tbody>
          </table>

          <h2 id="deployment">Deployment</h2>
          <p>
            Images are published to GitHub Container Registry. Copy{' '}
            <code>docker-compose.yml</code> to your host, configure a <code>.env</code>{' '}
            next to it, then:
          </p>
          <Code>{`docker compose pull
docker compose up -d`}</Code>
          <p>
            The service listens on port 3100. Keep the host firewall closed to direct
            access if a reverse proxy is the only intended entry point; TLS and HSTS
            are owned by the external TLS proxy. Data persists in the <code>echo-data</code> volume.
          </p>

          <h2 id="nginx">Nginx Proxy Manager</h2>
          <p>
            NPM 2.x Proxy Hosts automatically overwrite <code>X-Real-IP</code>,{' '}
            <code>X-Forwarded-For</code>, <code>X-Forwarded-Proto</code> and{' '}
            <code>X-Forwarded-Host</code>, so a single-hop setup needs no manual
            configuration. echo trusts <code>X-Real-IP</code> first.
          </p>
          <p>
            With Cloudflare in front, open the Advanced tab and add:{' '}
            <code>set_real_ip_from</code> for each Cloudflare range, then{' '}
            <code>real_ip_header CF-Connecting-IP;</code>. For an intermediate proxy,
            use <code>set_real_ip_from</code> with that proxy's range and{' '}
            <code>real_ip_header X-Forwarded-For;</code> with{' '}
            <code>real_ip_recursive on;</code>.
          </p>

          <h2 id="probes">Connectivity probes</h2>
          <p>
            The connectivity diagnostic needs two lightweight endpoints reachable from
            browsers: one over IPv4 only and one over IPv6 only. Configure{' '}
            <code>CONNECTIVITY_IPV4_URL</code> and <code>CONNECTIVITY_IPV6_URL</code>{' '}
            with those URLs. The probe responses should be CORS-enabled and return a
            minimal payload; they are never used for lookups or logged as visitor
            activity.
          </p>

          <h2 id="admin">Private admin dashboard</h2>
          <p>
            Set <code>ADMIN_TOKEN</code> to enable <code>/admin</code>. The dashboard
            shows exact visitor activity (type, channel, actor, country, IP, target),
            aggregate breakdowns, and resource sampling (CPU, memory, storage). Sessions
            are signed HttpOnly cookies; logout revokes the session server-side. When{' '}
            <code>ADMIN_TOKEN</code> is unset the whole area returns 404.
          </p>

          <h2 id="releasing">Releasing</h2>
          <p>
            Releases use <code>npm run release:patch</code>,{' '}
            <code>npm run release:minor</code> or <code>npm run release:major</code>.
            The script bumps the version, moves the Unreleased changelog into a dated
            section, commits and tags. Pushing the tag triggers CI to build and publish
            the image to GitHub Container Registry.
          </p>

          <h2 id="data">Data and attribution</h2>
          <p>
            Geo data comes from db-ip and is licensed under CC BY 4.0. Attribution is
            shown in the site footer.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
