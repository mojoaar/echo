'use client';

import { useState } from 'react';

export default function AdminLogin() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: String(form.get('token') ?? '') }),
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setError('Invalid admin token.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Unable to sign in right now.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-login shell">
      <section className="admin-login-card card">
        <p className="admin-kicker">echo / private</p>
        <h1>Admin access</h1>
        <p className="muted">Sign in to view activity and container resources.</p>
        <form className="admin-form" onSubmit={submit}>
          <label htmlFor="admin-token">Admin token</label>
          <input id="admin-token" name="token" type="password" autoComplete="current-password" required />
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
