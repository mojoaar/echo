import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = process.env.APP_URL ?? 'https://echo.johansen.foo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'echo | what the internet sees when you connect',
    description:
      'See your IP address, location, ISP and more. Echo shows you exactly what the internet sees when you connect.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiUrl = process.env.UMAMI_SCRIPT_URL;
  const umamiId = process.env.UMAMI_WEBSITE_ID;
  return (
    <html lang="en" data-theme="dark" className={jetbrains.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {umamiUrl && umamiId ? (
          <script src={umamiUrl} defer data-website-id={umamiId} />
        ) : null}
      </head>
      <body className="font-mono">{children}</body>
    </html>
  );
}