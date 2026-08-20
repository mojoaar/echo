import type { ActivityQueryResult } from '@/lib/activity';

type ActivityTableProps = {
  result: ActivityQueryResult;
  page?: number;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  timezone?: string;
};

function timestamp(value: number, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function breakdown(value: string, count: number): string {
  return `${value}: ${count}`;
}

function trendPoints(result: ActivityQueryResult): Array<{ x: number; y: number }> {
  const trend = result.trend ?? [];
  const max = Math.max(...trend.map((item) => item.count), 1);
  return trend.map((item, index) => ({
    x: (index / Math.max(trend.length - 1, 1)) * 100,
    y: 40 - (item.count / max) * 34,
  }));
}

export default function ActivityTable({ result, timezone = 'UTC', page = 1, hasNext = false, onPrevious, onNext }: ActivityTableProps) {
  const rows = [...result.events].sort((left, right) =>
    right.ts - left.ts || (right.id ?? -1) - (left.id ?? -1),
  );
  return (
    <section className="admin-panel" aria-labelledby="activity-heading">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">visitor activity</p>
          <h2 id="activity-heading">Activity</h2>
        </div>
        <p className="admin-note">Bot labels are heuristic, based on User-Agent.</p>
      </div>
      <div className="admin-summary" aria-label="Activity summary">
        <div><span>Total successful events</span><strong>{result.totalSuccessfulEvents.toLocaleString()}</strong></div>
        <div><span>unique IPs</span><strong>{result.uniqueIps.toLocaleString()}</strong></div>
      </div>
      <div className="admin-breakdowns">
        {result.types.map((item) => <span key={`type-${item.value}`}>{breakdown(item.value, item.count)}</span>)}
        {result.countries.map((item) => <span key={`country-${item.iso}`}>{breakdown(item.iso, item.count)}</span>)}
        {(result.channels ?? []).map((item) => <span key={`channel-${item.value}`}>channel {breakdown(item.value, item.count)}</span>)}
        {(result.actors ?? []).map((item) => <span key={`actor-${item.value}`}>actor {breakdown(item.value, item.count)}</span>)}
        {(result.outcomes ?? []).map((item) => <span key={`outcome-${item.value}`}>outcome {breakdown(item.value, item.count)}</span>)}
        {(result.partials ?? []).map((item) => <span key={`partial-${item.value}`}>status {breakdown(item.value, item.count)}</span>)}
      </div>
      <div className="admin-activity-trend">
        <div className="admin-chart-label">Activity trend</div>
        {result.trend?.length ? (() => {
          const points = trendPoints(result);
          const line = points.map((point) => `${point.x},${point.y}`).join(' ');
          const single = points.length === 1;
          const plotLine = single ? `0,${points[0].y} 100,${points[0].y}` : line;
          return (
            <div className="admin-trend-plot">
              <svg viewBox="0 0 100 40" role="img" aria-label="Activity trend" preserveAspectRatio="none">
                <polyline points={plotLine} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
              {points.map((point, index) => (
                <span
                  key={index}
                  className="admin-trend-dot"
                  style={{ left: `${single ? 50 : Math.min(96, Math.max(4, point.x))}%`, top: `${(point.y / 40) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          );
        })() : <p className="admin-empty">No activity trend for this range.</p>}
      </div>
      {rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>IP</th><th>Country</th><th>Timestamp</th><th>Type</th><th>Channel</th><th>Actor</th><th>Target</th><th>Outcome</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.source}-${row.id ?? row.ts}-${index}`}>
                  <td>{row.ip}</td>
                  <td>{row.iso ?? '—'}</td>
                  <td>{timestamp(row.ts, timezone)}</td>
                  <td>{row.lookupType}</td>
                  <td>{row.channel}</td>
                  <td>{row.actor}</td>
                  <td>{row.target ?? '—'}</td>
                  <td>{row.partial ? 'partial' : row.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="admin-empty">No activity for this range.</p>}
      <div className="admin-pagination">
        <span>Page {page}</span>
        <button className="btn" type="button" onClick={onPrevious} disabled={page <= 1}>Previous page</button>
        <button className="btn" type="button" onClick={onNext} disabled={!hasNext}>Next page</button>
      </div>
    </section>
  );
}
