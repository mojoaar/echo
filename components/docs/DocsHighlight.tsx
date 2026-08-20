'use client';
import { useEffect } from 'react';

let highlightPromise: Promise<void> | null = null;

function ensureHighlightJs(): Promise<void> {
  if (window.hljs) return Promise.resolve();
  highlightPromise ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/hljs.css';
    const script = document.createElement('script');
    script.src = '/highlight.min.js';
    let cssLoaded = false;
    let jsLoaded = false;
    const finish = () => {
      if (cssLoaded && jsLoaded) resolve();
    };
    link.onload = () => {
      cssLoaded = true;
      finish();
    };
    link.onerror = () => {
      highlightPromise = null;
      reject(new Error('highlight css failed to load'));
    };
    script.onload = () => {
      jsLoaded = true;
      finish();
    };
    script.onerror = () => {
      highlightPromise = null;
      reject(new Error('highlight failed to load'));
    };
    document.head.appendChild(link);
    document.head.appendChild(script);
  });
  return highlightPromise;
}

declare global {
  interface Window {
    hljs?: { highlightAll: () => void };
  }
}

export default function DocsHighlight() {
  useEffect(() => {
    let cancelled = false;
    ensureHighlightJs()
      .then(() => {
        if (!cancelled && window.hljs) window.hljs.highlightAll();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
