'use client';
import { useEffect, useRef, useState } from 'react';

let leafletPromise: Promise<void> | null = null;

type Leaflet = {
  map: (el: HTMLElement, opts: Record<string, unknown>) => { setView: (c: [number, number], z: number) => unknown; remove: () => void };
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (map: unknown) => unknown };
  marker: (c: [number, number]) => { addTo: (map: unknown) => { bindPopup: (t: string) => { openPopup: () => unknown } } };
};

declare global {
  interface Window {
    L?: Leaflet;
  }
}

function ensureLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  leafletPromise ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('leaflet failed to load'));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function tileTheme(): string {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

export function MapTrigger({ lat, lon }: { lat: number; lon: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Open map</button>
      {open && <MapModal lat={lat} lon={lon} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function MapModal({ lat, lon, onClose }: { lat: number; lon: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    setMapError(false);
    ensureLeaflet()
      .then(() => {
        if (cancelled || !ref.current || !window.L) return;
        const L = window.L;
        map = L.map(ref.current, { scrollWheelZoom: false }).setView([lat, lon], 11) as unknown as { remove: () => void };
        L.tileLayer(tileTheme(), {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);
        L.marker([lat, lon]).addTo(map).bindPopup(`${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      });
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [lat, lon]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      prevFocus?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="map-modal-title" onClick={onClose}>
      <div ref={dialogRef} className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span id="map-modal-title">{lat.toFixed(4)}, {lon.toFixed(4)}</span>
          <button ref={closeRef} className="btn" onClick={onClose}>Close</button>
        </div>
        {mapError ? (
          <div className="modal-map" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Failed to load map</div>
        ) : (
          <div ref={ref} className="modal-map" />
        )}
        <div className="modal-note">Approximate location based on IP address — city-level precision.</div>
      </div>
    </div>
  );
}