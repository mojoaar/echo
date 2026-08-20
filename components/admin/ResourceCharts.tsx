import type { AdminResourceRow } from './types';
import { bytes } from './ResourceCards';

type ChartKey = 'memoryUsedBytes' | 'dataUsedBytes' | 'cpuPercent' | 'networkIngressBps' | 'networkEgressBps';

type ResourceChartsProps = {
  history: AdminResourceRow[];
  timezone: string;
};

function samples(history: AdminResourceRow[], key: ChartKey): Array<{ ts: number; value: number }> {
  return history
    .map((row) => ({ ts: row.ts, value: row[key] }))
    .filter((entry): entry is { ts: number; value: number } => entry.value !== null);
}

function points(history: AdminResourceRow[], key: ChartKey): string {
  const data = samples(history, key);
  if (!data.length) return '';
  const max = Math.max(...data.map((entry) => entry.value), 1);
  return data
    .map((entry, index) => `${(index / Math.max(data.length - 1, 1)) * 100},${40 - (entry.value / max) * 34}`)
    .join(' ');
}

function formatValue(key: ChartKey, value: number): string {
  if (key === 'cpuPercent') return `${value}%`;
  if (key === 'networkIngressBps' || key === 'networkEgressBps') return `${bytes(value)}/s`;
  return bytes(value);
}

function summary(history: AdminResourceRow[], key: ChartKey): string {
  const data = samples(history, key);
  if (!data.length) return 'no samples';
  const values = data.map((entry) => entry.value);
  return `now ${formatValue(key, values[values.length - 1])} · peak ${formatValue(key, Math.max(...values))} · min ${formatValue(key, Math.min(...values))}`;
}

function axisBounds(history: AdminResourceRow[], key: ChartKey): { top: string; bottom: string } {
  const data = samples(history, key);
  if (!data.length) return { top: '', bottom: '' };
  const values = data.map((entry) => entry.value);
  return { top: formatValue(key, Math.max(...values)), bottom: formatValue(key, Math.min(...values)) };
}

function timestamp(value: number, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function Chart({ label, chartPoints, legend, yTop, yBottom, xStart, xEnd }: { label: string; chartPoints: string; legend: string; yTop: string; yBottom: string; xStart: string; xEnd: string }) {
  return (
    <div className="admin-chart">
      <div className="admin-chart-label">{label}</div>
      <div className="admin-chart-summary">{legend}</div>
      <div className="admin-chart-plot">
        <div className="admin-chart-y" aria-hidden="true"><span>{yTop}</span><span>{yBottom}</span></div>
        <div className="admin-chart-body">
          {chartPoints ? <svg viewBox="0 0 100 40" role="img" aria-label={`${label} history`} preserveAspectRatio="none"><polyline points={chartPoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg> : <p className="admin-empty">No samples available.</p>}
        </div>
      </div>
      <div className="admin-chart-x" aria-hidden="true"><span>{xStart}</span><span>{xEnd}</span></div>
    </div>
  );
}

export default function ResourceCharts({ history, timezone }: ResourceChartsProps) {
  const firstTs = history.length ? history[0].ts : null;
  const lastTs = history.length ? history[history.length - 1].ts : null;
  const memory = axisBounds(history, 'memoryUsedBytes');
  const data = axisBounds(history, 'dataUsedBytes');
  const cpu = axisBounds(history, 'cpuPercent');
  const networkIngress = axisBounds(history, 'networkIngressBps');
  const networkEgress = axisBounds(history, 'networkEgressBps');
  const xStart = firstTs !== null ? timestamp(firstTs, timezone) : '';
  const xEnd = lastTs !== null ? timestamp(lastTs, timezone) : '';
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
        <Chart label="Memory" chartPoints={points(history, 'memoryUsedBytes')} legend={summary(history, 'memoryUsedBytes')} yTop={memory.top} yBottom={memory.bottom} xStart={xStart} xEnd={xEnd} />
        <Chart label="/data" chartPoints={points(history, 'dataUsedBytes')} legend={summary(history, 'dataUsedBytes')} yTop={data.top} yBottom={data.bottom} xStart={xStart} xEnd={xEnd} />
        <Chart label="CPU" chartPoints={points(history, 'cpuPercent')} legend={summary(history, 'cpuPercent')} yTop={cpu.top} yBottom={cpu.bottom} xStart={xStart} xEnd={xEnd} />
        <Chart label="Network ingress" chartPoints={points(history, 'networkIngressBps')} legend={summary(history, 'networkIngressBps')} yTop={networkIngress.top} yBottom={networkIngress.bottom} xStart={xStart} xEnd={xEnd} />
        <Chart label="Network egress" chartPoints={points(history, 'networkEgressBps')} legend={summary(history, 'networkEgressBps')} yTop={networkEgress.top} yBottom={networkEgress.bottom} xStart={xStart} xEnd={xEnd} />
      </div>
    </section>
  );
}
