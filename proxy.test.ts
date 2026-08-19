import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { contentSecurityPolicy, proxy } from './proxy';

describe('runtime content security policy', () => {
  it('allows runtime-configured probe origins without a wildcard', () => {
    const previousIpv4 = process.env.CONNECTIVITY_IPV4_URL;
    const previousIpv6 = process.env.CONNECTIVITY_IPV6_URL;
    const previousUmami = process.env.UMAMI_SCRIPT_URL;
    process.env.CONNECTIVITY_IPV4_URL = 'https://v4.runtime.example.test/probe';
    process.env.CONNECTIVITY_IPV6_URL = 'https://v6.runtime.example.test/probe';
    process.env.UMAMI_SCRIPT_URL = 'https://analytics.example.test/script.js';

    try {
      const csp = contentSecurityPolicy('https://analytics.example.test');
      expect(csp).toContain("connect-src 'self' https://analytics.example.test https://v4.runtime.example.test https://v6.runtime.example.test");
      expect(csp).not.toContain('connect-src https:');
    } finally {
      if (previousIpv4 === undefined) delete process.env.CONNECTIVITY_IPV4_URL;
      else process.env.CONNECTIVITY_IPV4_URL = previousIpv4;
      if (previousIpv6 === undefined) delete process.env.CONNECTIVITY_IPV6_URL;
      else process.env.CONNECTIVITY_IPV6_URL = previousIpv6;
      if (previousUmami === undefined) delete process.env.UMAMI_SCRIPT_URL;
      else process.env.UMAMI_SCRIPT_URL = previousUmami;
    }
  });

  it('reads configured probe origins when the request is handled', () => {
    const previousIpv4 = process.env.CONNECTIVITY_IPV4_URL;
    process.env.CONNECTIVITY_IPV4_URL = 'https://v4.request.example.test/probe';

    try {
      const response = proxy(new NextRequest('http://localhost/'));
      expect(response.headers.get('Content-Security-Policy')).toContain('https://v4.request.example.test');
    } finally {
      if (previousIpv4 === undefined) delete process.env.CONNECTIVITY_IPV4_URL;
      else process.env.CONNECTIVITY_IPV4_URL = previousIpv4;
    }
  });
});
