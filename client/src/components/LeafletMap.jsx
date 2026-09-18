// Plain-Leaflet map (not react-leaflet) — this app already has a "keyless mapping" convention
// (utils.js's mapLinks/mapLinksForCoords, which just build Google Maps URLs with no API key), and
// Leaflet + OpenStreetMap tiles keeps an embedded map in that same spirit: no key, no billing, no
// third-party account for the user to sign up for. Built imperatively with the raw `leaflet`
// package instead of react-leaflet to avoid a second library's version/API surface — this
// component is the entire integration surface, so any Leaflet API change only has one call site
// to update.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default Leaflet marker images are PNGs resolved relative to the CSS file's own path, which
// doesn't survive a Vite bundle — every marker silently renders as a broken image. Sidestepping
// entirely: markers are colored divIcon circles built from CSS already in styles.css, not images.
function makeIcon(color) {
  return L.divIcon({
    className: 'leaflet-vehicle-icon',
    html: `<span class="vehicle-pin" style="--pin-color: ${color || 'var(--accent)'}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

// Continental-US fallback view for an empty map (no vehicles have ever checked in yet).
const FALLBACK_CENTER = [39.5, -98.35];
const FALLBACK_ZOOM = 4;

export default function LeafletMap({ markers = [], height = 320 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Create the map once per mount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw markers and refit whenever the marker list changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const pts = markers.filter((m) => m.lat != null && m.lng != null);
    if (pts.length === 0) {
      map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
      return;
    }

    pts.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: makeIcon(m.color) }).addTo(layer);
      if (m.popupHtml) marker.bindPopup(m.popupHtml);
    });

    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 14);
    } else {
      map.fitBounds(L.latLngBounds(pts.map((m) => [m.lat, m.lng])), { padding: [32, 32], maxZoom: 15 });
    }
  }, [markers]);

  return <div ref={containerRef} style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line-soft)' }} />;
}
