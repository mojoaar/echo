import { describe, expect, it, vi } from 'vitest';
import { probeConnectivity } from './ConnectivitySection';

describe('probeConnectivity', () => {
  it('does not request an unconfigured probe', async () => {
    const fetchImpl = vi.fn();

    await expect(probeConnectivity(undefined, 2500, fetchImpl)).resolves.toEqual({
      state: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a successful CORS probe with browser-measured latency', async () => {
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(137.6);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await expect(probeConnectivity('https://v4.example.test/probe', 2500, fetchImpl)).resolves.toEqual({
      state: 'reachable',
      latencyMs: 38,
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://v4.example.test/probe', expect.objectContaining({
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
      mode: 'cors',
      signal: expect.any(AbortSignal),
    }));
    now.mockRestore();
  });

  it('classifies an aborted probe as a timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<never>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const pending = probeConnectivity('https://v6.example.test/probe', 2500, fetchImpl);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(pending).resolves.toEqual({ state: 'timeout' });
    vi.useRealTimers();
  });

  it('classifies a rejected network request as unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(probeConnectivity('https://v6.example.test/probe', 2500, fetchImpl)).resolves.toEqual({
      state: 'unreachable',
    });
  });

  it('keeps IPv4 and IPv6 probe outcomes independent', async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.includes('v4')
        ? Promise.resolve({ ok: true })
        : Promise.reject(new TypeError('Failed to fetch')),
    );

    await expect(Promise.all([
      probeConnectivity('https://v4.example.test/probe', 2500, fetchImpl),
      probeConnectivity('https://v6.example.test/probe', 2500, fetchImpl),
    ])).resolves.toEqual([
      expect.objectContaining({ state: 'reachable' }),
      { state: 'unreachable' },
    ]);
  });
});
