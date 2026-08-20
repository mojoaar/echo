import type { ActivityQueryResult } from '@/lib/activity';

type ActivityTableProps = {
  result: ActivityQueryResult;
  page?: number;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
};

function timestamp(value: number): string {
  return new Date(value).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function breakdown(value: string, count: number): string {
  return `${value}: ${count}`;
}

export default function ActivityTable({ result, page = 1, hasNext = false, onPrevious, onNext }: ActivityTableProps) {
  const rows = [...result.events, ...result.legacy];
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
        {result.outcomes.map((item) => <span key={`outcome-${item.value}`}>{breakdown(item.value, item.count)}</span>)}
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
                  <td>{timestamp(row.ts)}</td>
                  <td>{row.source === 'legacy' ? 'legacy/unclassified' : row.lookupType}</td>
                  <td>{row.source === 'legacy' ? 'unknown' : row.channel}</td>
                  <td>{row.source === 'legacy' ? 'unknown' : row.actor}</td>
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
