import { createReaders } from './lib/geo';
import { startResourceSampler } from './lib/resources';

export function registerNodeInstrumentation(): void {
  createReaders();
  if (process.env.NODE_ENV !== 'test' && process.env.ADMIN_TOKEN?.trim()) startResourceSampler();
}

registerNodeInstrumentation();
