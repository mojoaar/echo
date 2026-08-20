import type { ReactNode } from 'react';
import type { AdminResources, AdminResourceRow } from './types';

type ResourceCardsProps = {
  resources: AdminResources;
  timezone: string;
  error?: string | null;
};

export function bytes(value: number | null): string {
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

function rate(value: number | null): string {
  return value === null ? 'unavailable' : `${bytes(value)}/s`;
}

function currentValue(current: AdminResourceRow | null, key: keyof AdminResourceRow): number | null {
  const result = current?.[key];
  return typeof result === 'number' ? result : null;
}

function memoryDetail(current: AdminResourceRow | null): { used: number | null; limit: number | null } {
  const used = currentValue(current, 'memoryUsedBytes');
  const limit = currentValue(current, 'memoryLimitBytes');
  return { used, limit };
}

function timestamp(value: number, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}

function storageDetail(resources: AdminResources): ReactNode {
  const storage = resources.storage;
  if (!storage) return null;
  const tables = storage.items.filter((item) => item.kind === 'table');
  const indexBytes = storage.items.filter((item) => item.kind === 'index').reduce((sum, item) => sum + item.bytes, 0);
  return (
    <section className="admin-panel" aria-labelledby="storage-heading">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">sqlite file</p>
          <h2 id="storage-heading">Storage</h2>
        </div>
        <p className="admin-note">dbstat breakdown · page size {storage.pageSize.toLocaleString()} B</p>
      </div>
      <div className="admin-resource-grid">
        <div className="admin-resource-card"><span>DB file</span><strong>{bytes(storage.fileBytes)}</strong><small>{storage.pageCount.toLocaleString()} pages</small></div>
        {tables.map((item) => (
          <div className="admin-resource-card" key={item.name}><span>{item.name}</span><strong>{bytes(item.bytes)}</strong><small>{item.pages.toLocaleString()} pages · {item.cells.toLocaleString()} cells</small></div>
        ))}
        {indexBytes > 0 ? (
          <div className="admin-resource-card"><span>Indexes</span><strong>{bytes(indexBytes)}</strong><small>{storage.items.filter((item) => item.kind === 'index').length} indexes</small></div>
        ) : null}
        {storage.freelistCount > 0 ? (
          <div className="admin-resource-card"><span>Reclaimable</span><strong>{bytes(storage.freelistBytes)}</strong><small>{storage.freelistCount.toLocaleString()} free pages</small></div>
        ) : null}
      </div>
    </section>
  );
}

export default function ResourceCards({ resources, timezone, error = null }: ResourceCardsProps) {
  const current = resources.current;
  const cpu = currentValue(current, 'cpuPercent');
  const sampler = resources.sampler;
  const { used: memoryUsed, limit: memoryLimit } = memoryDetail(current);
  const memoryDetailText =
    memoryLimit === null
      ? 'no container memory limit'
      : `of ${bytes(memoryLimit)}${memoryUsed !== null && memoryLimit > 0 ? ` · ${Math.round((memoryUsed / memoryLimit) * 100)}%` : ''}`;
  return (
    <>
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
        <div className="admin-resource-card"><span>Memory</span><strong>{bytes(memoryUsed)}</strong><small>{memoryDetailText}</small></div>
        <div className="admin-resource-card"><span>/data</span><strong>{bytes(currentValue(current, 'dataUsedBytes'))}</strong><small>persistent usage{resources.volumeFreeBytes !== null ? ` · volume free ${bytes(resources.volumeFreeBytes)}` : ''}</small></div>
        <div className="admin-resource-card"><span>DB / WAL / SHM</span><strong>{bytes(currentValue(current, 'databaseBytes'))}</strong><small>{bytes(currentValue(current, 'walBytes'))} / {bytes(currentValue(current, 'shmBytes'))}</small><small>other /data {bytes(currentValue(current, 'otherDataBytes'))}</small></div>
        <div className="admin-resource-card"><span>Rows</span><strong>{value(currentValue(current, 'activityRows'))}</strong><small>activity events</small></div>
        <div className="admin-resource-card"><span>Uptime</span><strong>{current?.uptimeSeconds === null || current?.uptimeSeconds === undefined ? 'unavailable' : `${Math.floor(current.uptimeSeconds / 3600)}h ${Math.floor((current.uptimeSeconds % 3600) / 60)}m`}</strong><small>{current?.imageSizeBytes === null || current?.imageSizeBytes === undefined ? 'image size unavailable' : `image ${bytes(current.imageSizeBytes)}`}</small></div>
        <div className="admin-resource-card"><span>Network</span><strong>↑ {rate(currentValue(current, 'networkIngressBps'))}</strong><small>↓ {rate(currentValue(current, 'networkEgressBps'))} egress · bytes per second</small></div>
      </div>
      <p className="admin-note">Sampler status: {sampler.enabled ? (sampler.running ? 'running' : 'stopped') : 'disabled'}{sampler.lastSuccessTs ? ` · last sample ${timestamp(sampler.lastSuccessTs, timezone)}` : ''}{sampler.lastError ? ` · Last sampler error: ${sampler.lastError}` : ''}</p>
    </section>
    {storageDetail(resources)}
    </>
  );
}
