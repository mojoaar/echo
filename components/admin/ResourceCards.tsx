import type { AdminResources, AdminResourceRow } from './types';

type ResourceCardsProps = {
  resources: AdminResources;
  timezone: string;
  error?: string | null;
};

function bytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let index = -1;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

function value(value: number | null): string {
  return value === null ? 'unavailable' : value.toLocaleString();
}

function currentValue(current: AdminResourceRow | null, key: keyof AdminResourceRow): number | null {
  const result = current?.[key];
  return typeof result === 'number' ? result : null;
}

export default function ResourceCards({ resources, timezone, error = null }: ResourceCardsProps) {
  const current = resources.current;
  const cpu = currentValue(current, 'cpuPercent');
  const sampler = resources.sampler;
  return (
    <section className="admin-panel" aria-labelledby="resources-heading">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">container snapshot</p>
          <h2 id="resources-heading">Resources</h2>
        </div>
        <p className="admin-note">Local time: {current?.localTs ?? 'unavailable'} ({timezone})</p>
      </div>
      {error ? <p className="admin-empty" role="alert">Resource data unavailable: {error}</p> : !current ? <p className="admin-empty">Resource data unavailable</p> : null}
      <div className="admin-resource-grid">
        <div className="admin-resource-card"><span>CPU</span><strong>{cpu === null ? 'unavailable' : `${cpu}%`}</strong><small>{cpu === null ? 'CPU unavailable until the second sample' : 'container CPU'}</small></div>
        <div className="admin-resource-card"><span>Memory</span><strong>{bytes(currentValue(current, 'memoryUsedBytes'))}</strong><small>of {bytes(currentValue(current, 'memoryLimitBytes'))}</small></div>
        <div className="admin-resource-card"><span>/data</span><strong>{bytes(currentValue(current, 'dataUsedBytes'))}</strong><small>persistent usage</small></div>
        <div className="admin-resource-card"><span>DB / WAL / SHM</span><strong>{bytes(currentValue(current, 'databaseBytes'))}</strong><small>{bytes(currentValue(current, 'walBytes'))} / {bytes(currentValue(current, 'shmBytes'))}</small></div>
        <div className="admin-resource-card"><span>Rows</span><strong>{value(currentValue(current, 'lookupRows'))}</strong><small>lookups / {value(currentValue(current, 'activityRows'))} activity</small></div>
        <div className="admin-resource-card"><span>Uptime</span><strong>{current?.uptimeSeconds === null || current?.uptimeSeconds === undefined ? 'unavailable' : `${Math.floor(current.uptimeSeconds / 3600)}h ${Math.floor((current.uptimeSeconds % 3600) / 60)}m`}</strong><small>{current?.imageSizeBytes === null || current?.imageSizeBytes === undefined ? 'image size unavailable' : `image ${bytes(current.imageSizeBytes)}`}</small></div>
      </div>
      <p className="admin-note">Sampler status: {sampler.enabled ? (sampler.running ? 'running' : 'stopped') : 'disabled'}{sampler.lastSuccessTs ? ` · last sample ${new Date(sampler.lastSuccessTs).toISOString()}` : ''}{sampler.lastError ? ` · Last sampler error: ${sampler.lastError}` : ''}</p>
    </section>
  );
}
