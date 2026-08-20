import { beforeEach, describe, expect, it, vi } from 'vitest';

const createReaders = vi.fn();
const startResourceSampler = vi.fn();

vi.mock('./lib/geo', () => ({ createReaders }));
vi.mock('./lib/resources', () => ({ startResourceSampler }));

describe('instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.ADMIN_TOKEN;
  });

  it('always warms MMDB readers and does not sample when disabled', async () => {
    const { register } = await import('./instrumentation');

    await register();

    expect(createReaders).toHaveBeenCalledOnce();
    expect(startResourceSampler).not.toHaveBeenCalled();
  });

  it('does not start sampling in tests even when ADMIN_TOKEN is configured', async () => {
    process.env.ADMIN_TOKEN = 'configured';
    const { register } = await import('./instrumentation');

    await register();

    expect(createReaders).toHaveBeenCalledOnce();
    expect(startResourceSampler).not.toHaveBeenCalled();
  });
});
