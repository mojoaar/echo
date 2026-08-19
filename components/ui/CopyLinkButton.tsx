'use client';
import { useEffect, useRef, useState } from 'react';
import { buildLookupUrl } from '@/lib/share';

type Status = 'idle' | 'copied' | 'failed';

export default function CopyLinkButton({ ip, baseUrl }: { ip: string; baseUrl?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copyLink() {
    try {
      const shareUrl = buildLookupUrl(baseUrl ?? window.location.origin, ip);
      await navigator.clipboard.writeText(shareUrl);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <button className="btn" type="button" onClick={copyLink} aria-live="polite">
      {status === 'copied' ? 'Link copied' : status === 'failed' ? 'Copy link failed' : 'Copy link'}
    </button>
  );
}
