import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getVersion } from '@/lib/version';

describe('getVersion', () => {
  const cwdSpy = vi.spyOn(process, 'cwd');
  const dirs: string[] = [];

  function dirWith(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'ver-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), content);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('reads the version from package.json', () => {
    cwdSpy.mockReturnValue(dirWith('{"version":"1.2.3"}'));
    expect(getVersion()).toBe('1.2.3');
  });

  it('falls back to 0.0.0 when package.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ver-'));
    dirs.push(dir);
    cwdSpy.mockReturnValue(dir);
    expect(getVersion()).toBe('0.0.0');
  });

  it('falls back to 0.0.0 when the version is absent', () => {
    cwdSpy.mockReturnValue(dirWith('{"name":"echo"}'));
    expect(getVersion()).toBe('0.0.0');
  });
});