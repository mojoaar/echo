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
    script.onerror = () => reject(new Error('leaflet failed to load'));
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

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
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
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [lat, lon]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{lat.toFixed(4)}, {lon.toFixed(4)}</span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div ref={ref} className="modal-map" />
        <div className="modal-note">Approximate location based on IP address — city-level precision.</div>
      </div>
    </div>
  );
}