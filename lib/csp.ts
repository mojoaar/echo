const defaultUmamiOrigin = 'https://umami.johansen.foo';
const themeInitializerHash = "'sha256-zdRxDmbSmq89PI2Aciu1hQ1Z9qNSlZ+05zkXpmQT6JQ='";

function originFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function uniqueOrigins(origins: Array<string | null>): string[] {
  return origins.filter((origin, index): origin is string => origin !== null && origins.indexOf(origin) === index);
}

export function contentSecurityPolicy(nonce?: string): string {
  const umami = originFromUrl(process.env.UMAMI_SCRIPT_URL) ?? defaultUmamiOrigin;
  const connectSources = uniqueOrigins([
    "'self'",
    umami,
    originFromUrl(process.env.CONNECTIVITY_IPV4_URL),
    originFromUrl(process.env.CONNECTIVITY_IPV6_URL),
  ]);
  const scriptSources = [
    "'self'",
    themeInitializerHash,
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    umami,
  ];

  return [
    `default-src 'self'`,
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "img-src 'self' https://a.basemaps.cartocdn.com https://b.basemaps.cartocdn.com https://c.basemaps.cartocdn.com https://d.basemaps.cartocdn.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
