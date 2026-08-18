'use client';
import { useState } from 'react';

export default function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="btn" onClick={copy}>
      {copied ? 'Copied' : label}
    </button>
  );
}