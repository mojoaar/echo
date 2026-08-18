import type { MetadataRoute } from 'next';

const siteUrl = process.env.APP_URL ?? 'https://echo.johansen.foo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}