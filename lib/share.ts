export function buildLookupUrl(baseUrl: string, ip: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  url.searchParams.set('ip', ip);
  return url.toString();
}
