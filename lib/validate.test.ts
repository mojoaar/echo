import { describe, it, expect } from 'vitest';
import { isValidIpv4, isValidIpv6, isValidIp } from './validate';

describe('isValidIpv4', () => {
  it('accepts valid dotted-quad addresses', () => {
    expect(isValidIpv4('8.8.8.8')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
  });
  it('rejects out-of-range and malformed input', () => {
    expect(isValidIpv4('999.1.1.1')).toBe(false);
    expect(isValidIpv4('1.2.3')).toBe(false);
    expect(isValidIpv4('1.2.3.4.5')).toBe(false);
    expect(isValidIpv4('nope')).toBe(false);
  });
});

describe('isValidIpv6', () => {
  it('accepts common forms', () => {
    expect(isValidIpv6('2001:db8::1')).toBe(true);
    expect(isValidIpv6('2001:db8:0:0:0:0:0:1')).toBe(true);
    expect(isValidIpv6('::')).toBe(true);
    expect(isValidIpv6('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isValidIpv6('2001:::1')).toBe(false);
    expect(isValidIpv6('1::2::3')).toBe(false);
    expect(isValidIpv6('12345::1')).toBe(false);
    expect(isValidIpv6('2001:db8')).toBe(false);
  });
});

describe('isValidIp', () => {
  it('accepts v4 and v6, rejects everything else', () => {
    expect(isValidIp('8.8.8.8')).toBe(true);
    expect(isValidIp('2001:db8::1')).toBe(true);
    expect(isValidIp('not-an-ip')).toBe(false);
    expect(isValidIp('')).toBe(false);
  });
});