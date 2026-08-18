import { relativeTime } from '@/lib/time';
import type { HistoryEntry } from '@/lib/types';

export default function RecentFeed({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="feed" aria-label="Recent lookups">
      <h2 className="section-title">Recent lookups</h2>
      <ul className="feed-list">
        {entries.map((e) => (
          <li key={`${e.ip}-${e.ts}`} className="feed-row">
            <span className="feed-dot">{e.iso ?? '·'}</span>
            <span className="feed-ip">{e.ip}</span>
            <span className="feed-ts">{relativeTime(e.ts)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}