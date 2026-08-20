import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminDateRange } from './admin-date';

const originalTz = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('adminDateRange', () => {
  it('uses the first instant of a date when midnight is skipped', () => {
    process.env.TZ = 'America/Sao_Paulo';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2018-11-06T12:00:00.000Z'));

    const range = adminDateRange(new URL('https://echo.test/?from=2018-11-04&to=2018-11-04'), 30);

    expect(range).toEqual({
      from: Date.parse('2018-11-04T03:00:00.000Z'),
      to: Date.parse('2018-11-05T01:59:59.999Z'),
    });
  });
});
