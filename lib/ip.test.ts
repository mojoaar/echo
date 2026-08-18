import { describe, it, expect } from 'vitest';
import { extractVisitorIp, normalizeIp, classifyIp, isPublicIp } from './ip';

describe('extractVisitorIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(extractVisitorIp(headers)).toBe('203.0.113.7');
  });
  it('handles a single entry without a comma', () => {
    const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
    expect(extractVisitorIp(headers)).toBe('8.8.8.8');
  });
  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.4' });
    expect(extractVisitorIp(headers)).toBe('198.51.100.4');
  });
  it('returns null when no usable header exists', () => {
    expect(extractVisitorIp(new Headers())).toBeNull();
  });
  it('rejects garbage values', () => {
    const headers = new Headers({ 'x-forwarded-for': 'not-an-ip' });
    expect(extractVisitorIp(headers)).toBeNull();
  });
});

describe('normalizeIp', () => {
  it('converts IPv6-mapped IPv4 to plain IPv4', () => {
    expect(normalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIp('::FFFF:8.8.8.8')).toBe('8.8.8.8');
  });
  it('lowercases IPv6 addresses', () => {
    expect(normalizeIp('2001:0DB8::1')).toBe('2001:0db8::1');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeIp(' 1.2.3.4 ')).toBe('1.2.3.4');
  });
});

describe('classifyIp', () => {
  it('detects loopback', () => {
    expect(classifyIp('127.0.0.1')).toBe('loopback');
    expect(classifyIp('::1')).toBe('loopback');
  });
  it('detects RFC1918 private ranges', () => {
    expect(classifyIp('10.1.2.3')).toBe('private');
    expect(classifyIp('172.16.0.1')).toBe('private');
    expect(classifyIp('172.31.255.255')).toBe('private');
    expect(classifyIp('192.168.0.1')).toBe('private');
    expect(classifyIp('fc00::1')).toBe('private');
    expect(classifyIp('fd12:3456::1')).toBe('private');
  });
  it('does not treat 172.32.x as private', () => {
    expect(classifyIp('172.32.0.1')).toBe('public');
  });
  it('detects link-local', () => {
    expect(classifyIp('169.254.10.1')).toBe('linklocal');
    expect(classifyIp('fe80::1')).toBe('linklocal');
  });
  it('treats public addresses as public', () => {
    expect(classifyIp('8.8.8.8')).toBe('public');
    expect(classifyIp('2001:4860:4860::8888')).toBe('public');
  });
  it('treats CGNAT and reserved ranges as private/reserved', () => {
    expect(classifyIp('100.64.0.1')).toBe('private');
    expect(classifyIp('224.0.0.1')).toBe('reserved');
  });
});

describe('isPublicIp', () => {
  it('returns true only for publicly routable addresses', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('192.168.1.1')).toBe(false);
    expect(isPublicIp('junk')).toBe(false);
  });
});