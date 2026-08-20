import { getVersion } from '@/lib/version';

const defaultSiteUrl = 'https://echo.johansen.foo';

export default function SiteFooter() {
  const baseUrl = process.env.APP_URL || defaultSiteUrl;
  const appVersion = getVersion();
  return (
    <footer>
      <p>
        echo — IP + geo lookup. Data via{' '}
        <a href="https://db-ip.com/" target="_blank" rel="noreferrer">
          db-ip
        </a>{' '}
        (CC BY 4.0).
      </p>
      <p>
        <code>curl {baseUrl}/api/ip</code> · <code>curl {baseUrl}/api/json</code> ·{' '}
        <a href="/docs" rel="noreferrer">Docs</a>
      </p>
      <p>
        Built with{' '}
        <span title="Love" aria-hidden="true">❤️</span>{' '}&{' '}
        <span title="AI" aria-hidden="true">🤖</span> by{' '}
        <a href="https://johansen.foo/" target="_blank" rel="noreferrer">
          Morten Johansen
        </a>{' '}
        (
        <a href="https://github.com/mojoaar/echo" target="_blank" rel="noreferrer">
          v{appVersion}
        </a>
        )
      </p>
    </footer>
  );
}
