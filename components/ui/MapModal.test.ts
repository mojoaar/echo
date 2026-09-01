import { describe, expect, it } from 'vitest';
import { tileUrl } from './MapModal';

describe('tileUrl', () => {
  it('builds a dark tile URL without a key param when no key is given', () => {
    expect(tileUrl('dark')).toBe('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');
  });

  it('builds a light tile URL without a key param when no key is given', () => {
    expect(tileUrl('light')).toBe('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');
  });

  it('appends the api key for dark tiles', () => {
    expect(tileUrl('dark', 'secret-key')).toBe(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=secret-key',
    );
  });

  it('appends the api key for light tiles', () => {
    expect(tileUrl('light', 'secret-key')).toBe(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=secret-key',
    );
  });

  it('encodes the api key value', () => {
    expect(tileUrl('dark', 'a b&c=d')).toBe(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=a%20b%26c%3Dd',
    );
  });
});
