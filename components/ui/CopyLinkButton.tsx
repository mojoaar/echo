'use client';
import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'copied' | 'failed';

export default function CopyLinkButton({ ip }: { ip: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareUrl = `/?ip=${encodeURIComponent(ip)}`;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copyLink() {
    try {
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
