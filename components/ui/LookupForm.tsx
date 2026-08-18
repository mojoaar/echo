'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isValidIp } from '@/lib/validate';

export default function LookupForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter an IP address.');
      return;
    }
    if (!isValidIp(trimmed)) {
      setError('Enter a valid IPv4 or IPv6 address.');
      return;
    }
    router.push(`/?ip=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="lookup-form">
      <form className="form" onSubmit={submit} role="search">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Look up any IP — e.g. 8.8.8.8 or 2606:4700:4700::1111"
          aria-label="IP address to look up"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn primary" type="submit">Lookup</button>
      </form>
      {error && (
        <p className="form-error" role="alert">{error}</p>
      )}
    </div>
  );
}