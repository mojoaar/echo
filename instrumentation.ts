export async function register() {
  const { createReaders } = await import('./lib/geo');
  createReaders();
  if (process.env.NODE_ENV !== 'test' && process.env.ADMIN_TOKEN?.trim()) {
    const { startResourceSampler } = await import('./lib/resources');
    startResourceSampler();
  }
}
