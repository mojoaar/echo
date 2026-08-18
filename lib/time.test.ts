import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './time';

afterEach(() => {
  vi.useRealTimers();
});

describe('relativeTime', () => {
  it('renders seconds, minutes, hours and days', () => {
    vi.setSystemTime(new Date('2026-08-18T00:00:00Z'));
    expect(relativeTime(Date.now() - 3_000)).toBe('just now');
    expect(relativeTime(Date.now() - 40_000)).toBe('40s ago');
    expect(relativeTime(Date.now() - 12 * 60_000)).toBe('12m ago');
    expect(relativeTime(Date.now() - 3 * 3_600_000)).toBe('3h ago');
    expect(relativeTime(Date.now() - 5 * 86_400_000)).toBe('5d ago');
  });
});
