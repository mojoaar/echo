import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {}
  return '0.0.0';
}