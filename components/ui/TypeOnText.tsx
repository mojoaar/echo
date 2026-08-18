'use client';

import { useEffect, useRef } from 'react';

const CHAR_INTERVAL_MS = 40;
const CURSOR_HOLD_MS = 3000;

export default function TypeOnText({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (animated.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = text;
      return;
    }
    animated.current = true;

    el.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    cursor.style.height = '1em';
    el.appendChild(cursor);

    let i = 0;
    const timer = window.setInterval(() => {
      if (i < text.length) {
        el.insertBefore(document.createTextNode(text[i]), cursor);
        i += 1;
        return;
      }
      window.clearInterval(timer);
      window.setTimeout(() => cursor.remove(), CURSOR_HOLD_MS);
    }, CHAR_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <h1 className="ip-hero" ref={ref} aria-label={text}>
      {text}
    </h1>
  );
}
