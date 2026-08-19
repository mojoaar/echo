'use client';

import { useState } from 'react';

export type ConnectivityState = 'not_configured' | 'reachable' | 'unreachable' | 'timeout';

export type ConnectivityResult = {
  state: ConnectivityState;
  latencyMs?: number;
};

type ProbeFetch = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok'>>;

const PROBE_TIMEOUT_MS = 2500;

export async function probeConnectivity(
  url: string | undefined,
  timeoutMs = PROBE_TIMEOUT_MS,
  fetchImpl: ProbeFetch = fetch,
): Promise<ConnectivityResult> {
  if (!url) return { state: 'not_configured' };

  const controller = new AbortController();
  const startedAt = performance.now();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    });
    return response.ok
      ? { state: 'reachable', latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) }
      : { state: 'unreachable' };
  } catch {
    return { state: timedOut ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}

type ConnectivitySectionProps = {
  ipv4Url?: string;
  ipv6Url?: string;
};

type ProbeFamily = 'ipv4' | 'ipv6';

type ProbeStatus = ConnectivityResult | { state: 'idle' };

const IDLE_RESULT: ProbeStatus = { state: 'idle' };

export default function ConnectivitySection({ ipv4Url, ipv6Url }: ConnectivitySectionProps) {
  const [results, setResults] = useState<Record<ProbeFamily, ProbeStatus>>({
    ipv4: ipv4Url ? IDLE_RESULT : { state: 'not_configured' },
    ipv6: ipv6Url ? IDLE_RESULT : { state: 'not_configured' },
  });
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  async function runProbes() {
    setLoading(true);
    await Promise.all([
      probeConnectivity(ipv4Url).then((result) => {
        setResults((current) => ({ ...current, ipv4: result }));
      }),
      probeConnectivity(ipv6Url).then((result) => {
        setResults((current) => ({ ...current, ipv6: result }));
      }),
    ]);
    setHasRun(true);
    setLoading(false);
  }

  return (
    <section className="connectivity" aria-labelledby="connectivity-title">
      <div className="connectivity-head">
        <div>
          <h2 className="section-title" id="connectivity-title">Connectivity diagnostic</h2>
          <p className="connectivity-description">
            Browser reachability only. This does not measure or change the IP recorded by the server.
          </p>
        </div>
        <button className="btn" type="button" onClick={runProbes} disabled={loading}>
          {loading ? 'Testing…' : hasRun ? 'Retry connectivity test' : 'Test connectivity'}
        </button>
      </div>
      <div className="connectivity-results" aria-live="polite">
        <ProbeResult family="IPv4" result={results.ipv4} />
        <ProbeResult family="IPv6" result={results.ipv6} />
      </div>
      <p className="connectivity-hint muted">
        Uses separate A-only and AAAA-only probe hosts and sends no lookup request to this app.
      </p>
    </section>
  );
}

function ProbeResult({ family, result }: { family: string; result: ProbeStatus }) {
  let status = 'Not tested';
  if (result.state === 'not_configured') status = 'Not configured';
  if (result.state === 'reachable') status = `Reachable${result.latencyMs == null ? '' : ` · ${result.latencyMs} ms`}`;
  if (result.state === 'unreachable') status = 'Unreachable';
  if (result.state === 'timeout') status = 'Timed out';

  return (
    <div className="connectivity-result">
      <span>{family}</span>
      <strong>{status}</strong>
    </div>
  );
}
