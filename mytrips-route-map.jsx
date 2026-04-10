// Synced from vite-scaffold/src/lib (canonical)
const React = window.React;

// My Trips route overview map (Leaflet). Expects global L from leaflet.

/** Match js/gantt-timeline.jsx SEGMENT_COLORS (bar stroke for map lines). */
const SEGMENT_COLORS = [
  { bar: '#3b82f6', border: '#1d4ed8' },
  { bar: '#10b981', border: '#047857' },
  { bar: '#f59e0b', border: '#b45309' },
  { bar: '#8b5cf6', border: '#6d28d9' },
  { bar: '#ef4444', border: '#b91c1c' },
  { bar: '#06b6d4', border: '#0e7490' },
  { bar: '#ec4899', border: '#be185d' },
  { bar: '#84cc16', border: '#4d7c0f' },
];

const SELECTED_LINE_COLOR = '#fbbf24';

/** IATA for lookup: trim, uppercase, then first token (handles legacy "YYZ — City" in stored trips). */
function normalizeRouteMapIata(v) {
  if (v == null || v === '') return '';
  const upper = String(v).trim().toUpperCase();
  if (!upper) return '';
  const token = upper.split(/[\s—–·|]+/)[0] || upper;
  return token.replace(/[^A-Z0-9]/g, '') || '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function segmentLayerKey(segId) {
  return segId != null && segId !== '' ? String(segId) : '';
}

function getSegmentColorForIndex(idx) {
  const n = SEGMENT_COLORS.length;
  const i = ((Number(idx) % n) + n) % n;
  return SEGMENT_COLORS[i].bar;
}

function calculateGreatCircleMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function greatCircleLatLngPath(lat1, lon1, lat2, lon2, steps) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const φ1 = lat1 * toRad;
  const λ1 = lon1 * toRad;
  const φ2 = lat2 * toRad;
  const λ2 = lon2 * toRad;
  const cosD = Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const d = Math.acos(Math.min(1, Math.max(-1, cosD)));
  if (!Number.isFinite(d) || d < 1e-10) return [[lat1, lon1], [lat2, lon2]];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.hypot(x, y));
    const λ = Math.atan2(y, x);
    out.push([φ * toDeg, λ * toDeg]);
  }
  return out;
}

/** Keep longitude deltas between consecutive points within ±180° so the path doesn’t jump across the map. */
function unwrapLngPath(points) {
  if (!points || points.length < 2) return points;
  const out = points.map((p) => [p[0], p[1]]);
  for (let i = 1; i < out.length; i++) {
    let lon = out[i][1];
    const prev = out[i - 1][1];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out[i][1] = lon;
  }
  return out;
}

function buildGreatCirclePolyline(latlngPairs) {
  const all = [];
  for (let i = 0; i < latlngPairs.length - 1; i++) {
    const a = latlngPairs[i];
    const b = latlngPairs[i + 1];
    const mi = calculateGreatCircleMiles(a[0], a[1], b[0], b[1]);
    const steps = Math.min(128, Math.max(20, Math.round((mi || 400) / 22)));
    const seg = greatCircleLatLngPath(a[0], a[1], b[0], b[1], steps);
    if (i === 0) all.push(...seg);
    else all.push(...seg.slice(1));
  }
  return unwrapLngPath(all);
}

function installBaseTiles(map, basemap) {
  if (basemap === 'satellite') {
    return L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19,
      },
    ).addTo(map);
  }
  const useDark = basemap === 'dark';
  const url = useDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  return L.tileLayer(url, {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);
}

function readBasemapPreference() {
  try {
    const v = localStorage.getItem('mytrips_map_basemap_v1');
    if (v === 'satellite' || v === 'dark' || v === 'light') return v;
    if (v === 'map') return 'light';
    return 'satellite';
  } catch (_) {
    return 'satellite';
  }
}

function fitRouteToMap(map, latlngPairs) {
  if (!map || !latlngPairs || latlngPairs.length === 0) return;
  const pts = latlngPairs.map((p) => (Array.isArray(p) ? L.latLng(p[0], p[1]) : p));
  if (pts.length === 1) {
    map.setView(pts[0], 9, { animate: false });
    return;
  }
  const b = L.latLngBounds(pts);
  try {
    const padded = b.pad(0.12);
    map.fitBounds(padded, {
      padding: [24, 24],
      maxZoom: 12,
      animate: false,
    });
  } catch (_) {
    map.fitBounds(b, { padding: [24, 24], maxZoom: 12, animate: false });
  }
}

function fitSegmentOnMap(map, featureGroup) {
  if (!map || !featureGroup || typeof featureGroup.getBounds !== 'function') return;
  try {
    const b = featureGroup.getBounds();
    if (!b || !b.isValid()) return;
    map.fitBounds(b.pad(0.2), { padding: [48, 48], maxZoom: 8, animate: true });
  } catch (_) {}
}

/** Airport rows may use lat/lon or latitude/longitude (strings from JSON ok). */
function pickAirportLatLon(ap) {
  if (!ap || typeof ap !== 'object') return null;
  const rawLat = ap.lat != null ? ap.lat : ap.latitude;
  const rawLon = ap.lon != null ? ap.lon : ap.longitude;
  if (rawLat == null || rawLon == null) return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function MyTripsRouteMap({ trip, tripName, airports, darkMode, t, totalMiles }) {
  const mapElRef = React.useRef(null);
  const mapInstRef = React.useRef(null);
  const tileLayerRef = React.useRef(null);
  const segLayersRef = React.useRef({});
  const segBaseColorsRef = React.useRef({});
  const airportMarkersRef = React.useRef([]);
  const fsWrapRef = React.useRef(null);
  const resizeTimerRef = React.useRef(null);
  const mapResizeObserverRef = React.useRef(null);
  const panTimelineSelectRef = React.useRef(false);
  const [basemap, setBasemap] = React.useState(readBasemapPreference);
  const [fsActive, setFsActive] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);
  const [tileDegraded, setTileDegraded] = React.useState(false);
  const [selectedSegId, setSelectedSegId] = React.useState(null);

  React.useEffect(() => {
    try {
      localStorage.setItem('mytrips_map_basemap_v1', basemap);
    } catch (_) {}
  }, [basemap]);

  const routePoints = React.useMemo(() => {
    const codes = [];
    for (const s of trip.segments || []) {
      const o = normalizeRouteMapIata(s.origin);
      const d = normalizeRouteMapIata(s.destination);
      if (!o && !d) continue;
      if (codes.length === 0 || codes[codes.length - 1] !== o) codes.push(o);
      if (d && d !== codes[codes.length - 1]) codes.push(d);
    }
    return codes.filter(Boolean);
  }, [trip.segments]);

  /** Re-run Leaflet init when coords for route airports appear (async airport DB / merge). */
  const routeAirportCoordKey = React.useMemo(
    () =>
      routePoints
        .map((code) => {
          const ll = pickAirportLatLon(airports[code]);
          if (!ll) return `${code}:`;
          return `${code}:${ll.lat},${ll.lon}`;
        })
        .join('|'),
    [routePoints, airports],
  );

  const drawableLegs = React.useMemo(() => {
    const list = [];
    (trip.segments || []).forEach((s, idx) => {
      const o = normalizeRouteMapIata(s.origin);
      const d = normalizeRouteMapIata(s.destination);
      if (!segmentLayerKey(s.id) || !o || !d) return;
      const ao = pickAirportLatLon(airports[o]);
      const ad = pickAirportLatLon(airports[d]);
      if (!ao || !ad) return;
      list.push({
        seg: s,
        legIndex: list.length + 1,
        segOrderIdx: idx,
        o,
        d,
        label: `${o} → ${d}`,
      });
    });
    return list;
  }, [trip.segments, airports]);

  const printLegLines = React.useMemo(() => {
    return drawableLegs.map((leg) => `${leg.legIndex}. ${leg.label}`).join('\n');
  }, [drawableLegs]);

  const segmentLegCount = (trip.segments || []).filter(
    (s) => normalizeRouteMapIata(s.origin) && normalizeRouteMapIata(s.destination),
  ).length;

  const selectedSegIdRef = React.useRef(null);
  selectedSegIdRef.current = selectedSegId;

  const applySegStyles = React.useCallback(() => {
    const sel = selectedSegIdRef.current;
    const layers = segLayersRef.current || {};
    const bases = segBaseColorsRef.current || {};
    const style = (on, base) => ({
      color: on ? SELECTED_LINE_COLOR : base,
      weight: on ? 4 : 2.5,
      opacity: on ? 1 : 0.92,
      lineJoin: 'round',
      lineCap: 'round',
    });
    for (const id of Object.keys(layers)) {
      const layer = layers[id];
      if (!layer) continue;
      const on = sel != null && String(sel) === String(id);
      const base = bases[id] || '#3b82f6';
      const st = style(on, base);
      if (typeof layer.setStyle === 'function') {
        try {
          layer.setStyle(st);
        } catch (_) {}
      } else if (typeof layer.eachLayer === 'function') {
        layer.eachLayer((ln) => {
          if (!ln || typeof ln.setStyle !== 'function') return;
          try {
            ln.setStyle(st);
          } catch (_) {}
        });
      }
    }
  }, []);

  React.useEffect(() => {
    applySegStyles();
  }, [selectedSegId, applySegStyles]);

  React.useEffect(() => {
    const onSel = (e) => {
      const detail = e && e.detail;
      const source = detail ? detail.source : undefined;
      if (source !== 'timeline') return;
      const segId = detail ? detail.segId : undefined;
      setSelectedSegId(segId != null && segId !== '' ? String(segId) : null);
      panTimelineSelectRef.current = true;
    };
    window.addEventListener('mytrips:segselect', onSel);
    return () => window.removeEventListener('mytrips:segselect', onSel);
  }, []);

  React.useEffect(() => {
    if (!mapReady || !selectedSegId || !panTimelineSelectRef.current) return;
    panTimelineSelectRef.current = false;
    const map = mapInstRef.current;
    const fg = segLayersRef.current[String(selectedSegId)];
    if (map && fg) fitSegmentOnMap(map, fg);
  }, [selectedSegId, mapReady, trip.id]);

  React.useEffect(() => {
    const onFs = () => setFsActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  React.useEffect(() => {
    const onResize = () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        if (mapInstRef.current) mapInstRef.current.invalidateSize();
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    const m = mapInstRef.current;
    if (!m) return;
    const id = window.setTimeout(() => {
      m.invalidateSize();
      try {
        const ll = routePoints
          .map((code) => {
            const pos = pickAirportLatLon(airports[code]);
            return pos ? L.latLng(pos.lat, pos.lon) : null;
          })
          .filter(Boolean);
        if (ll.length) fitRouteToMap(m, ll);
      } catch (_) {}
    }, 120);
    return () => window.clearTimeout(id);
  }, [fsActive, routePoints.join('|')]);

  React.useEffect(() => {
    if (typeof L === 'undefined') return;
    const map = mapInstRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    tileLayerRef.current = installBaseTiles(map, basemap);
    if (tileLayerRef.current && typeof tileLayerRef.current.on === 'function') {
      tileLayerRef.current.on('tileerror', () => setTileDegraded(true));
    }
  }, [basemap]);

  React.useEffect(() => {
    if (typeof L === 'undefined') return;
    if (!mapElRef.current || routePoints.length === 0) return;
    setMapReady(false);
    setTileDegraded(false);
    segBaseColorsRef.current = {};
    const latlngs = routePoints
      .map((code) => {
        const pos = pickAirportLatLon(airports[code]);
        return pos ? [pos.lat, pos.lon] : null;
      })
      .filter(Boolean);
    if (latlngs.length === 0) return;

    if (mapInstRef.current) {
      tileLayerRef.current = null;
      mapInstRef.current.remove();
      mapInstRef.current = null;
    }

    const map = L.map(mapElRef.current, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: false,
      preferCanvas: true,
    });
    mapInstRef.current = map;
    tileLayerRef.current = installBaseTiles(map, basemap);
    const onTileError = () => setTileDegraded(true);
    if (tileLayerRef.current && typeof tileLayerRef.current.on === 'function') {
      tileLayerRef.current.on('tileerror', onTileError);
    }
    map.whenReady(() => setMapReady(true));

    segLayersRef.current = {};
    (trip.segments || []).forEach((s, idx) => {
      const o = normalizeRouteMapIata(s.origin);
      const d = normalizeRouteMapIata(s.destination);
      const ao = pickAirportLatLon(airports[o]);
      const ad = pickAirportLatLon(airports[d]);
      const sid = segmentLayerKey(s.id);
      if (!sid || !ao || !ad) return;
      const baseColor = getSegmentColorForIndex(idx);
      segBaseColorsRef.current[sid] = baseColor;
      const pts = [[ao.lat, ao.lon], [ad.lat, ad.lon]];
      const gc = buildGreatCirclePolyline(pts);
      const pathLatLngs = gc && gc.length >= 2 ? gc : pts;
      const lineStyle = {
        color: baseColor,
        weight: 3,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: true,
      };
      const ln = L.polyline(pathLatLngs, lineStyle);
      ln.on('click', () => {
        try {
          window.dispatchEvent(new CustomEvent('mytrips:segselect', { detail: { segId: s.id, source: 'map' } }));
        } catch (_) {}
        setSelectedSegId(sid);
      });
      ln.addTo(map);
      segLayersRef.current[sid] = ln;
    });
    applySegStyles();

    airportMarkersRef.current = [];
    routePoints.forEach((code) => {
      const apRow = airports[code];
      const pos = pickAirportLatLon(apRow);
      if (!pos) return;
      const city = apRow && apRow.city ? String(apRow.city) : '';
      const title = city ? `${code} — ${city}` : code;
      const icon = L.divIcon({
        className: 'mytrips-map-code-pin',
        html: `<div class="mytrips-map-code-pin__lbl">${escapeHtml(code)}</div>`,
        iconSize: [42, 24],
        iconAnchor: [21, 12],
      });
      const mk = L.marker([pos.lat, pos.lon], { icon, interactive: true, keyboard: true, title });
      mk.addTo(map);
      airportMarkersRef.current.push(mk);
    });

    const updateLabelVisibility = () => {
      try {
        const z = map.getZoom();
        const hide = z < 4;
        const el = map.getContainer();
        if (el) el.classList.toggle('mytrips-map-hide-labels', hide);
      } catch (_) {}
    };
    map.on('zoomend', updateLabelVisibility);
    updateLabelVisibility();

    fitRouteToMap(map, latlngs);
    window.setTimeout(() => fitRouteToMap(map, latlngs), 120);

    const bumpSize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch (_) {}
    };
    requestAnimationFrame(bumpSize);
    const t1 = window.setTimeout(bumpSize, 50);
    const t2 = window.setTimeout(bumpSize, 200);
    const t3 = window.setTimeout(bumpSize, 500);

    if (typeof ResizeObserver !== 'undefined' && mapElRef.current) {
      mapResizeObserverRef.current = new ResizeObserver(() => {
        requestAnimationFrame(bumpSize);
      });
      mapResizeObserverRef.current.observe(mapElRef.current);
    }

    const layerForCleanup = tileLayerRef.current;

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (mapResizeObserverRef.current) {
        try {
          mapResizeObserverRef.current.disconnect();
        } catch (_) {}
        mapResizeObserverRef.current = null;
      }
      if (layerForCleanup && typeof layerForCleanup.off === 'function') {
        try {
          layerForCleanup.off('tileerror', onTileError);
        } catch (_) {}
      }
      tileLayerRef.current = null;
      if (mapInstRef.current) {
        mapInstRef.current.remove();
        mapInstRef.current = null;
      }
    };
  }, [trip.id, routePoints.join('|'), routeAirportCoordKey]);

  const selectLegFromPanel = React.useCallback((segId) => {
    setSelectedSegId(segId != null && segId !== '' ? String(segId) : null);
    try {
      window.dispatchEvent(new CustomEvent('mytrips:segselect', { detail: { segId, source: 'map' } }));
    } catch (_) {}
    const map = mapInstRef.current;
    const fg = segLayersRef.current[String(segId)];
    if (map && fg) fitSegmentOnMap(map, fg);
  }, []);

  const toggleFullscreen = () => {
    const el = fsWrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  };

  if (routePoints.length === 0) {
    return (
      <div
        className={`rounded-xl border flex items-center justify-center min-h-[200px] px-4 text-center text-[10px] font-bold uppercase tracking-widest leading-relaxed ${darkMode ? 'bg-slate-800/50 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
      >
        {t('mytrips_map_no_airports')}
      </div>
    );
  }

  const hasCoords = routePoints.some((code) => !!pickAirportLatLon(airports[code]));
  if (!hasCoords) {
    return (
      <div
        className={`rounded-xl border flex items-center justify-center min-h-[200px] px-4 text-center text-[10px] font-bold uppercase tracking-widest leading-relaxed ${darkMode ? 'bg-slate-800/50 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
      >
        {t('mytrips_map_no_coords')}
      </div>
    );
  }

  if (typeof L === 'undefined') {
    return (
      <div
        className={`rounded-xl border flex items-center justify-center min-h-[200px] px-4 text-center text-[10px] font-bold uppercase tracking-widest leading-relaxed ${darkMode ? 'bg-slate-800/50 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
      >
        {t('mytrips_map_leaflet_missing')}
      </div>
    );
  }

  const segLabel =
    segmentLegCount === 1 ? `1 ${t('mytrips_segment')}` : `${segmentLegCount} ${t('mytrips_segments')}`;
  const mid = t('mytrips_map_stats_mid');
  const milesUnit = t('mytrips_map_miles_unit');
  const milesPart =
    totalMiles != null && totalMiles > 0
      ? `${mid}${Math.round(totalMiles).toLocaleString()}\u00a0${milesUnit}`
      : '';

  const barBg = darkMode ? 'bg-[#0c1525] border-slate-700/80' : 'bg-slate-100 border-slate-200';
  const teal = '#2dd4bf';
  const ringOff = darkMode ? 'focus-visible:ring-offset-[#0c1525]' : 'focus-visible:ring-offset-white';
  const btnBase = `inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-2.5 py-2 sm:py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/80 focus-visible:ring-offset-2 ${ringOff}`;
  const btnActive = darkMode ? 'bg-slate-800 text-white border-teal-400' : 'bg-slate-200 text-[#152C53] border-teal-500';
  const btnIdle = darkMode ? 'text-slate-500 border-transparent' : 'text-slate-500 border-transparent';

  const legBtnBase = `text-left rounded-lg border px-2.5 py-1.5 min-h-[44px] sm:min-h-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/80 focus-visible:ring-offset-2 ${ringOff}`;

  return (
    <div
      ref={fsWrapRef}
      className={`mytrips-route-map h-full min-h-0 rounded-xl overflow-hidden border flex flex-col shadow-xl ${darkMode ? 'border-slate-600 bg-[#0a0f18]' : 'mytrips-route-map--light border-slate-200 bg-white'}`}
    >
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b ${barBg}`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5 text-[#FFC136]" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17l4-4 4 4 4-8 6 6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17" cy="7" r="2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] mb-0.5" style={{ color: teal }}>
              {t('mytrips_map_route_overview')}
            </div>
            <div className={`text-sm sm:text-base font-black truncate ${darkMode ? 'text-white' : 'text-[#152C53]'}`}>
              {tripName || trip.name || '—'}
            </div>
            <div className={`text-[11px] font-semibold mt-0.5 tabular-nums ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {segLabel}
              {milesPart}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label={t('mytrips_map_basemap_group_label')}
            className={`inline-flex rounded-lg p-0.5 border ${darkMode ? 'bg-slate-900/80 border-slate-600' : 'bg-white border-slate-200'}`}
          >
            <button
              type="button"
              aria-pressed={basemap === 'light'}
              onClick={() => setBasemap('light')}
              className={`${btnBase} ${basemap === 'light' ? btnActive : btnIdle}`}
            >
              {t('mytrips_map_mode_light')}
            </button>
            <button
              type="button"
              aria-pressed={basemap === 'dark'}
              onClick={() => setBasemap('dark')}
              className={`${btnBase} ${basemap === 'dark' ? btnActive : btnIdle}`}
            >
              {t('mytrips_map_mode_dark')}
            </button>
            <button
              type="button"
              aria-pressed={basemap === 'satellite'}
              onClick={() => setBasemap('satellite')}
              className={`${btnBase} ${basemap === 'satellite' ? btnActive : btnIdle}`}
            >
              {t('mytrips_map_mode_satellite')}
            </button>
          </div>
          <button
            type="button"
            aria-expanded={fsActive}
            onClick={toggleFullscreen}
            className={`${btnBase} ${darkMode ? 'bg-slate-800/90 text-slate-200 border-slate-600 hover:border-teal-400' : 'bg-white text-[#152C53] border-slate-300 hover:border-teal-500'}`}
          >
            {fsActive ? t('mytrips_map_exit_fullscreen') : t('mytrips_map_fullscreen')}
          </button>
        </div>
      </div>

      {drawableLegs.length > 0 ? (
        <div
          className={`px-4 py-2.5 border-b space-y-2 ${barBg}`}
          role="region"
          aria-label={t('mytrips_map_legs_region_label')}
        >
          <p className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {t('mytrips_map_hint')}
          </p>
          <div className="flex flex-wrap gap-1.5" role="list">
            {drawableLegs.map((leg) => {
              const c = getSegmentColorForIndex(leg.segOrderIdx);
              const on =
                selectedSegId != null && leg.seg.id != null && String(selectedSegId) === String(leg.seg.id);
              return (
                <button
                  key={leg.seg.id}
                  type="button"
                  role="listitem"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => selectLegFromPanel(leg.seg.id)}
                  className={`${legBtnBase} max-w-full sm:max-w-[220px] flex-1 min-w-[140px] ${
                    on
                      ? darkMode
                        ? 'bg-slate-800 border-amber-400/80 ring-1 ring-amber-400/50'
                        : 'bg-white border-amber-500 ring-1 ring-amber-400/60'
                      : darkMode
                        ? 'bg-slate-900/40 border-slate-600 hover:border-slate-500'
                        : 'bg-white/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="shrink-0 flex h-5 min-w-[1.25rem] items-center justify-center rounded text-[8px] font-black text-white tabular-nums"
                      style={{ backgroundColor: c }}
                    >
                      {leg.legIndex}
                    </span>
                    <span className={`truncate text-[10px] font-bold ${darkMode ? 'text-slate-200' : 'text-[#152C53]'}`}>
                      {leg.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        className="mytrips-route-map__print-summary"
        aria-hidden="true"
      >
        <p className="mytrips-route-map__print-heading">{t('mytrips_map_print_heading')}</p>
        <pre className="mytrips-route-map__print-body">{printLegLines || '—'}</pre>
      </div>

      <div
        className="relative w-full flex-1 min-h-0 mytrips-route-map__canvas-wrap"
        style={{ minHeight: 280 }}
      >
        <div ref={mapElRef} className="absolute inset-0 w-full h-full z-0 mytrips-route-map__leaflet-host" />
        {!mapReady ? (
          <div
            className={`absolute inset-0 z-[400] flex flex-col items-center justify-center gap-2 px-4 text-center ${darkMode ? 'bg-[#0a0f18]/92 text-slate-300' : 'bg-white/92 text-slate-600'}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="h-8 w-8 rounded-full border-2 border-[#FFC136]/30 border-t-[#FFC136] animate-spin" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t('mytrips_map_loading')}</span>
          </div>
        ) : null}
        {tileDegraded && mapReady ? (
          <div
            className="absolute top-2 left-2 right-2 z-[500] rounded-lg border px-3 py-2 text-[9px] font-bold uppercase tracking-wide shadow-lg pointer-events-none text-center leading-snug bg-amber-500/95 text-[#152C53] border-amber-600"
            role="alert"
          >
            {t('mytrips_map_tile_warning')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
window.MyTripsRouteMap = MyTripsRouteMap;
