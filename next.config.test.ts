import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';
import { contentSecurityPolicy } from './lib/csp';

async function securityHeaders() {
  const headers = await nextConfig.headers?.();
  expect(headers).toBeDefined();
  return headers?.[0]?.headers ?? [];
}

function headerValue(headers: Awaited<ReturnType<typeof securityHeaders>>, key: string): string {
  const header = headers.find((entry) => entry.key === key);
  expect(header, `missing ${key} header`).toBeDefined();
  return header?.value ?? '';
}

describe('security headers', () => {
  it('uses a hashed theme initializer and narrowly scoped resource origins', async () => {
    const csp = contentSecurityPolicy();
    const layout = readFileSync(new URL('./app/layout.tsx', import.meta.url), 'utf8');
    const themeInitializer = layout.match(/const THEME_INIT = `([^`]*)`/)?.[1];

    expect(themeInitializer).toBeDefined();
    const themeHash = createHash('sha256').update(themeInitializer ?? '').digest('base64');

    expect(csp).toContain(`script-src 'self' 'sha256-${themeHash}'`);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(csp).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    expect(csp).not.toMatch(/(?:script-src|style-src)[^;]*\bhttps:\/\/unpkg\.com(?:\s|;|$)/);
    expect(csp).not.toMatch(/(?:script-src|style-src)[^;]*https:\/\/unpkg\.com\s/);

    expect(csp).toContain("img-src 'self'");
    expect(csp).not.toMatch(/img-src[^;]*(?:data:|blob:|https:\/\/\*\.basemaps\.cartocdn\.com)/);
    for (const host of ['a', 'b', 'c', 'd']) {
      expect(csp).toContain(`https://${host}.basemaps.cartocdn.com`);
    }

    const mapModal = readFileSync(new URL('./components/ui/MapModal.tsx', import.meta.url), 'utf8');
    expect(mapModal).toContain("const LEAFLET_VERSION = '1.9.4'");
    expect(mapModal).toContain("const LEAFLET_ORIGIN = 'https://unpkg.com'");
  });

  it('keeps required restrictions and analytics connectivity', async () => {
    const csp = contentSecurityPolicy();

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('derives the analytics origin from a configured script URL', async () => {
    const previous = process.env.UMAMI_SCRIPT_URL;
    process.env.UMAMI_SCRIPT_URL = 'https://analytics.example.test/script.js';

    try {
      const csp = contentSecurityPolicy();

      expect(csp).toContain('https://analytics.example.test');
      expect(csp).not.toContain('https://umami.johansen.foo');
    } finally {
      if (previous === undefined) delete process.env.UMAMI_SCRIPT_URL;
      else process.env.UMAMI_SCRIPT_URL = previous;
    }
  });

  it('sets isolation headers without requiring cross-origin isolation', async () => {
    const headers = await securityHeaders();

    expect(headerValue(headers, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headerValue(headers, 'Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(headers.some((entry) => entry.key === 'Cross-Origin-Embedder-Policy')).toBe(false);
  });

  it('documents proxy-owned HSTS and the LAN trust boundary', () => {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

    expect(readme).toMatch(/HSTS/i);
    expect(readme).toMatch(/external TLS proxy/i);
    expect(readme).toMatch(/NPM[^\n]*overwrite|overwrite[^\n]*NPM/i);
    expect(readme).toMatch(/firewall/i);
  });
});
