import type { AdminResourceRow } from './types';

type ResourceChartsProps = {
  history: AdminResourceRow[];
};

function points(history: AdminResourceRow[], key: 'memoryUsedBytes' | 'dataUsedBytes'): string {
  const values = history.map((row) => row[key]).filter((value): value is number => value !== null);
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  return history.map((row, index) => {
    const value = row[key];
    return value === null ? '' : `${(index / Math.max(history.length - 1, 1)) * 100},${40 - (value / max) * 34}`;
  }).filter(Boolean).join(' ');
}

function Chart({ label, points: chartPoints }: { label: string; points: string }) {
  return (
    <div className="admin-chart">
      <div className="admin-chart-label">{label}</div>
      {chartPoints ? <svg viewBox="0 0 100 40" role="img" aria-label={`${label} history`} preserveAspectRatio="none"><polyline points={chartPoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg> : <p className="admin-empty">No samples available.</p>}
    </div>
  );
}

export default function ResourceCharts({ history }: ResourceChartsProps) {
  return (
    <section className="admin-panel" aria-labelledby="resource-history-heading">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">bounded history</p>
          <h2 id="resource-history-heading">Resource trends</h2>
        </div>
        <p className="admin-note">Up to 30 days of five-minute samples.</p>
      </div>
      <div className="admin-charts">
        <Chart label="Memory" points={points(history, 'memoryUsedBytes')} />
        <Chart label="/data" points={points(history, 'dataUsedBytes')} />
      </div>
    </section>
  );
}
