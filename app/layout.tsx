import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import PwaRegister from '@/components/ui/PwaRegister';

const siteUrl = process.env.APP_URL || 'https://echo.johansen.foo';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1117',
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'echo | what the internet sees when you connect',
    description:
      'See your IP address, location, ISP and more, with an on-demand browser connectivity diagnostic.',
    applicationName: 'echo',
    metadataBase: new URL(siteUrl),
    openGraph: {
      title: 'echo',
      description: 'What the internet sees when you connect.',
      type: 'website',
      url: siteUrl,
    },
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
  };
}

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const THEME_INIT = `(function(){try{var t=localStorage.getItem('echo-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiUrl = process.env.UMAMI_SCRIPT_URL;
  const umamiId = process.env.UMAMI_WEBSITE_ID;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" data-theme="dark" className={jetbrains.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="echo" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {umamiUrl && umamiId ? (
          <script src={umamiUrl} defer data-website-id={umamiId} />
        ) : null}
      </head>
      <body className="font-mono">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
