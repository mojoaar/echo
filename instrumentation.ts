export async function register() {
  const { createReaders } = await import('./lib/geo');
  createReaders();
}