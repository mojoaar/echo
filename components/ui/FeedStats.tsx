import { flagEmoji } from '@/lib/geo';
import type { CountryCount } from '@/lib/types';

export default function FeedStats({
  total,
  last24h,
  topCountries,
}: {
  total: number;
  last24h: number;
  topCountries: CountryCount[];
}) {
  return (
    <section className="feed" aria-label="Lookup statistics">
      <h2 className="section-title">Lookups</h2>
      <p className="feed-summary">
        {last24h.toLocaleString()} in the last 24h · {total.toLocaleString()} total
      </p>
      {topCountries.length > 0 ? (
        <ul className="feed-chips">
          {topCountries.map((c) => (
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
