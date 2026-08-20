import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import FeedStats from '@/components/ui/FeedStats';
import type { FeedRanges } from '@/components/ui/FeedStats';

const ranges: FeedRanges = {
  '24h': { count: 10, countries: 3, topCountries: [{ iso: 'US', count: 6 }, { iso: 'DE', count: 4 }] },
  '7d': { count: 40, countries: 5, topCountries: [{ iso: 'US', count: 20 }, { iso: 'DE', count: 12 }, { iso: 'JP', count: 8 }] },
  '30d': { count: 120, countries: 8, topCountries: [{ iso: 'US', count: 50 }, { iso: 'DE', count: 30 }, { iso: 'JP', count: 25 }, { iso: 'BR', count: 15 }] },
  all: { count: 500, countries: 12, topCountries: [{ iso: 'US', count: 200 }, { iso: 'DE', count: 100 }] },
};

describe('FeedStats', () => {
  it('renders all range buttons and defaults to the 24h summary', () => {
    const html = renderToStaticMarkup(createElement(FeedStats, { total: 500, ranges }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('10 in the last 24h · 500 total');
    expect(html).toContain('>24h</button>');
    expect(html).toContain('>7 days</button>');
    expect(html).toContain('>30 days</button>');
    expect(html).toContain('>All</button>');
  });

  it('server-renders only the default 24h range data', () => {
    const html = renderToStaticMarkup(createElement(FeedStats, { total: 500, ranges }));
    expect(html).not.toContain('40 in the last 7 days · 500 total');
    expect(html).not.toContain('120 in the last 30 days · 500 total');
    expect(html).not.toContain('500 total · 12 countries');
  });

  it('renders the top country chips for the default range', () => {
    const html = renderToStaticMarkup(createElement(FeedStats, { total: 500, ranges }));
    expect(html).toContain('>US<');
    expect(html).toContain('>6</span>');
    expect(html).toContain('>DE<');
  });

  it('shows the empty message when the active range has no countries', () => {
    const empty: FeedRanges = {
      '24h': { count: 0, countries: 0, topCountries: [] },
      '7d': { count: 0, countries: 0, topCountries: [] },
      '30d': { count: 0, countries: 0, topCountries: [] },
      all: { count: 0, countries: 0, topCountries: [] },
    };
    const html = renderToStaticMarkup(createElement(FeedStats, { total: 0, ranges: empty }));
    expect(html).toContain('No lookups yet.');
  });
});
