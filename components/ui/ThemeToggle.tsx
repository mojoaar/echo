'use client';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const el = document.documentElement;
    const sync = () =>
      setTheme(el.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('echo-theme', next);
    } catch {}
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle light and dark mode">
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}