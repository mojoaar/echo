import type { NextConfig } from 'next';

function umamiOrigin(): string | null {
  const url = process.env.UMAMI_SCRIPT_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function connectivityOrigins(): string[] {
  return [process.env.CONNECTIVITY_IPV4_URL, process.env.CONNECTIVITY_IPV6_URL]
    .flatMap((url) => {
      if (!url) return [];
      try {
        return [new URL(url).origin];
      } catch {
        return [];
      }
    })
    .filter((origin, index, origins) => origins.indexOf(origin) === index);
}

const defaultUmamiOrigin = 'https://umami.johansen.foo';
const themeInitializerHash = "'sha256-zdRxDmbSmq89PI2Aciu1hQ1Z9qNSlZ+05zkXpmQT6JQ='";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    const scriptSources = [
      "'self'",
      themeInitializerHash,
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      umamiOrigin() ?? defaultUmamiOrigin,
    ];
    const umami = umamiOrigin() ?? defaultUmamiOrigin;
    const connectSources = ["'self'", umami, ...connectivityOrigins()]
      .filter((origin, index, origins) => origins.indexOf(origin) === index);
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${scriptSources.join(' ')}`,
              "style-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
              "img-src 'self' https://a.basemaps.cartocdn.com https://b.basemaps.cartocdn.com https://c.basemaps.cartocdn.com https://d.basemaps.cartocdn.com",
              "font-src 'self' data:",
              `connect-src ${connectSources.join(' ')}`,
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
