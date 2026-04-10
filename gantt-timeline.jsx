// Synced from vite-scaffold/src/lib (canonical)
const React = window.React;

// My Trips Gantt — load /js/mytrips-timezones.js before React (see index.html)
function GanttTimeline({
  trip,
  darkMode,
  locale = 'en',
  updateSegment,
  airports,
  fillViewport,
  t: tProp,
  onDuplicateSegment,
  onTimelineDragStart,
}) {
  const TZ = window.MTTripTZ;
  const t = typeof tProp === 'function' ? tProp : (k, fb) => (fb !== undefined && fb !== null ? fb : k);
  const dateLocaleTag = locale === 'fr' ? 'fr-CA' : 'en-CA';
  if (!TZ) {
    return <div className="p-4 text-amber-600 text-sm">{t('mytrips_gantt_tz_error', 'Trip timezone data failed to load (mytrips-timezones.js).')}</div>;
  }
  const {
    normalizeAirportIata,
    getIanaTimeZoneForAirport,
    getSegmentDepArrUtcPair,
    minutesSinceAnchorMidnight,
    tripConnectionMinutesBetweenSegments,
    segmentZonedDurationMinutes,
    utcMsToDateISOInZone,
    utcMsToHHMM,
    wallClockToUtcMs,
  } = TZ;

  const containerRef = React.useRef(null);
  const dragVisualRef = React.useRef(null);
  const pendingDragClearRef = React.useRef(null);
  const activeDragBarRef = React.useRef(null);
  const zoomForPinchRef = React.useRef(1);
  const [zoom, setZoom] = React.useState(() => {
    try {
      const z = parseFloat(localStorage.getItem(`timeline_zoom_${trip.id}`));
      return z >= 0.4 && z <= 3 ? z : 1;
    } catch (e) {
      return 1;
    }
  });
  const [collapsed, setCollapsed] = React.useState(false);
  const [dragging, setDragging] = React.useState(null);
  const [dragVisualGen, setDragVisualGen] = React.useState(0);
  const [flightHoverTip, setFlightHoverTip] = React.useState(null);
  const FLIGHT_HOVER_TIP_DELAY_MS = 3000;
  const flightHoverTipTimerRef = React.useRef(null);
  const flightHoverPendingRef = React.useRef(null);
  const clearFlightHoverSchedule = React.useCallback(() => {
    if (flightHoverTipTimerRef.current) {
      clearTimeout(flightHoverTipTimerRef.current);
      flightHoverTipTimerRef.current = null;
    }
    flightHoverPendingRef.current = null;
  }, []);
  React.useEffect(() => () => clearFlightHoverSchedule(), [clearFlightHoverSchedule]);
  const [snapMinutes, setSnapMinutes] = React.useState(() => {
    try {
      const v = parseInt(localStorage.getItem(`timeline_snap_${trip.id}`), 10);
      return v === 5 || v === 15 ? v : 0;
    } catch (e) {
      return 0;
    }
  });
  const [showAirportCities, setShowAirportCities] = React.useState(() => {
    try {
      return localStorage.getItem('timeline_show_airport_cities') === '1';
    } catch (e) {
      return false;
    }
  });
  const [selectedSegId, setSelectedSegId] = React.useState(null);
  const selectSeg = React.useCallback((segId, source) => {
    setSelectedSegId(segId);
    try {
      window.dispatchEvent(new CustomEvent('mytrips:segselect', { detail: { segId, source: source || 'timeline' } }));
    } catch (e) {}
  }, []);
  const [quickEditSeg, setQuickEditSeg] = React.useState(null);
  const [quickDep, setQuickDep] = React.useState('');
  const [quickArr, setQuickArr] = React.useState('');
  const [coachDismissed, setCoachDismissed] = React.useState(() => {
    try {
      return localStorage.getItem('timeline_coach_v1') === '1';
    } catch (e) {
      return false;
    }
  });
  const [nowLegendDismissed, setNowLegendDismissed] = React.useState(() => {
    try {
      return localStorage.getItem('timeline_now_legend_v1') === '1';
    } catch (e) {
      return false;
    }
  });
  const [showNowLine, setShowNowLine] = React.useState(() => {
    try {
      const v = localStorage.getItem('timeline_show_now_line_v1');
      return v == null ? true : v !== '0';
    } catch (e) {
      return true;
    }
  });
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const [hoverSegId, setHoverSegId] = React.useState(null);
  const [dragPreview, setDragPreview] = React.useState(null);
  const [dragPointer, setDragPointer] = React.useState(null);

  React.useEffect(() => {
    try {
      localStorage.setItem(`timeline_zoom_${trip.id}`, String(zoom));
    } catch (e) {}
  }, [zoom, trip.id]);

  React.useEffect(() => {
    try {
      localStorage.setItem(`timeline_snap_${trip.id}`, String(snapMinutes));
    } catch (e) {}
  }, [snapMinutes, trip.id]);

  React.useEffect(() => {
    try {
      localStorage.setItem('timeline_show_airport_cities', showAirportCities ? '1' : '0');
    } catch (e) {}
  }, [showAirportCities]);

  React.useEffect(() => {
    try {
      localStorage.setItem('timeline_show_now_line_v1', showNowLine ? '1' : '0');
    } catch (e) {}
  }, [showNowLine]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduceMotion(!!mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Accept selection events from other widgets (e.g. route map)
  React.useEffect(() => {
    const onSel = (e) => {
      const segId = e?.detail?.segId;
      const source = e?.detail?.source;
      if (!segId || source === 'timeline') return;
      setSelectedSegId(segId);
    };
    window.addEventListener('mytrips:segselect', onSel);
    return () => window.removeEventListener('mytrips:segselect', onSel);
  }, []);

  zoomForPinchRef.current = zoom;

  const dragPatchKey = React.useMemo(() => {
    const o = dragVisualRef.current;
    if (!o?.segId || !o.patch) return '';
    const p = o.patch;
    return `${o.segId}|${p.date ?? ''}|${p.depTime ?? ''}|${p.arrTime ?? ''}`;
  }, [trip.segments, dragVisualGen]);

  const segmentsForLayout = React.useMemo(() => {
    const o = dragVisualRef.current;
    if (!o?.segId || !o.patch) return trip.segments;
    return trip.segments.map((s) => (s.id === o.segId ? { ...s, ...o.patch } : s));
  }, [trip.segments, dragPatchKey]);

  const layoutTrip = segmentsForLayout === trip.segments ? trip : { ...trip, segments: segmentsForLayout };

  React.useLayoutEffect(() => {
    const pending = pendingDragClearRef.current;
    if (!pending) return;
    const seg = trip.segments.find((s) => s.id === pending.segId);
    if (!seg) {
      pendingDragClearRef.current = null;
      dragVisualRef.current = null;
      setDragVisualGen((g) => g + 1);
      return;
    }
    const p = pending.patch;
    const match =
      (p.date == null || p.date === seg.date) &&
      (p.depTime == null || p.depTime === seg.depTime) &&
      (p.arrTime == null || p.arrTime === seg.arrTime);
    if (match) {
      dragVisualRef.current = null;
      pendingDragClearRef.current = null;
      setDragVisualGen((g) => g + 1);
    }
  }, [trip.segments]);

  const zoomPctRounded = Math.round(zoom * 100);
  const [zoomInputStr, setZoomInputStr] = React.useState(String(zoomPctRounded));
  React.useEffect(() => {
    setZoomInputStr(String(zoomPctRounded));
  }, [zoomPctRounded]);

  const applyZoomFromInput = React.useCallback(() => {
    const raw = String(zoomInputStr).trim().replace(/%/g, '');
    let v = parseInt(raw, 10);
    if (Number.isNaN(v)) {
      setZoomInputStr(String(Math.round(zoom * 100)));
      return;
    }
    v = Math.min(300, Math.max(40, v));
    setZoom(v / 100);
    setZoomInputStr(String(v));
  }, [zoomInputStr, zoom]);

  // dragging: { segId, type: 'move'|'resizeRight'|'resizeLeft', startX, origDep, origArr }

  const SEGMENT_COLORS = [
    { bar: '#3b82f6', border: '#1d4ed8', text: '#fff', dot: '#93c5fd', glow: 'rgba(59,130,246,0.35)' },
    { bar: '#10b981', border: '#047857', text: '#fff', dot: '#6ee7b7', glow: 'rgba(16,185,129,0.35)' },
    { bar: '#f59e0b', border: '#b45309', text: '#152C53', dot: '#fde68a', glow: 'rgba(245,158,11,0.35)' },
    { bar: '#8b5cf6', border: '#6d28d9', text: '#fff', dot: '#c4b5fd', glow: 'rgba(139,92,246,0.35)' },
    { bar: '#ef4444', border: '#b91c1c', text: '#fff', dot: '#fca5a5', glow: 'rgba(239,68,68,0.35)' },
    { bar: '#06b6d4', border: '#0e7490', text: '#fff', dot: '#67e8f9', glow: 'rgba(6,182,212,0.35)' },
    { bar: '#ec4899', border: '#be185d', text: '#fff', dot: '#f9a8d4', glow: 'rgba(236,72,153,0.35)' },
    { bar: '#84cc16', border: '#4d7c0f', text: '#152C53', dot: '#bef264', glow: 'rgba(132,204,22,0.35)' },
  ];

  const formatSegmentDateLabel = (dateStr) => {
    if (!dateStr || dateStr === '__nodate__') return null;
    const norm = String(dateStr).replace(/\//g, '-');
    const m = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    const d = new Date(`${norm}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? dateStr
      : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const getSegmentGanttColors = (_seg, colorIdx) => {
    const n = SEGMENT_COLORS.length;
    const i = ((Number(colorIdx) % n) + n) % n;
    return SEGMENT_COLORS[i];
  };

  const parseTime = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const formatMinutes = (mins) => {
    const wrapped = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const fmtDur = (mins) => {
    if (!mins || mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`;
  };

  // Build flat list with original index, grouped by date
  const segsByDate = React.useMemo(() => {
    const map = {};
    layoutTrip.segments.forEach((seg, idx) => {
      const key = seg.date || '__nodate__';
      if (!map[key]) map[key] = [];
      map[key].push({ ...seg, _colorIdx: idx % SEGMENT_COLORS.length, _origIdx: idx });
    });
    const sorted = Object.keys(map).sort((a, b) => {
      if (a === '__nodate__') return 1;
      if (b === '__nodate__') return -1;
      return a.localeCompare(b);
    });
    return sorted.map(date => ({ date, segs: map[date] }));
  }, [layoutTrip.segments]);

  // Build a flat ordered list for cross-day connector computation
  const flatSegs = React.useMemo(() =>
    layoutTrip.segments.map((seg, idx) => ({ ...seg, _colorIdx: idx % SEGMENT_COLORS.length, _origIdx: idx })),
    [layoutTrip.segments]
  );

  const hasAnyTimes = layoutTrip.segments.some(s => s.depTime || s.arrTime);

  const ganttAnchorTz = React.useMemo(() => {
    for (let i = 0; i < layoutTrip.segments.length; i++) {
      const code = normalizeAirportIata(layoutTrip.segments[i].origin, airports);
      if (code && airports[code]) {
        const tz = getIanaTimeZoneForAirport(code, airports);
        if (tz) return tz;
      }
    }
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }, [layoutTrip.segments, airports]);

  /** Midnight (anchor TZ) on the earliest segment date — single continuous timeline for all rows */
  const timelineBaseUtcMs = React.useMemo(() => {
    const dates = segsByDate.map(({ date }) => date).filter((d) => d !== '__nodate__');
    if (dates.length === 0) return null;
    const startDate = dates.reduce((a, b) => (a < b ? a : b));
    const ms = wallClockToUtcMs(startDate, '00:00', ganttAnchorTz);
    return Number.isNaN(ms) ? null : ms;
  }, [segsByDate, ganttAnchorTz]);

  const minutesFromTripStart = React.useCallback(
    (utcMs) => {
      if (timelineBaseUtcMs == null || Number.isNaN(timelineBaseUtcMs) || utcMs == null || Number.isNaN(utcMs)) return null;
      return (utcMs - timelineBaseUtcMs) / 60000;
    },
    [timelineBaseUtcMs]
  );

  const timelineExtentHours = React.useMemo(() => {
    let maxRelMin = 0;
    segsByDate.forEach(({ date, segs }) => {
      segs.forEach((seg) => {
        const p = getSegmentDepArrUtcPair(seg, airports);
        if (!p) return;
        let dr;
        let ar;
        if (timelineBaseUtcMs != null && !Number.isNaN(timelineBaseUtcMs)) {
          dr = minutesFromTripStart(p.depMs);
          if (p.arrMs != null) ar = minutesFromTripStart(p.arrMs);
        } else {
          dr = minutesSinceAnchorMidnight(p.depMs, date, ganttAnchorTz);
          if (p.arrMs != null) ar = minutesSinceAnchorMidnight(p.arrMs, date, ganttAnchorTz);
        }
        if (dr != null && !Number.isNaN(dr)) maxRelMin = Math.max(maxRelMin, dr);
        if (ar != null && !Number.isNaN(ar)) maxRelMin = Math.max(maxRelMin, ar);
      });
    });
    const h = Math.ceil(maxRelMin / 60) + 2;
    return Math.min(Math.max(24, h), 168);
  }, [segsByDate, airports, ganttAnchorTz, timelineBaseUtcMs, minutesFromTripStart]);

  const HOURS = React.useMemo(() => Array.from({ length: timelineExtentHours + 1 }, (_, i) => i), [timelineExtentHours]);
  /** Base scale (× zoom). Lower = shorter horizontal timeline. */
  const BASE_PIXELS_PER_HOUR = 64;
  const PIXELS_PER_HOUR = BASE_PIXELS_PER_HOUR * zoom;
  const TOTAL_WIDTH = PIXELS_PER_HOUR * timelineExtentHours;
  const ROW_HEIGHT = 64;
  const LABEL_W = 148;
  const DATE_HEADER_H = 26;
  const ganttTheme = React.useMemo(
    () =>
      darkMode
        ? {
            shellClass: 'bg-[#0d1929] border-slate-700',
            headerBg: '#131f33',
            headerBorder: '1px solid rgba(255,255,255,0.07)',
            rulerBg: '#0d1929',
            stickyLabelBg: '#0d1929',
            stickyLabelGradient: 'linear-gradient(90deg, #0d1929 0%, #0f1626 100%)',
            stickyShadow: '10px 0 28px -16px rgba(0,0,0,0.75)',
            hairline: 'rgba(255,255,255,0.07)',
            hairline2: 'rgba(255,255,255,0.08)',
            hairline3: 'rgba(255,255,255,0.05)',
            hairline4: 'rgba(255,255,255,0.04)',
            gridVx: (isDay) => (isDay ? 'rgba(255, 193, 54, 0.35)' : 'rgba(255,255,255,0.06)'),
            gridVxBody: (isDay) => (isDay ? 'rgba(255, 193, 54, 0.2)' : 'rgba(255,255,255,0.04)'),
            dateHeaderBg: 'rgba(255,255,255,0.03)',
            connectorRect: '#0d1929',
            labelText: '#e2e8f0',
            labelMuted: '#475569',
            footerBg: 'rgba(0,0,0,0.2)',
            footerBorder: 'rgba(255,255,255,0.05)',
            overviewWell: 'rgba(0,0,0,0.35)',
            overviewBorder: 'rgba(255,255,255,0.08)',
            zoomBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' },
            zoomInput: { border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.25)', color: '#e2e8f0' },
            headerHint: '#64748b',
            toolbarDivider: 'rgba(255,255,255,0.08)',
            snapIdleBorder: 'rgba(255,255,255,0.12)',
            snapIdleBg: 'rgba(255,255,255,0.06)',
            snapIdleColor: '#94a3b8',
            gridRowHour: (h) => {
              if (h > 0 && h % 24 === 0) return 'rgba(255, 193, 54, 0.22)';
              if (h % 6 === 0) return 'rgba(255,255,255,0.08)';
              return 'rgba(255,255,255,0.03)';
            },
          }
        : {
            shellClass: 'bg-slate-50 border-slate-200',
            headerBg: '#f1f5f9',
            headerBorder: '1px solid rgba(15,23,42,0.1)',
            rulerBg: '#ffffff',
            stickyLabelBg: '#ffffff',
            stickyLabelGradient: 'linear-gradient(90deg, #ffffff 0%, #f1f5f9 100%)',
            stickyShadow: '8px 0 20px -12px rgba(15,23,42,0.1)',
            hairline: 'rgba(15,23,42,0.1)',
            hairline2: 'rgba(15,23,42,0.12)',
            hairline3: 'rgba(15,23,42,0.08)',
            hairline4: 'rgba(15,23,42,0.06)',
            gridVx: (isDay) => (isDay ? 'rgba(245, 158, 11, 0.38)' : 'rgba(15,23,42,0.09)'),
            gridVxBody: (isDay) => (isDay ? 'rgba(245, 158, 11, 0.22)' : 'rgba(15,23,42,0.05)'),
            dateHeaderBg: 'rgba(15,23,42,0.04)',
            connectorRect: '#ffffff',
            labelText: '#0f172a',
            labelMuted: '#64748b',
            footerBg: 'rgba(241,245,249,0.98)',
            footerBorder: 'rgba(15,23,42,0.1)',
            overviewWell: 'rgba(241,245,249,0.95)',
            overviewBorder: 'rgba(15,23,42,0.15)',
            zoomBtn: { background: '#ffffff', border: '1px solid rgba(15,23,42,0.15)', color: '#475569' },
            zoomInput: { border: '1px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a' },
            headerHint: '#64748b',
            toolbarDivider: 'rgba(15,23,42,0.12)',
            snapIdleBorder: 'rgba(15,23,42,0.15)',
            snapIdleBg: 'rgba(15,23,42,0.05)',
            snapIdleColor: '#64748b',
            gridRowHour: (h) => {
              if (h > 0 && h % 24 === 0) return 'rgba(245, 158, 11, 0.24)';
              if (h % 6 === 0) return 'rgba(15,23,42,0.1)';
              return 'rgba(15,23,42,0.04)';
            },
          },
    [darkMode],
  );
  const stickyLabelStyle = React.useMemo(
    () => ({
      position: 'sticky',
      left: 0,
      flexShrink: 0,
      background: ganttTheme.stickyLabelBg,
      boxShadow: ganttTheme.stickyShadow,
      zIndex: 22,
    }),
    [ganttTheme],
  );
  /** Past 24h of axis: label each tick as Day N · 0:00–23:00 (repeats per calendar day on the scale) */
  const multiDayAxis = timelineExtentHours > 24;
  const RULER_H = multiDayAxis ? 36 : 30;

  const hourTickLabel = (h) => {
    if (!multiDayAxis) {
      const d = new Date(2000, 0, 1, h, 0, 0);
      return d.toLocaleTimeString(dateLocaleTag, { hour: 'numeric', hour12: locale !== 'fr' });
    }
    const dayNum = Math.floor(h / 24) + 1;
    const clockH = h % 24;
    return `${t('mytrips_gantt_axis_day', 'Day')} ${dayNum} · ${String(clockH).padStart(2, '0')}:00`;
  };

  const isDayBoundaryHour = (h) => h > 0 && h % 24 === 0;

  const minToX = (mins) => (mins / 60) * PIXELS_PER_HOUR;
  const xToMin = (x) => Math.round((x / PIXELS_PER_HOUR) * 60);

  const computeDragDeltaToChanges = React.useCallback(
    (payload, clientX) => {
      if (payload == null || clientX == null) return null;
      const MIN_DUR_MS = 15 * 60000;
      const MIN_DUR = 15;
      const dx = clientX - payload.startX;
      const dMin = Math.round((dx / (BASE_PIXELS_PER_HOUR * zoom)) * 60);
      const dMs = dMin * 60000;
      if (payload.mode === 'utc' && payload.tzO) {
        if (payload.type === 'move' && payload.origArrUtc != null && payload.tzD) {
          const newDepUtc = payload.origDepUtc + dMs;
          const newArrUtc = payload.origArrUtc + dMs;
          const depTime = utcMsToHHMM(newDepUtc, payload.tzO);
          const arrTime = utcMsToHHMM(newArrUtc, payload.tzD);
          const date = utcMsToDateISOInZone(newDepUtc, payload.tzO);
          if (depTime && arrTime && date) return { date, depTime, arrTime };
        } else if (payload.type === 'resizeRight' && payload.origArrUtc != null && payload.tzD) {
          const newArrUtc = payload.origArrUtc + dMs;
          if (newArrUtc - payload.origDepUtc >= MIN_DUR_MS) {
            const arrTime = utcMsToHHMM(newArrUtc, payload.tzD);
            if (arrTime) return { arrTime };
          }
        } else if (payload.type === 'resizeLeft') {
          const newDepUtc = payload.origDepUtc + dMs;
          const arrEnd = payload.origArrUtc != null ? payload.origArrUtc : payload.origDepUtc + MIN_DUR_MS;
          if (arrEnd - newDepUtc >= MIN_DUR_MS) {
            const depTime = utcMsToHHMM(newDepUtc, payload.tzO);
            const date = utcMsToDateISOInZone(newDepUtc, payload.tzO);
            if (depTime && date) return { date, depTime };
          }
        }
        return null;
      }
      if (payload.type === 'move') {
        const newDep = (payload.origDep ?? 0) + dMin;
        const newArr = payload.origArr != null ? payload.origArr + dMin : null;
        const changes = { depTime: formatMinutes(newDep) };
        if (newArr != null) changes.arrTime = formatMinutes(newArr);
        return changes;
      }
      if (payload.type === 'resizeRight' && payload.origArr != null) {
        const newArr = Math.max(payload.origArr + dMin, payload.origDep + MIN_DUR);
        return { arrTime: formatMinutes(newArr) };
      }
      if (payload.type === 'resizeLeft' && payload.origArr != null) {
        const newDep = Math.min(payload.origDep + dMin, payload.origArr - MIN_DUR);
        return { depTime: formatMinutes(newDep) };
      }
      return null;
    },
    [zoom, utcMsToHHMM, utcMsToDateISOInZone],
  );

  const snapHHMMToGrid = React.useCallback((hhmm, snap) => {
    if (!hhmm || snap == null || snap <= 0) return hhmm;
    const parts = String(hhmm).split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    let total = ((h * 60 + m) % 1440 + 1440) % 1440;
    total = Math.round(total / snap) * snap;
    total = ((total % 1440) + 1440) % 1440;
    return formatMinutes(total);
  }, []);

  const safeUpdate = React.useCallback(
    (segId, changes) => {
      let c = { ...changes };
      if (snapMinutes > 0) {
        if (c.depTime != null) c.depTime = snapHHMMToGrid(c.depTime, snapMinutes);
        if (c.arrTime != null) c.arrTime = snapHHMMToGrid(c.arrTime, snapMinutes);
      }
      updateSegment(trip.id, segId, c);
    },
    [snapMinutes, trip.id, updateSegment, snapHHMMToGrid]
  );

  // Mouse drag: { mode:'utc', origDepUtc, origArrUtc, tzO, tzD } or { mode:'naive', origDep, origArr }
  const handleMouseDown = React.useCallback(
    (e, dragPayload) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragPayload.type !== 'move') activeDragBarRef.current = null;
      clearFlightHoverSchedule();
      setFlightHoverTip(null);
      onTimelineDragStart?.();
      setDragging({ ...dragPayload, startX: e.clientX });
    },
    [onTimelineDragStart, clearFlightHoverSchedule],
  );

  React.useEffect(() => {
    if (!dragging) return;
    let rafId = null;
    let latestClientX = null;
    let lastAppliedKey = '';
    const dragSnap = dragging;

    const flush = () => {
      if (latestClientX == null) return;
      const dx = latestClientX - dragSnap.startX;
      const chRaw = computeDragDeltaToChanges(dragSnap, latestClientX);
      const moveSameCalendarRow =
        dragSnap.type === 'move' &&
        activeDragBarRef.current &&
        chRaw != null &&
        (chRaw.date == null || chRaw.date === dragSnap.originSegDate);
      if (moveSameCalendarRow) {
        activeDragBarRef.current.style.transform = `translateX(${dx}px) translateY(-50%)`;
        return;
      }
      if (activeDragBarRef.current) activeDragBarRef.current.style.transform = 'translateY(-50%)';
      let ch = chRaw;
      if (!ch) return;
      if (snapMinutes > 0) {
        ch = { ...ch };
        if (ch.depTime != null) ch.depTime = snapHHMMToGrid(ch.depTime, snapMinutes);
        if (ch.arrTime != null) ch.arrTime = snapHHMMToGrid(ch.arrTime, snapMinutes);
      }
      const k = `${ch.date || ''}|${ch.depTime || ''}|${ch.arrTime || ''}`;
      if (k === lastAppliedKey) return;
      lastAppliedKey = k;
      dragVisualRef.current = { segId: dragSnap.segId, patch: ch };
      setDragVisualGen((g) => g + 1);
    };

    const onMouseMove = (e) => {
      latestClientX = e.clientX;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flush();
      });
    };

    const onMouseUp = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flush();
      const barEl = activeDragBarRef.current;
      if (barEl) {
        barEl.style.transform = 'translateY(-50%)';
        activeDragBarRef.current = null;
      }
      let ch = latestClientX != null ? computeDragDeltaToChanges(dragSnap, latestClientX) : null;
      if (ch && snapMinutes > 0) {
        ch = { ...ch };
        if (ch.depTime != null) ch.depTime = snapHHMMToGrid(ch.depTime, snapMinutes);
        if (ch.arrTime != null) ch.arrTime = snapHHMMToGrid(ch.arrTime, snapMinutes);
      }
      if (ch && (ch.date != null || ch.depTime != null || ch.arrTime != null)) {
        updateSegment(trip.id, dragSnap.segId, ch, { timelineDragEnd: true });
        pendingDragClearRef.current = { segId: dragSnap.segId, patch: ch };
      } else {
        dragVisualRef.current = null;
        pendingDragClearRef.current = null;
        setDragVisualGen((g) => g + 1);
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const el = activeDragBarRef.current;
      if (el) el.style.transform = 'translateY(-50%)';
      activeDragBarRef.current = null;
    };
  }, [dragging, computeDragDeltaToChanges, snapMinutes, snapHHMMToGrid, updateSegment, trip.id]);

  const touchRef = React.useRef(null);
  const handleTouchStart = React.useCallback(
    (e, dragPayload) => {
      if (dragPayload.type !== 'move') activeDragBarRef.current = null;
      clearFlightHoverSchedule();
      setFlightHoverTip(null);
      onTimelineDragStart?.();
      const touch = e.touches[0];
      touchRef.current = { ...dragPayload, startX: touch.clientX };
    },
    [onTimelineDragStart, clearFlightHoverSchedule],
  );

  React.useEffect(() => {
    let rafId = null;
    let latestClientX = null;
    let lastAppliedKey = '';

    const flush = () => {
      const p = touchRef.current;
      if (p == null || latestClientX == null) return;
      const dx = latestClientX - p.startX;
      const chRaw = computeDragDeltaToChanges(p, latestClientX);
      const moveSameCalendarRow =
        p.type === 'move' &&
        activeDragBarRef.current &&
        chRaw != null &&
        (chRaw.date == null || chRaw.date === p.originSegDate);
      if (moveSameCalendarRow) {
        activeDragBarRef.current.style.transform = `translateX(${dx}px) translateY(-50%)`;
        return;
      }
      if (activeDragBarRef.current) activeDragBarRef.current.style.transform = 'translateY(-50%)';
      let ch = chRaw;
      if (!ch) return;
      if (snapMinutes > 0) {
        ch = { ...ch };
        if (ch.depTime != null) ch.depTime = snapHHMMToGrid(ch.depTime, snapMinutes);
        if (ch.arrTime != null) ch.arrTime = snapHHMMToGrid(ch.arrTime, snapMinutes);
      }
      const k = `${ch.date || ''}|${ch.depTime || ''}|${ch.arrTime || ''}`;
      if (k === lastAppliedKey) return;
      lastAppliedKey = k;
      dragVisualRef.current = { segId: p.segId, patch: ch };
      setDragVisualGen((g) => g + 1);
    };

    const onTouchMove = (e) => {
      if (e.touches.length >= 2) return;
      if (!touchRef.current) return;
      e.preventDefault();
      latestClientX = e.touches[0].clientX;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flush();
      });
    };

    const onTouchEnd = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const p = touchRef.current;
      flush();
      const barEl = activeDragBarRef.current;
      if (barEl) {
        barEl.style.transform = 'translateY(-50%)';
        activeDragBarRef.current = null;
      }
      let ch = p && latestClientX != null ? computeDragDeltaToChanges(p, latestClientX) : null;
      if (ch && snapMinutes > 0) {
        ch = { ...ch };
        if (ch.depTime != null) ch.depTime = snapHHMMToGrid(ch.depTime, snapMinutes);
        if (ch.arrTime != null) ch.arrTime = snapHHMMToGrid(ch.arrTime, snapMinutes);
      }
      if (ch && (ch.date != null || ch.depTime != null || ch.arrTime != null)) {
        updateSegment(trip.id, p.segId, ch, { timelineDragEnd: true });
        pendingDragClearRef.current = { segId: p.segId, patch: ch };
      } else {
        dragVisualRef.current = null;
        pendingDragClearRef.current = null;
        setDragVisualGen((g) => g + 1);
      }
      touchRef.current = null;
      lastAppliedKey = '';
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      const el = activeDragBarRef.current;
      if (el) el.style.transform = 'translateY(-50%)';
      activeDragBarRef.current = null;
    };
  }, [computeDragDeltaToChanges, snapMinutes, snapHHMMToGrid, updateSegment, trip.id]);

  // Per-row layout: depRel/arrRel = minutes from trip start (earliest date midnight, anchor TZ) so multi-day rows share one X axis
  const rowMetrics = React.useMemo(() => {
    const metrics = {};
    const pxToX = (mins) => (mins / 60) * PIXELS_PER_HOUR;
    let yOffset = 0;
    segsByDate.forEach(({ date, segs }) => {
      yOffset += DATE_HEADER_H;
      segs.forEach((seg) => {
        const p = getSegmentDepArrUtcPair(seg, airports);
        const depNaive = parseTime(seg.depTime);
        const arrNaive = parseTime(seg.arrTime);
        let depRel = null;
        let arrRel = null;
        if (p && timelineBaseUtcMs != null && !Number.isNaN(timelineBaseUtcMs)) {
          depRel = minutesFromTripStart(p.depMs);
          if (p.arrMs != null) arrRel = minutesFromTripStart(p.arrMs);
        } else if (p && date !== '__nodate__') {
          depRel = minutesSinceAnchorMidnight(p.depMs, date, ganttAnchorTz);
          if (p.arrMs != null) arrRel = minutesSinceAnchorMidnight(p.arrMs, date, ganttAnchorTz);
        }
        if (depRel == null || Number.isNaN(depRel)) {
          if (depNaive != null && timelineBaseUtcMs != null && date !== '__nodate__') {
            const row0 = wallClockToUtcMs(date, '00:00', ganttAnchorTz);
            if (!Number.isNaN(row0)) depRel = (row0 - timelineBaseUtcMs) / 60000 + depNaive;
            else depRel = depNaive;
          } else depRel = depNaive;
        }
        if (arrRel == null || Number.isNaN(arrRel)) {
          if (depNaive != null && arrNaive != null) {
            const adj = arrNaive < depNaive ? arrNaive + 1440 : arrNaive;
            if (timelineBaseUtcMs != null && date !== '__nodate__') {
              const row0 = wallClockToUtcMs(date, '00:00', ganttAnchorTz);
              if (!Number.isNaN(row0)) arrRel = (row0 - timelineBaseUtcMs) / 60000 + adj;
              else arrRel = adj;
            } else arrRel = adj;
          } else arrRel = arrNaive;
        }
        const depMin = depNaive;
        const arrMin = arrNaive;
        const hasBoth = depMin !== null && arrMin !== null;
        const hasDep = (depRel != null && !Number.isNaN(depRel)) || depMin !== null;
        const adjArr = hasBoth ? (arrMin < depMin ? arrMin + 1440 : arrMin) : null;
        const naiveBlockMin = hasBoth ? adjArr - depMin : null;
        const zonedDurMin = hasBoth && seg.date && seg.date !== '__nodate__'
          ? segmentZonedDurationMinutes(seg, airports)
          : null;
        const spanAnchorMin = hasBoth && depRel != null && arrRel != null && !Number.isNaN(depRel) && !Number.isNaN(arrRel)
          ? Math.max(arrRel - depRel, 1)
          : null;
        const spanForWidth = spanAnchorMin != null ? spanAnchorMin : (zonedDurMin != null ? zonedDurMin : naiveBlockMin);
        const barLeftPx = depRel != null && !Number.isNaN(depRel) ? pxToX(depRel) : (depMin !== null ? pxToX(depMin) : 0);
        const barWidthPx = hasBoth && spanForWidth != null
          ? Math.max(pxToX(spanForWidth), 36)
          : (hasDep ? 80 : 0);
        const barRightPx = hasDep ? barLeftPx + barWidthPx : barLeftPx;
        metrics[seg.id] = {
          yCentre: yOffset + ROW_HEIGHT / 2,
          date,
          depRel,
          arrRel,
          dep: depNaive,
          arr: arrNaive,
          colorIdx: seg._colorIdx,
          barLeftPx,
          barRightPx,
        };
        yOffset += ROW_HEIGHT;
      });
    });
    return metrics;
  }, [segsByDate, airports, ganttAnchorTz, timelineBaseUtcMs, minutesFromTripStart, PIXELS_PER_HOUR]);

  const firstSeg = layoutTrip.segments[0];
  const firstDepRelSnap = firstSeg && rowMetrics[firstSeg.id] != null ? rowMetrics[firstSeg.id].depRel : null;

  // Compute total gantt body height for SVG overlay
  const ganttBodyHeight = React.useMemo(() => {
    let h = 0;
    segsByDate.forEach(({ segs }) => {
      h += DATE_HEADER_H + segs.length * ROW_HEIGHT;
    });
    return h;
  }, [segsByDate]);

  // Build connector lines between consecutive segments (cross-row bezier curves)
  const connectors = React.useMemo(() => {
    const lines = [];
    for (let i = 0; i < flatSegs.length - 1; i++) {
      const cur = flatSegs[i];
      const nxt = flatSegs[i + 1];
      const curM = rowMetrics[cur.id];
      const nxtM = rowMetrics[nxt.id];
      if (!curM || !nxtM) continue;
      if (curM.arrRel == null || nxtM.depRel == null) continue;
      const x1 = LABEL_W + curM.barRightPx;
      const x2 = LABEL_W + nxtM.barLeftPx;
      const y1 = curM.yCentre;
      const y2 = nxtM.yCentre;
      const color = getSegmentGanttColors(cur, cur._colorIdx);
      // connection time
      const connMinutes = (() => {
        const zoned = tripConnectionMinutesBetweenSegments(cur, nxt, airports);
        if (zoned != null) return zoned;
        if (cur.date && nxt.date && cur.date !== nxt.date) {
          const d1 = new Date(cur.date + 'T' + (cur.arrTime || '00:00'));
          const d2 = new Date(nxt.date + 'T' + (nxt.depTime || '00:00'));
          if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) return Math.round((d2 - d1) / 60000);
        }
        const layover = nxtM.depRel - curM.arrRel;
        return layover >= 0 ? Math.round(layover) : null;
      })();
      const isShort = connMinutes !== null && connMinutes < 60;
      const isTight = connMinutes !== null && connMinutes >= 0 && connMinutes < 120;
      const curveOff = ((i % 5) - 2) * 5;
      lines.push({ x1, y1, x2, y2, color, connMinutes, isShort, isTight, key: `${cur.id}-${nxt.id}`, curveOff });
    }
    return lines;
  }, [flatSegs, rowMetrics, zoom, airports]);

  const scheduleConflicts = React.useMemo(() => {
    const out = [];
    const byDate = {};
    layoutTrip.segments.forEach((seg) => {
      const d = seg.date;
      if (!d || d === '__nodate__') return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(seg);
    });
    Object.values(byDate).forEach((segs) => {
      if (segs.length < 2) return;
      const intervals = segs
        .map((s) => {
          const p = getSegmentDepArrUtcPair(s, airports);
          if (p && p.depMs != null && p.arrMs != null && !Number.isNaN(p.depMs) && !Number.isNaN(p.arrMs)) {
            return { id: s.id, a: p.depMs, b: p.arrMs };
          }
          const dep = parseTime(s.depTime);
          const arr = parseTime(s.arrTime);
          if (dep == null || arr == null) return null;
          const base = new Date(`${s.date}T12:00:00`).getTime();
          if (Number.isNaN(base)) return null;
          const adjArr = arr < dep ? arr + 1440 : arr;
          return { id: s.id, a: base + dep * 60000, b: base + adjArr * 60000 };
        })
        .filter(Boolean);
      for (let i = 0; i < intervals.length; i++) {
        for (let j = i + 1; j < intervals.length; j++) {
          const A = intervals[i];
          const B = intervals[j];
          if (A.a < B.b && B.a < A.b) out.push({ a: A.id, b: B.id });
        }
      }
    });
    return out;
  }, [layoutTrip.segments, airports]);

  const [scrollSync, setScrollSync] = React.useState(0);
  const [coachStep, setCoachStep] = React.useState(0);

  React.useEffect(() => {
    setCoachStep(0);
  }, [trip.id]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || collapsed || !hasAnyTimes) return undefined;
    const fn = () => setScrollSync((x) => x + 1);
    el.addEventListener('scroll', fn, { passive: true });
    return () => el.removeEventListener('scroll', fn);
  }, [collapsed, hasAnyTimes, trip.id]);

  /** Center the viewport on the first flight bar when the timeline loads or layout changes */
  React.useEffect(() => {
    if (collapsed || !hasAnyTimes || !firstSeg) return undefined;
    let depRel = firstDepRelSnap;
    if (depRel == null || Number.isNaN(depRel)) {
      const pt = parseTime(firstSeg.depTime);
      if (pt != null) depRel = pt;
    }
    if (depRel == null || Number.isNaN(depRel)) return undefined;

    const el = containerRef.current;
    if (!el) return undefined;

    const applyScroll = () => {
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 0) return;
      const rm = rowMetrics[firstSeg.id];
      const bl = rm?.barLeftPx;
      const br = rm?.barRightPx;
      let centerX;
      if (Number.isFinite(bl) && Number.isFinite(br)) {
        centerX = LABEL_W + (bl + br) / 2;
      } else {
        const depX = LABEL_W + (depRel / 60) * PIXELS_PER_HOUR;
        centerX = depX + 48;
      }
      const target = centerX - el.clientWidth / 2;
      el.scrollLeft = Math.max(0, Math.min(target, maxScroll));
      setScrollSync((x) => x + 1);
    };

    requestAnimationFrame(() => requestAnimationFrame(applyScroll));
    const t1 = window.setTimeout(applyScroll, 80);
    const t2 = window.setTimeout(applyScroll, 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [
    collapsed,
    hasAnyTimes,
    trip.id,
    firstSeg?.id,
    firstSeg?.depTime,
    firstSeg?.date,
    firstSeg?.arrTime,
    firstDepRelSnap,
    zoom,
    PIXELS_PER_HOUR,
    rowMetrics,
  ]);

  React.useEffect(() => {
    if (!selectedSegId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
      const seg = layoutTrip.segments.find((s) => s.id === selectedSegId);
      if (!seg) return;
      const step = snapMinutes > 0 ? snapMinutes : 5;
      const delta = e.key === 'ArrowRight' ? step : -step;
      const pair = getSegmentDepArrUtcPair(seg, airports);
      if (pair && pair.tzO && pair.arrMs != null && pair.tzD) {
        const newDep = pair.depMs + delta * 60000;
        const newArr = pair.arrMs + delta * 60000;
        safeUpdate(selectedSegId, {
          date: utcMsToDateISOInZone(newDep, pair.tzO),
          depTime: utcMsToHHMM(newDep, pair.tzO),
          arrTime: utcMsToHHMM(newArr, pair.tzD),
        });
      } else {
        const dep = parseTime(seg.depTime);
        const arr = parseTime(seg.arrTime);
        if (dep == null) return;
        const ch = { depTime: formatMinutes(dep + delta) };
        if (arr != null) ch.arrTime = formatMinutes(arr + delta);
        safeUpdate(selectedSegId, ch);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSegId, layoutTrip.segments, airports, snapMinutes, safeUpdate]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || collapsed) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(3, Math.max(0.4, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [collapsed]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || collapsed || !hasAnyTimes) return undefined;
    const pinch = { active: false, d0: 24, z0: 1 };
    const dist = (touches) => {
      if (touches.length < 2) return 0;
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTs = (e) => {
      if (e.touches.length === 2) {
        const d = dist(e.touches);
        if (d < 10) return;
        pinch.active = true;
        pinch.d0 = Math.max(d, 28);
        pinch.z0 = zoomForPinchRef.current;
        touchRef.current = null;
        setDragging(null);
      }
    };
    const onTm = (e) => {
      if (!pinch.active || e.touches.length !== 2) return;
      const d = dist(e.touches);
      if (d < 10) return;
      e.preventDefault();
      const nz = Math.min(3, Math.max(0.4, +(pinch.z0 * (d / pinch.d0)).toFixed(2)));
      setZoom(nz);
    };
    const onTe = (e) => {
      if (e.touches.length < 2) pinch.active = false;
    };
    el.addEventListener('touchstart', onTs, { passive: true, capture: true });
    el.addEventListener('touchmove', onTm, { passive: false, capture: true });
    el.addEventListener('touchend', onTe, { capture: true });
    el.addEventListener('touchcancel', onTe, { capture: true });
    return () => {
      el.removeEventListener('touchstart', onTs, { capture: true });
      el.removeEventListener('touchmove', onTm, { capture: true });
      el.removeEventListener('touchend', onTe, { capture: true });
      el.removeEventListener('touchcancel', onTe, { capture: true });
    };
  }, [collapsed, hasAnyTimes, trip.id]);

  if (!hasAnyTimes) {
    return (
      <div
        className={`w-full min-w-0 ${fillViewport ? 'flex flex-1 min-h-0 flex-col justify-center' : 'border-b'} ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
        style={fillViewport ? { flex: 1, minHeight: 0 } : undefined}
      >
        <div
          className={`px-4 sm:px-6 py-3 flex items-center justify-between cursor-pointer ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'} transition-colors`}
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Flight Timeline</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'} ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4,6 8,10 12,6"/></svg>
        </div>
        {!collapsed && (
          <div className={`px-6 py-4 text-xs font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Add departure &amp; arrival times to your flights to see them on the interactive flight timeline. The horizontal axis is one <strong>continuous</strong> scale from midnight on the <strong>earliest trip date</strong> (first departure airport&apos;s timezone), so later days line up left-to-right in real time. Stored times stay local per airport. Drag to adjust.
          </div>
        )}
      </div>
    );
  }

  const nowRelMin =
    timelineBaseUtcMs != null && !Number.isNaN(timelineBaseUtcMs) ? (Date.now() - timelineBaseUtcMs) / 60000 : null;
  const nowLineOnAxis = showNowLine && nowRelMin != null && nowRelMin >= 0 && nowRelMin <= timelineExtentHours * 60;

  const snapBtn = (active, onClick, label, btnTitle) => (
    <button
      type="button"
      onClick={onClick}
      title={btnTitle || undefined}
      style={{
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 7,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        cursor: 'pointer',
        border: active ? '1px solid #FFC136' : `1px solid ${ganttTheme.snapIdleBorder}`,
        background: active ? 'rgba(255,193,54,0.15)' : ganttTheme.snapIdleBg,
        color: active ? '#fcd34d' : ganttTheme.snapIdleColor,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`w-full min-w-0 ${fillViewport ? 'flex flex-1 min-h-0 flex-col h-full border-0' : 'border-b'} ${ganttTheme.shellClass}`}
      style={fillViewport ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', position: 'relative' } : { position: 'relative' }}
    >
      {/* Header */}
      <div
        className="shrink-0 select-none"
        style={{ background: ganttTheme.headerBg, borderBottom: collapsed ? 'none' : ganttTheme.headerBorder, flexShrink: 0 }}
      >
        <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between cursor-pointer" onClick={() => setCollapsed((c) => !c)}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
              {t('mytrips_gantt_title', 'Flight Timeline')}
            </span>
            <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#FFC136', background: 'rgba(255,193,54,0.12)', padding: '2px 7px', borderRadius: 999 }}>
              {t('mytrips_gantt_drag_hint', 'Drag to adjust')}
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, color: ganttTheme.headerHint, maxWidth: 260, lineHeight: 1.2 }} title={ganttAnchorTz}>
              {t('mytrips_gantt_axis_hint', 'Continuous scale — timezone on hover')}
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label={t('mytrips_gantt_zoom_out', 'Zoom out')}
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)))}
              style={{ width: 30, height: 30, minWidth: 30, minHeight: 30, borderRadius: 6, ...ganttTheme.zoomBtn, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              −
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={t('mytrips_gantt_zoom_pct', 'Timeline zoom percent')}
                value={zoomInputStr}
                onChange={(e) => setZoomInputStr(e.target.value)}
                onBlur={applyZoomFromInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyZoomFromInput();
                    e.target.blur();
                  }
                }}
                style={{
                  width: 44,
                  height: 30,
                  borderRadius: 6,
                  ...ganttTheme.zoomInput,
                  fontSize: 10,
                  fontWeight: 800,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <span>%</span>
            </label>
            <button
              type="button"
              aria-label={t('mytrips_gantt_zoom_in', 'Zoom in')}
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              style={{ width: 30, height: 30, minWidth: 30, minHeight: 30, borderRadius: 6, ...ganttTheme.zoomBtn, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              +
            </button>
            <div style={{ width: 1, height: 18, background: ganttTheme.toolbarDivider, margin: '0 2px' }} />
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              style={{
                color: '#475569',
                transform: collapsed ? 'none' : 'rotate(180deg)',
                transition: reduceMotion ? 'none' : 'transform 0.2s',
                flexShrink: 0,
              }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </div>
        </div>
        {!collapsed && (
          <div
            className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2 items-center"
            style={{ borderBottom: `1px solid ${ganttTheme.hairline3}` }}
            role="toolbar"
            aria-label={t('mytrips_gantt_toolbar', 'Timeline tools')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
              title={t(
                'mytrips_gantt_snap_help',
                'When you drag or resize a flight bar, snap departure and arrival to the nearest 5 or 15 minutes. Off keeps exact times.',
              )}
            >
              <span style={{ fontSize: 7, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{t('mytrips_gantt_snap', 'Snap times')}</span>
              {snapBtn(snapMinutes === 0, () => setSnapMinutes(0), t('mytrips_gantt_snap_off', 'Off'), t('mytrips_gantt_snap_off_help', 'No rounding — use exact times'))}
              {snapBtn(snapMinutes === 5, () => setSnapMinutes(5), t('mytrips_gantt_snap_5', '5 min'), t('mytrips_gantt_snap_5_help', 'Round to nearest 5 minutes'))}
              {snapBtn(snapMinutes === 15, () => setSnapMinutes(15), t('mytrips_gantt_snap_15', '15 min'), t('mytrips_gantt_snap_15_help', 'Round to nearest 15 minutes'))}
            </span>
            {snapBtn(showAirportCities, () => setShowAirportCities((v) => !v), t('mytrips_gantt_cities', 'Cities'))}
            {typeof onDuplicateSegment === 'function' && selectedSegId
              ? snapBtn(false, () => onDuplicateSegment(selectedSegId), t('mytrips_timeline_duplicate_leg', 'Duplicate leg'))
              : null}
            {scheduleConflicts.length > 0 ? (
              <span style={{ fontSize: 7, fontWeight: 800, color: '#f87171', maxWidth: 280, lineHeight: 1.3 }} role="status">
                {t('mytrips_gantt_conflict', 'Overlap detected — check same-day flights')}
              </span>
            ) : null}
            {nowLineOnAxis && !nowLegendDismissed ? (
              <span style={{ fontSize: 7, fontWeight: 800, color: '#fcd34d', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {t('mytrips_gantt_now_line', 'Gold line = now (device clock vs trip axis)')}
                <button
                  type="button"
                  style={{ fontSize: 7, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => {
                    setNowLegendDismissed(true);
                    try {
                      localStorage.setItem('timeline_now_legend_v1', '1');
                    } catch (e4) {}
                  }}
                >
                  {t('mytrips_gantt_dismiss', 'Dismiss')}
                </button>
              </span>
            ) : null}
            <span style={{ fontSize: 7, color: '#475569', maxWidth: 200, lineHeight: 1.3 }} title={t('mytrips_gantt_ctrl_wheel', 'Hold Ctrl (or ⌘) and scroll to zoom')}>
              {t('mytrips_gantt_ctrl_wheel_short', 'Ctrl+scroll · zoom')}
            </span>
            <span style={{ fontSize: 7, color: '#475569', maxWidth: 160, lineHeight: 1.3 }} title={t('mytrips_gantt_pinch_zoom', 'Pinch with two fingers on the chart to zoom')}>
              {t('mytrips_gantt_pinch_zoom', 'Pinch · zoom')}
            </span>
            <span style={{ fontSize: 7, color: '#475569', maxWidth: 220, lineHeight: 1.3 }}>
              {t('mytrips_gantt_keys', 'Select a bar · ← → nudge')}
            </span>
          </div>
        )}
        {!collapsed && (
          <div className="px-4 sm:px-6 pb-2" style={{ borderBottom: `1px solid ${ganttTheme.hairline3}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 7, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {t('mytrips_gantt_overview', 'Overview')}
              </span>
              <div
                role="slider"
                tabIndex={0}
                aria-label={t('mytrips_gantt_overview', 'Timeline overview — click to scroll')}
                onKeyDown={(e) => {
                  const el = containerRef.current;
                  if (!el) return;
                  const step = Math.max(40, Math.floor(el.clientWidth * 0.35));
                  if (e.key === 'ArrowLeft') {
                    el.scrollLeft = Math.max(0, el.scrollLeft - step);
                    setScrollSync((x) => x + 1);
                    e.preventDefault();
                  } else if (e.key === 'ArrowRight') {
                    el.scrollLeft = Math.min(Math.max(0, el.scrollWidth - el.clientWidth), el.scrollLeft + step);
                    setScrollSync((x) => x + 1);
                    e.preventDefault();
                  }
                }}
                style={{
                  flex: 1,
                  position: 'relative',
                  height: 26,
                  minHeight: 44,
                  borderRadius: 6,
                  background: ganttTheme.overviewWell,
                  border: `1px solid ${ganttTheme.overviewBorder}`,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
                onClick={(e) => {
                  const el = containerRef.current;
                  if (!el) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  const maxS = Math.max(0, el.scrollWidth - el.clientWidth);
                  el.scrollLeft = ratio * maxS;
                  setScrollSync((x) => x + 1);
                }}
              >
                {flatSegs.map((seg) => {
                  const rm = rowMetrics[seg.id];
                  if (!rm || rm.depRel == null || Number.isNaN(rm.depRel)) return null;
                  const spanM = timelineExtentHours * 60;
                  const arr = rm.arrRel != null && !Number.isNaN(rm.arrRel) ? rm.arrRel : rm.depRel + 45;
                  const left = Math.max(0, Math.min(100, (rm.depRel / spanM) * 100));
                  const w = Math.max(0.6, Math.min(100 - left, ((arr - rm.depRel) / spanM) * 100));
                  const c = getSegmentGanttColors(seg, seg._colorIdx);
                  return (
                    <div
                      key={`ov-${seg.id}`}
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        width: `${w}%`,
                        top: '18%',
                        bottom: '18%',
                        background: c.bar,
                        borderRadius: 2,
                        opacity: 0.88,
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}
                {(() => {
                  void scrollSync;
                  const el = containerRef.current;
                  if (!el) return null;
                  const sw = el.scrollWidth;
                  const cw = el.clientWidth;
                  const sl = el.scrollLeft;
                  const thumbW = Math.min(100, (cw / Math.max(sw, 1)) * 100);
                  const maxSl = Math.max(1, sw - cw);
                  const thumbL = (sl / maxSl) * (100 - thumbW);
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        bottom: 2,
                        left: `${Number.isNaN(thumbL) ? 0 : thumbL}%`,
                        width: `${Math.max(thumbW, 5)}%`,
                        border: '1px solid #FFC136',
                        borderRadius: 4,
                        pointerEvents: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  );
                })()}
                {nowLineOnAxis ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(nowRelMin / (timelineExtentHours * 60)) * 100}%`,
                      width: 4,
                      marginLeft: -2,
                      background: 'linear-gradient(90deg, transparent, rgba(255,193,54,0.95) 35%, rgba(255,193,54,1) 50%, rgba(255,193,54,0.95) 65%, transparent)',
                      boxShadow: '0 0 12px rgba(255,193,54,0.65)',
                      opacity: 1,
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          className={`porter-gantt-scroll overflow-x-auto ${fillViewport ? 'flex-1 min-h-0' : ''}`}
          ref={containerRef}
          style={{
            cursor: dragging ? 'grabbing' : 'default',
            overflowY: 'auto',
            flex: fillViewport ? 1 : undefined,
            minHeight: fillViewport ? 'min(42vh, 520px)' : undefined,
            maxHeight: fillViewport ? 'none' : 'min(72vh, 880px)',
          }}
        >
          <div className="gantt-timeline-capture-root" style={{ minWidth: LABEL_W + TOTAL_WIDTH + 32, position: 'relative' }}>

            {/* Hour ruler — sticky top; left gutter matches label column and stays fixed on horizontal scroll */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 30, background: ganttTheme.rulerBg }}>
              <div
                style={{
                  ...stickyLabelStyle,
                  width: LABEL_W,
                  minWidth: LABEL_W,
                  height: RULER_H,
                  zIndex: 32,
                  borderBottom: `1px solid ${ganttTheme.hairline}`,
                  borderRight: `1px solid ${ganttTheme.hairline2}`,
                }}
                aria-hidden="true"
              />
              <div style={{ width: TOTAL_WIDTH, position: 'relative', height: RULER_H, borderBottom: `1px solid ${ganttTheme.hairline}`, flexShrink: 0 }}>
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      left: h * PIXELS_PER_HOUR,
                      top: 0,
                      height: '100%',
                      width: isDayBoundaryHour(h) ? 2 : 1,
                      background: ganttTheme.gridVx(isDayBoundaryHour(h)),
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: multiDayAxis ? 6 : 8,
                        left: 4,
                        fontSize: multiDayAxis ? 7 : 8,
                        fontWeight: 800,
                        letterSpacing: multiDayAxis ? '0.04em' : '0.06em',
                        color: isDayBoundaryHour(h) ? '#fcd34d' : '#64748b',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        textTransform: multiDayAxis ? 'none' : 'uppercase',
                      }}
                    >
                      {hourTickLabel(h)}
                    </span>
                  </div>
                ))}
                {zoom >= 1.2 && Array.from({ length: timelineExtentHours }, (_, h) => (
                  <div
                    key={`half-${h}`}
                    style={{
                      position: 'absolute',
                      left: h * PIXELS_PER_HOUR + PIXELS_PER_HOUR / 2,
                      top: '55%',
                      height: '45%',
                      width: 1,
                      background: 'rgba(255,255,255,0.09)',
                      pointerEvents: 'none',
                    }}
                  >
                    {zoom >= 1.8 && (
                      <span style={{ position: 'absolute', top: -1, left: 3, fontSize: 6, fontWeight: 700, color: 'rgba(100,116,139,0.7)', whiteSpace: 'nowrap', userSelect: 'none' }}>
                        :30
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Current-time line — own layer below flight bars (connectors stay on top) */}
            <svg
              className="gantt-now-line-layer"
              style={{ position: 'absolute', top: RULER_H, left: 0, width: LABEL_W + TOTAL_WIDTH, height: ganttBodyHeight, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}
              aria-hidden="true"
            >
              {timelineBaseUtcMs != null && !Number.isNaN(timelineBaseUtcMs) && (() => {
                const nrel = (Date.now() - timelineBaseUtcMs) / 60000;
                if (nrel < 0 || nrel > timelineExtentHours * 60) return null;
                const nx = LABEL_W + minToX(nrel);
                return (
                  <g className="gantt-now-line-group">
                    <line className="gantt-now-line-halo" x1={nx} y1={0} x2={nx} y2={ganttBodyHeight} stroke="#FFC136" strokeWidth={5} strokeOpacity={0.22} strokeLinecap="butt" />
                    <line className="gantt-now-line" x1={nx} y1={0} x2={nx} y2={ganttBodyHeight} stroke="#FFC136" strokeWidth={3} strokeOpacity={0.98} strokeLinecap="butt" />
                  </g>
                );
              })()}
            </svg>

            {/* SVG connector overlay — drawn on top of all rows */}
            <svg
              style={{ position: 'absolute', top: RULER_H, left: 0, width: LABEL_W + TOTAL_WIDTH, height: ganttBodyHeight, pointerEvents: 'none', zIndex: 15, overflow: 'visible' }}
            >
              <defs>
                {connectors.map(c => (
                  <marker key={`m-${c.key}`} id={`arrow-${c.key}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <circle cx="3" cy="3" r="2" fill={c.isShort ? '#ef4444' : c.isTight ? '#f59e0b' : c.color.dot} fillOpacity="0.8" />
                  </marker>
                ))}
              </defs>
              {connectors.map(({ x1, y1, x2, y2, color, connMinutes, isShort, isTight, key, curveOff }) => {
                const strokeColor = isShort ? '#ef444488' : isTight ? '#f59e0b88' : `${color.bar}99`;
                const midX = (x1 + x2) / 2;
                const off = curveOff || 0;
                const d = `M${x1},${y1} C${midX},${y1 + off} ${midX},${y2 - off} ${x2},${y2}`;
                const labelX = midX;
                const labelY = (y1 + y2) / 2;
                const showLabel = connMinutes !== null;
                const labelW = connMinutes >= 60 && connMinutes % 60 > 0 ? 44 : 32;
                const isStraight = Math.abs(y1 - y2) < 1;
                const dashPattern = isStraight ? '6 7' : '8 11';
                return (
                  <g key={key}>
                    <path
                      className={`gantt-connector-path ${isStraight ? 'gantt-connector-path--straight' : 'gantt-connector-path--curved'}`}
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={dashPattern}
                      markerEnd={`url(#arrow-${key})`}
                    />
                    {showLabel && (
                      <g>
                        <rect x={labelX - labelW / 2} y={labelY - 8} width={labelW} height={14} rx={7} fill={ganttTheme.connectorRect} fillOpacity="0.92" stroke={strokeColor} strokeWidth="1.2" />
                        <text x={labelX} y={labelY + 3} textAnchor="middle" fontSize="7" fontWeight="800" fill={isShort ? '#f87171' : isTight ? '#fbbf24' : '#64748b'} style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {connMinutes >= 60 ? `${Math.floor(connMinutes/60)}h${connMinutes%60>0?`${connMinutes%60}m`:''}` : `${connMinutes}m`}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Date groups + rows — z-index above gantt-now-line-layer so bars cover the live line */}
            {segsByDate.map(({ date, segs }) => (
              <div key={date} style={{ position: 'relative', zIndex: 2 }}>
                {/* Date label */}
                <div style={{ display: 'flex', alignItems: 'center', height: DATE_HEADER_H, background: ganttTheme.dateHeaderBg, borderBottom: `1px solid ${ganttTheme.hairline3}` }}>
                  <div
                    style={{
                      ...stickyLabelStyle,
                      width: LABEL_W,
                      minWidth: LABEL_W,
                      paddingLeft: 10,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      zIndex: 26,
                      background: ganttTheme.stickyLabelGradient,
                      borderLeft: '3px solid #FFC136',
                      borderRight: `1px solid ${ganttTheme.hairline2}`,
                    }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FFC136' }}>
                      {date === '__nodate__' ? t('mytrips_gantt_no_date', 'No date') : (() => {
                        const norm = String(date).replace(/\//g, '-');
                        const m = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        if (m) return `${m[1]}/${m[2]}/${m[3]}`;
                        const d = new Date(norm + 'T12:00:00');
                        return Number.isNaN(d.getTime()) ? date : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                      })()}
                    </span>
                  </div>
                  <div style={{ width: TOTAL_WIDTH, minWidth: TOTAL_WIDTH, flexShrink: 0, position: 'relative', height: '100%' }}>
                    {HOURS.map(h => (
                      <div
                        key={h}
                        style={{
                          position: 'absolute',
                          left: h * PIXELS_PER_HOUR,
                          top: 0,
                          bottom: 0,
                          width: isDayBoundaryHour(h) ? 2 : 1,
                          background: ganttTheme.gridVxBody(isDayBoundaryHour(h)),
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Flight rows */}
                {segs.map((seg) => {
                  const rm = rowMetrics[seg.id];
                  const depMin = parseTime(seg.depTime);
                  const arrMin = parseTime(seg.arrTime);
                  const color = getSegmentGanttColors(seg, seg._colorIdx);
                  const hasBoth = depMin !== null && arrMin !== null;
                  const depRel = rm?.depRel;
                  const arrRel = rm?.arrRel;
                  const hasDep = (depRel != null && !Number.isNaN(depRel)) || depMin !== null;
                  const adjArr = hasBoth ? (arrMin < depMin ? arrMin + 1440 : arrMin) : null;
                  const naiveBlockMin = hasBoth ? adjArr - depMin : null;
                  const zonedDurMin = hasBoth && seg.date && seg.date !== '__nodate__'
                    ? segmentZonedDurationMinutes(seg, airports)
                    : null;
                  const spanAnchorMin = hasBoth && depRel != null && arrRel != null && !Number.isNaN(depRel) && !Number.isNaN(arrRel)
                    ? Math.max(arrRel - depRel, 1)
                    : null;
                  const durMin = spanAnchorMin != null ? Math.round(spanAnchorMin) : (zonedDurMin != null ? zonedDurMin : naiveBlockMin);
                  const barLeft = depRel != null && !Number.isNaN(depRel) ? minToX(depRel) : (depMin !== null ? minToX(depMin) : 0);
                  const spanForWidth = spanAnchorMin != null ? spanAnchorMin : (zonedDurMin != null ? zonedDurMin : naiveBlockMin);
                  const barWidth = hasBoth && spanForWidth != null
                    ? Math.max(minToX(spanForWidth), 36)
                    : (hasDep ? 80 : 0);
                  /** Short legs: hide dots / plane / extra lines so labels are not stacked on handles */
                  const barTiny = barWidth < 52;
                  const barCompact = barWidth < 112;
                  const handleW = barTiny ? 9 : barCompact ? 12 : 14;
                  const showDotsAndPlane = hasBoth && !barCompact;
                  const showGripGlyph = barWidth >= 72;
                  const isDraggingThis = dragging && dragging.segId === seg.id;
                  const pair = getSegmentDepArrUtcPair(seg, airports);
                  const arrLocalDateAtDest = pair && pair.arrMs != null && pair.tzD ? utcMsToDateISOInZone(pair.arrMs, pair.tzD) : null;
                  const arrivalNextCalendarDay = !!(arrLocalDateAtDest && seg.date && seg.date !== '__nodate__' && arrLocalDateAtDest !== seg.date);
                  const utcDragOk = pair && pair.arrMs != null && pair.tzO && pair.tzD;
                  const originSegDate = seg.date || null;
                  const dragPayloadMove = utcDragOk
                    ? { mode: 'utc', segId: seg.id, type: 'move', originSegDate, origDepUtc: pair.depMs, origArrUtc: pair.arrMs, tzO: pair.tzO, tzD: pair.tzD }
                    : { mode: 'naive', segId: seg.id, type: 'move', originSegDate, origDep: depMin, origArr: arrMin };
                  const dragPayloadResizeL = utcDragOk
                    ? { mode: 'utc', segId: seg.id, type: 'resizeLeft', originSegDate, origDepUtc: pair.depMs, origArrUtc: pair.arrMs, tzO: pair.tzO, tzD: pair.tzD }
                    : { mode: 'naive', segId: seg.id, type: 'resizeLeft', originSegDate, origDep: depMin, origArr: adjArr };
                  const dragPayloadResizeR = utcDragOk
                    ? { mode: 'utc', segId: seg.id, type: 'resizeRight', originSegDate, origDepUtc: pair.depMs, origArrUtc: pair.arrMs, tzO: pair.tzO, tzD: pair.tzD }
                    : { mode: 'naive', segId: seg.id, type: 'resizeRight', originSegDate, origDep: depMin, origArr: adjArr };

                  const oCode = normalizeAirportIata(seg.origin, airports);
                  const dCode = normalizeAirportIata(seg.destination, airports);
                  const routeLong =
                    showAirportCities && oCode && airports[oCode] && dCode && airports[dCode]
                      ? `${oCode} ${airports[oCode].city || ''} → ${dCode} ${airports[dCode].city || ''}`.replace(/\s+/g, ' ').trim()
                      : null;
                  const routePrimary = routeLong || `${seg.origin || '?'} → ${seg.destination || '?'}`;
                  const isSelected = selectedSegId === seg.id;

                  return (
                    <div
                      key={seg.id}
                      style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT, borderBottom: `1px solid ${ganttTheme.hairline4}`, position: 'relative' }}
                      className={`gantt-print-seg-row ${isDraggingThis ? '' : 'gantt-row-hover'}`}
                    >
                      {/* Left label panel — sticky on horizontal scroll */}
                      <div
                        style={{
                          ...stickyLabelStyle,
                          width: LABEL_W,
                          minWidth: LABEL_W,
                          paddingLeft: 12,
                          paddingRight: 8,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: 2,
                          borderRight: `2px solid ${color.bar}44`,
                          zIndex: 35,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color.bar, flexShrink: 0, boxShadow: `0 0 5px ${color.glow}` }} />
                          <span style={{ fontSize: 10, fontWeight: 800, color: ganttTheme.labelText, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                            {routePrimary}
                          </span>
                          <button
                            type="button"
                            className="gantt-mobile-edit"
                            style={{
                              flexShrink: 0,
                              fontSize: 7,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.2)',
                              background: 'rgba(255,255,255,0.08)',
                              color: ganttTheme.labelText,
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectSeg(seg.id, 'timeline');
                              setQuickEditSeg(seg);
                              setQuickDep(seg.depTime || '');
                              setQuickArr(seg.arrTime || '');
                            }}
                          >
                            {t('mytrips_gantt_edit_times', 'Edit')}
                          </button>
                        </div>
                        {(seg.flightNo || seg.airline) && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: ganttTheme.labelMuted, paddingLeft: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {seg.airline || ''}{seg.flightNo ? ` ${seg.flightNo}` : ''}
                          </span>
                        )}
                        {hasBoth && durMin != null && durMin > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: color.dot, paddingLeft: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {fmtDur(durMin)}
                          </span>
                        )}
                      </div>

                      {/* Timeline track — clip so translateX drag cannot paint over the sticky label column */}
                      <div style={{ width: TOTAL_WIDTH, position: 'relative', height: '100%', flexShrink: 0, overflow: 'hidden' }}>
                        {/* Hour grid */}
                        {HOURS.map(h => (
                          <div
                            key={h}
                            style={{
                              position: 'absolute',
                              left: h * PIXELS_PER_HOUR,
                              top: 0,
                              bottom: 0,
                              width: isDayBoundaryHour(h) ? 2 : 1,
                              background: ganttTheme.gridRowHour(h),
                            }}
                          />
                        ))}

                        {/* Flight bar */}
                        {hasDep && (
                          <div
                            role="group"
                            tabIndex={0}
                            aria-label={`${t('mytrips_gantt_bar_label', 'Flight segment')}: ${routePrimary}`}
                            aria-selected={isSelected}
                            style={{
                              position: 'absolute',
                              left: barLeft,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: barWidth,
                              height: 40,
                              boxSizing: 'border-box',
                              background: `linear-gradient(160deg, ${color.bar}ff 0%, ${color.bar}ee 45%, ${color.border}cc 100%)`,
                              borderRadius: 7,
                              border: `1.5px solid ${isSelected ? '#FFC136' : color.border}`,
                              cursor: isDraggingThis && dragging.type === 'move' ? 'grabbing' : 'grab',
                              userSelect: 'none',
                              boxShadow: isDraggingThis
                                ? `0 0 0 2px ${color.dot}66, 0 6px 20px ${color.glow}`
                                : isSelected
                                  ? `inset 0 0 0 2px rgba(255,193,54,0.75), 0 2px 8px rgba(0,0,0,0.4)`
                                  : `0 2px 8px rgba(0,0,0,0.4), 0 0 0 0px transparent`,
                              display: 'block',
                              overflow: 'hidden',
                              zIndex: isDraggingThis ? 25 : isSelected ? 12 : 10,
                              transition: isDraggingThis || reduceMotion ? 'none' : 'box-shadow 0.15s, border-color 0.15s',
                              outline: 'none',
                            }}
                            onClick={(e) => {
                              if (e.target.closest('[data-gantt-handle]')) return;
                              selectSeg(seg.id, 'timeline');
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              selectSeg(seg.id, 'timeline');
                              setQuickEditSeg(seg);
                              setQuickDep(seg.depTime || '');
                              setQuickArr(seg.arrTime || '');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                selectSeg(seg.id, 'timeline');
                                setQuickEditSeg(seg);
                                setQuickDep(seg.depTime || '');
                                setQuickArr(seg.arrTime || '');
                              }
                            }}
                            onMouseDown={(e) => {
                              activeDragBarRef.current = e.currentTarget;
                              handleMouseDown(e, dragPayloadMove);
                            }}
                            onTouchStart={(e) => {
                              activeDragBarRef.current = e.currentTarget;
                              handleTouchStart(e, dragPayloadMove.mode === 'naive' ? { ...dragPayloadMove, origArr: dragPayloadMove.origArr ?? (depMin ?? 0) + 60 } : dragPayloadMove);
                            }}
                            onMouseEnter={(e) => {
                              clearFlightHoverSchedule();
                              flightHoverPendingRef.current = {
                                segId: seg.id,
                                seg,
                                clientX: e.clientX,
                                clientY: e.clientY,
                                durMin,
                                arrivalNextCalendarDay,
                              };
                              flightHoverTipTimerRef.current = window.setTimeout(() => {
                                flightHoverTipTimerRef.current = null;
                                const p = flightHoverPendingRef.current;
                                if (!p || p.segId !== seg.id) return;
                                setFlightHoverTip({
                                  segId: p.segId,
                                  seg: p.seg,
                                  clientX: p.clientX,
                                  clientY: p.clientY,
                                  durMin: p.durMin,
                                  arrivalNextCalendarDay: p.arrivalNextCalendarDay,
                                });
                              }, FLIGHT_HOVER_TIP_DELAY_MS);
                            }}
                            onMouseMove={(e) => {
                              const p = flightHoverPendingRef.current;
                              if (p && p.segId === seg.id) {
                                p.clientX = e.clientX;
                                p.clientY = e.clientY;
                              }
                              setFlightHoverTip((prev) =>
                                prev && prev.segId === seg.id
                                  ? { ...prev, clientX: e.clientX, clientY: e.clientY }
                                  : prev
                              );
                            }}
                            onMouseLeave={() => {
                              clearFlightHoverSchedule();
                              setFlightHoverTip((prev) => (prev && prev.segId === seg.id ? null : prev));
                            }}
                          >
                            {/* Left resize handle */}
                            {hasBoth && (
                              <div
                                data-gantt-handle="left"
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: handleW,
                                  minWidth: handleW,
                                  minHeight: 44,
                                  cursor: 'ew-resize',
                                  borderRadius: '7px 0 0 7px',
                                  background: 'rgba(0,0,0,0.22)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  zIndex: 3,
                                  touchAction: 'none',
                                }}
                                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, dragPayloadResizeL); }}
                                onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, dragPayloadResizeL); }}
                              >
                                {showGripGlyph ? (
                                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', userSelect: 'none', letterSpacing: '-1px' }}>⋮</span>
                                ) : null}
                              </div>
                            )}

                            {/* Middle content — isolated from edge handles so short bars do not stack text on grips */}
                            <div
                              style={{
                                position: 'absolute',
                                left: hasBoth ? handleW : 6,
                                right: hasBoth ? handleW : 6,
                                top: 0,
                                bottom: 0,
                                display: 'flex',
                                flexDirection: showDotsAndPlane ? 'row' : 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: showDotsAndPlane ? 5 : 0,
                                overflow: 'hidden',
                                pointerEvents: 'none',
                                padding: '0 2px',
                                zIndex: 1,
                              }}
                            >
                              {showDotsAndPlane && (
                                <div
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: color.dot,
                                    border: `1.5px solid ${color.bar}`,
                                    boxShadow: `0 0 4px ${color.dot}88`,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textAlign: showDotsAndPlane ? 'left' : 'center' }}>
                                {barTiny ? (
                                  <div style={{ fontSize: 10, fontWeight: 900, color: color.text, opacity: 0.9, lineHeight: 1 }} title={`${seg.origin || '?'} → ${seg.destination || '?'}`}>
                                    ✈
                                  </div>
                                ) : barCompact ? (
                                  <div
                                    style={{
                                      fontSize: 8,
                                      fontWeight: 800,
                                      color: color.text,
                                      opacity: 0.95,
                                      letterSpacing: '0.02em',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={`${seg.origin || '?'} → ${seg.destination || '?'}${seg.depTime ? ` · ${seg.depTime}` : ''}${seg.arrTime ? `–${seg.arrTime}` : ''}`}
                                  >
                                    {(seg.origin || '?') + '→' + (seg.destination || '?')}
                                  </div>
                                ) : (
                                  <>
                                    {barWidth > 56 && (
                                      <div
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 800,
                                          color: color.text,
                                          opacity: 0.92,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}
                                      >
                                        {seg.origin} → {seg.destination}
                                      </div>
                                    )}
                                    {barWidth > 100 && seg.depTime && (
                                      <div style={{ fontSize: 8, color: color.text, opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {seg.origin} {seg.depTime}
                                        {seg.arrTime && seg.destination ? (
                                          <>
                                            {' · '}{seg.destination} {seg.arrTime}
                                            {arrivalNextCalendarDay && (
                                              <span style={{ fontWeight: 900, opacity: 0.95, marginLeft: 3 }} title="Arrival is the next calendar day at destination">
                                                +1
                                              </span>
                                            )}
                                          </>
                                        ) : seg.arrTime ? ` · ${seg.arrTime}` : ''}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {showDotsAndPlane && barWidth > 52 && (
                                <div style={{ fontSize: 11, opacity: 0.75, color: color.text, flexShrink: 0, lineHeight: 1 }} aria-hidden="true">
                                  ✈
                                </div>
                              )}
                              {showDotsAndPlane && (
                                <div
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: color.dot,
                                    border: `1.5px solid ${color.bar}`,
                                    boxShadow: `0 0 4px ${color.dot}88`,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </div>

                            {/* Right resize handle */}
                            {hasBoth && (
                              <div
                                data-gantt-handle="right"
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: handleW,
                                  minWidth: handleW,
                                  minHeight: 44,
                                  cursor: 'ew-resize',
                                  borderRadius: '0 7px 7px 0',
                                  background: 'rgba(0,0,0,0.22)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  zIndex: 3,
                                  touchAction: 'none',
                                }}
                                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, dragPayloadResizeR); }}
                                onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, dragPayloadResizeR); }}
                              >
                                {showGripGlyph ? (
                                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', userSelect: 'none', letterSpacing: '-1px' }}>⋮</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {flightHoverTip && !collapsed && (() => {
        const s = flightHoverTip.seg;
        const TW = 288;
        const TH = 276;
        let left = flightHoverTip.clientX + 10;
        let top = flightHoverTip.clientY + 10;
        if (typeof window !== 'undefined') {
          left = Math.min(Math.max(6, left), window.innerWidth - TW - 6);
          top = Math.min(Math.max(6, top), window.innerHeight - TH - 6);
        }
        const dateLine = formatSegmentDateLabel(s.date);
        const flightLine = [s.airline, s.flightNo].filter(Boolean).join(' ').trim();
        const aircraft = (s.aircraftIcao || '').trim();
        const metaLine = [flightLine, aircraft].filter(Boolean).join(' · ');
        const tipEl = (
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left,
              top,
              zIndex: 10050,
              width: TW,
              maxWidth: 'calc(100vw - 16px)',
              pointerEvents: 'none',
              padding: 12,
              borderRadius: 14,
              background: 'linear-gradient(180deg, rgba(12,18,32,0.98), rgba(7,12,22,0.98))',
              border: '1px solid rgba(255,255,255,0.16)',
              boxShadow: '0 16px 60px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 950, color: '#f8fafc', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(s.origin || '?') + ' → ' + (s.destination || '?')}
                </div>
                {metaLine ? (
                  <div style={{ marginTop: 3, fontSize: 10, fontWeight: 750, color: '#a7b2c5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {metaLine}
                  </div>
                ) : null}
              </div>
              {aircraft ? (
                <div style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,193,54,0.10)', color: '#fcd34d', fontSize: 10, fontWeight: 950, letterSpacing: '0.06em' }}>
                  {aircraft}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, height: 1, background: 'rgba(255,255,255,0.08)' }} />

            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>
              {dateLine ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Depart date</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#e2e8f0', textAlign: 'right' }}>{dateLine}</span>
                </div>
              ) : null}
              {s.depTime ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Depart</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: '#f8fafc', textAlign: 'right' }}>
                    {s.depTime}
                    <span style={{ color: '#7a8aa3', fontWeight: 700 }}> · {s.origin || 'Origin'}</span>
                  </span>
                </div>
              ) : null}
              {s.arrTime ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Arrive</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: '#f8fafc', textAlign: 'right' }}>
                    {s.arrTime}
                    <span style={{ color: '#7a8aa3', fontWeight: 700 }}> · {s.destination || 'Dest'}</span>
                    {flightHoverTip.arrivalNextCalendarDay ? (
                      <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,193,54,0.14)', color: '#fcd34d', fontSize: 9, fontWeight: 950, letterSpacing: '0.06em' }}>
                        +1 day
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {flightHoverTip.durMin != null && flightHoverTip.durMin > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Block</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: '#f8fafc', textAlign: 'right' }}>{fmtDur(flightHoverTip.durMin)}</span>
                </div>
              ) : null}
              {aircraft ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Aircraft</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: '#f8fafc', textAlign: 'right' }}>{aircraft}</span>
                </div>
              ) : null}
              {s.fareZone && String(s.fareZone).trim() ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6b7a92', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fare zone</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#e2e8f0', textAlign: 'right' }}>{String(s.fareZone).trim()}</span>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, fontSize: 9, fontWeight: 700, color: '#50627d', lineHeight: 1.25 }}>
              Timeline axis: <span style={{ color: '#7a8aa3', fontWeight: 800 }}>{ganttAnchorTz}</span>
            </div>
          </div>
        );
        if (typeof window !== 'undefined' && window.ReactDOM && document.body) {
          return window.ReactDOM.createPortal(tipEl, document.body);
        }
        return tipEl;
      })()}

      {quickEditSeg && !collapsed && typeof window !== 'undefined' && window.ReactDOM && document.body
        ? window.ReactDOM.createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="gantt-quick-edit-title"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10060,
                background: 'rgba(2,8,20,0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setQuickEditSeg(null);
              }}
            >
              <div
                style={{
                  width: 'min(360px, 100%)',
                  padding: 20,
                  borderRadius: 14,
                  background: '#0a1220',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div id="gantt-quick-edit-title" style={{ fontSize: 12, fontWeight: 900, color: '#fff', marginBottom: 14 }}>
                  {t('mytrips_gantt_quick_edit_title', 'Edit times')}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 16, lineHeight: 1.35 }}>
                  {(quickEditSeg.origin || '?') + ' → ' + (quickEditSeg.destination || '?')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{t('mytrips_gantt_dep', 'Departure')}</label>
                  <input
                    type="time"
                    value={quickDep}
                    onChange={(e) => setQuickDep(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0,0,0,0.35)',
                      color: '#e2e8f0',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                  <label style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{t('mytrips_gantt_arr', 'Arrival')}</label>
                  <input
                    type="time"
                    value={quickArr}
                    onChange={(e) => setQuickArr(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0,0,0,0.35)',
                      color: '#e2e8f0',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent',
                      color: '#94a3b8',
                      fontSize: 9,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                    onClick={() => setQuickEditSeg(null)}
                  >
                    {t('mytrips_gantt_cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#FFC136',
                      color: '#152C53',
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      safeUpdate(quickEditSeg.id, { depTime: quickDep, arrTime: quickArr });
                      setQuickEditSeg(null);
                    }}
                  >
                    {t('mytrips_gantt_save', 'Save')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {!coachDismissed && hasAnyTimes && !collapsed && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: 'rgba(2,8,20,0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            pointerEvents: 'auto',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gantt-coach-title"
        >
          <div
            style={{
              maxWidth: 360,
              width: '100%',
              background: '#0a1220',
              borderRadius: 14,
              padding: '18px 18px 16px',
              border: '1px solid rgba(255,193,54,0.35)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
            }}
          >
            <div id="gantt-coach-title" style={{ fontSize: 12, fontWeight: 900, color: '#fff', marginBottom: 10, letterSpacing: '0.04em' }}>
              {t('mytrips_gantt_coach_title', 'Flight timeline tips')}
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16, minHeight: 48 }}>
              {coachStep === 0
                ? t('mytrips_gantt_coach_1', 'Drag the middle of a bar to shift departure and arrival together.')
                : coachStep === 1
                  ? t('mytrips_gantt_coach_2', 'Drag the left or right edge to change only departure or arrival.')
                  : t('mytrips_gantt_coach_3', 'The gold line is “now” when your current time falls on this axis. Use the overview strip to jump along the trip.')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setCoachDismissed(true);
                  try {
                    localStorage.setItem('timeline_coach_v1', '1');
                  } catch (e5) {}
                }}
              >
                {t('mytrips_gantt_coach_skip', 'Skip')}
              </button>
              {coachStep < 2 ? (
                <button
                  type="button"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#FFC136',
                    color: '#152C53',
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                  onClick={() => setCoachStep((s) => s + 1)}
                >
                  {t('mytrips_gantt_coach_next', 'Next')}
                </button>
              ) : (
                <button
                  type="button"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#FFC136',
                    color: '#152C53',
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setCoachDismissed(true);
                    try {
                      localStorage.setItem('timeline_coach_v1', '1');
                    } catch (e6) {}
                  }}
                >
                  {t('mytrips_gantt_coach_done', 'Got it')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: ganttTheme.footerBg, borderTop: `1px solid ${ganttTheme.footerBorder}`, flexShrink: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: darkMode ? '#334155' : '#475569' }}>
            {t('mytrips_gantt_footer_drag', 'Drag bar to shift · Drag edges to resize')}
          </span>
          <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.04em', color: ganttTheme.labelMuted, maxWidth: 280, lineHeight: 1.35 }}>
            {t('mytrips_gantt_footer_color', 'Bar colors rotate by flight order in your list.')}
          </span>
        </div>
      )}
    </div>
  );
}
window.GanttTimeline = GanttTimeline;
