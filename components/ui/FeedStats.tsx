'use client';

import { useState } from 'react';
import { flagEmoji } from '@/lib/flags';
import type { CountryCount } from '@/lib/types';

export type FeedRange = '24h' | '7d' | '30d' | 'all';

export interface FeedRangeData {
  count: number;
  countries: number;
  topCountries: CountryCount[];
}

export type FeedRanges = Record<FeedRange, FeedRangeData>;

const RANGE_LABELS: { value: FeedRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All' },
];

function summary(range: FeedRange, data: FeedRangeData, total: number): string {
  if (range === 'all') {
    return `${total.toLocaleString()} total · ${data.countries.toLocaleString()} countries`;
  }
  const window = range === '24h' ? '24h' : range === '7d' ? '7 days' : '30 days';
  return `${data.count.toLocaleString()} in the last ${window} · ${total.toLocaleString()} total`;
}

export default function FeedStats({
  total,
  ranges,
}: {
  total: number;
  ranges: FeedRanges;
}) {
  const [range, setRange] = useState<FeedRange>('24h');
  const data = ranges[range];

  return (
    <section className="feed" aria-label="Lookup statistics">
      <h2 className="section-title">Lookups</h2>
      <div className="feed-range">
        {RANGE_LABELS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={range === value ? 'btn primary' : 'btn'}
            aria-pressed={range === value}
            onClick={() => setRange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="feed-summary">{summary(range, data, total)}</p>
      {data.topCountries.length > 0 ? (
        <ul className="feed-chips">
          {data.topCountries.map((c) => (
            <li key={c.iso} className="feed-chip">
              <span className="feed-dot">{flagEmoji(c.iso)}</span>
              {c.iso}
              <span className="feed-count">{c.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="feed-empty">No lookups yet.</p>
      )}
    </section>
  );
}
