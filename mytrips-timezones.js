(function(g){
  "use strict";

// ── My Trips: local calendar date + airport-local wall time → UTC (connection / Gantt) ──
function getLocalCalendarDateISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TRIP_AIRPORT_IANA_OVERRIDES = {
  // US — Arizona (no DST)
  PHX: 'America/Phoenix', TUS: 'America/Phoenix', AZA: 'America/Phoenix', FLG: 'America/Phoenix',
  YUM: 'America/Phoenix', SGU: 'America/Phoenix', MSC: 'America/Phoenix', IWA: 'America/Phoenix',
  // US — Alaska & Hawaii
  HNL: 'Pacific/Honolulu', OGG: 'Pacific/Honolulu', KOA: 'Pacific/Honolulu', LIH: 'Pacific/Honolulu',
  ANC: 'America/Anchorage', FAI: 'America/Anchorage', JNU: 'America/Juneau', ADQ: 'America/Anchorage',
  BET: 'America/Anchorage', OTZ: 'America/Anchorage', BRW: 'America/Anchorage', SCC: 'America/Anchorage',
  // US — Florida panhandle / northern Gulf (Central; lon heuristic often says Eastern)
  PNS: 'America/Chicago', VPS: 'America/Chicago', ECP: 'America/Chicago', PFN: 'America/Chicago',
  MOB: 'America/Chicago',
  // US — Michigan Upper Peninsula / Wisconsin edge
  MQT: 'America/Menominee', ESC: 'America/Menominee', CMX: 'America/Menominee',
  // US — Indiana
  IND: 'America/Indiana/Indianapolis', SBN: 'America/Indiana/Indianapolis', EVV: 'America/Indiana/Tell_City',
  FWA: 'America/Indiana/Indianapolis', GYY: 'America/Chicago',
  // US — North Dakota
  DIK: 'America/Denver', ISN: 'America/Denver', XWA: 'America/Chicago', FAR: 'America/Chicago',
  // US — South Dakota
  RAP: 'America/Denver',
  // US — Nebraska / Kansas / Texas (Mountain vs Central)
  BFF: 'America/Denver', LBF: 'America/Denver', GRI: 'America/Chicago', GLD: 'America/Denver',
  DDC: 'America/Chicago', GCK: 'America/Chicago', LBB: 'America/Chicago', MAF: 'America/Chicago',
  // US — Idaho
  IDA: 'America/Boise', PIH: 'America/Boise', SUN: 'America/Boise', TWF: 'America/Boise',
  // US — Oregon & Nevada (Pacific)
  PDX: 'America/Los_Angeles', EUG: 'America/Los_Angeles', RDM: 'America/Los_Angeles',
  LAS: 'America/Los_Angeles', RNO: 'America/Los_Angeles',
  // US — territories
  SJU: 'America/Puerto_Rico', STT: 'America/St_Thomas', STX: 'America/St_Thomas', GUM: 'Pacific/Guam',
  SPN: 'Pacific/Saipan',
  // Canada — territories (heuristic often wrong)
  YXY: 'America/Whitehorse', YDA: 'America/Whitehorse', YZF: 'America/Yellowknife', YVQ: 'America/Edmonton',
  YCB: 'America/Cambridge_Bay', YRB: 'America/Resolute', YEV: 'America/Inuvik',
  // Canada — Saskatchewan (America/Regina = no DST; lon bands often map to Winnipeg/Edmonton)
  YXE: 'America/Regina', YQR: 'America/Regina', YPA: 'America/Regina',
  // Canada — Ontario (Thunder Bay ≠ Toronto)
  YQT: 'America/Thunder_Bay',
  // Australia
  ADL: 'Australia/Adelaide', PER: 'Australia/Perth', DRW: 'Australia/Darwin', BNE: 'Australia/Brisbane',
  OOL: 'Australia/Brisbane', CNS: 'Australia/Brisbane', HBA: 'Australia/Hobart', LST: 'Australia/Hobart',
  // Middle East / Asia hubs
  DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', DOH: 'Asia/Qatar', RUH: 'Asia/Riyadh', JED: 'Asia/Riyadh',
  DMM: 'Asia/Riyadh', KWI: 'Asia/Kuwait', BAH: 'Asia/Bahrain', MCT: 'Asia/Muscat', AMM: 'Asia/Amman',
  BEY: 'Asia/Beirut', IST: 'Europe/Istanbul', SAW: 'Europe/Istanbul', ESB: 'Europe/Istanbul',
  TLV: 'Asia/Jerusalem', HKG: 'Asia/Hong_Kong', SIN: 'Asia/Singapore', KUL: 'Asia/Kuala_Lumpur',
  BKK: 'Asia/Bangkok', MNL: 'Asia/Manila', CGK: 'Asia/Jakarta', DPS: 'Asia/Makassar',
  ICN: 'Asia/Seoul', NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', NGO: 'Asia/Tokyo',
  FUK: 'Asia/Tokyo', CTS: 'Asia/Tokyo', OKA: 'Asia/Tokyo',
  // China
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', PVG: 'Asia/Shanghai', CAN: 'Asia/Shanghai',
  SZX: 'Asia/Shanghai', CTU: 'Asia/Shanghai', TFU: 'Asia/Shanghai', XIY: 'Asia/Shanghai',
  URC: 'Asia/Urumqi',
  // India
  DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', BLR: 'Asia/Kolkata', MAA: 'Asia/Kolkata', CCU: 'Asia/Kolkata',
  // Russia (country default Moscow is wrong outside European Russia)
  SVO: 'Europe/Moscow', DME: 'Europe/Moscow', VKO: 'Europe/Moscow', LED: 'Europe/Moscow',
  KGD: 'Europe/Kaliningrad', SVX: 'Asia/Yekaterinburg', OVB: 'Asia/Novosibirsk', IKT: 'Asia/Irkutsk',
  VVO: 'Asia/Vladivostok', KHV: 'Asia/Vladivostok',
  // Brazil (country default São Paulo wrong for Amazon / NE)
  MAO: 'America/Manaus', BEL: 'America/Belem', FOR: 'America/Fortaleza', REC: 'America/Recife',
  SSA: 'America/Bahia',
  // Mexico
  CUN: 'America/Cancun', MID: 'America/Merida', TIJ: 'America/Tijuana', SJD: 'America/Mazatlan',
  // Spain — Canary Islands (country default Madrid)
  TFS: 'Atlantic/Canary', TFN: 'Atlantic/Canary', LPA: 'Atlantic/Canary', ACE: 'Atlantic/Canary',
  FUE: 'Atlantic/Canary', SPC: 'Atlantic/Canary',
  // France overseas
  PTP: 'America/Guadeloupe', FDF: 'America/Martinique', RUN: 'Indian/Reunion', PPT: 'Pacific/Tahiti',
  // UK / Gibraltar
  GIB: 'Europe/Gibraltar',
  // Caribbean / Central America
  PTY: 'America/Panama', SJO: 'America/Costa_Rica', SAL: 'America/El_Salvador', GUA: 'America/Guatemala',
  BZE: 'America/Belize', NAS: 'America/Nassau', KIN: 'America/Jamaica', MBJ: 'America/Jamaica',
  // Africa
  CAI: 'Africa/Cairo', ADD: 'Africa/Addis_Ababa', NBO: 'Africa/Nairobi', LOS: 'Africa/Lagos',
  CPT: 'Africa/Johannesburg', JNB: 'Africa/Johannesburg', CMN: 'Africa/Casablanca', FIH: 'Africa/Kinshasa',
  // Euro multi-federal / oddballs
  BSL: 'Europe/Zurich',
};

const TRIP_COUNTRY_DEFAULT_IANA = {
  UK: 'Europe/London', Ireland: 'Europe/Dublin', France: 'Europe/Paris', Germany: 'Europe/Berlin',
  Italy: 'Europe/Rome', Spain: 'Europe/Madrid', Netherlands: 'Europe/Amsterdam', Belgium: 'Europe/Brussels',
  Switzerland: 'Europe/Zurich', Austria: 'Europe/Vienna', Greece: 'Europe/Athens', Poland: 'Europe/Warsaw',
  Portugal: 'Europe/Lisbon', 'Czech Rep.': 'Europe/Prague', Norway: 'Europe/Oslo', Sweden: 'Europe/Stockholm',
  Finland: 'Europe/Helsinki', Denmark: 'Europe/Copenhagen', Iceland: 'Atlantic/Reykjavik',
  Mexico: 'America/Mexico_City', Brazil: 'America/Sao_Paulo', Argentina: 'America/Buenos_Aires',
  Chile: 'America/Santiago', Colombia: 'America/Bogota', Peru: 'America/Lima', Japan: 'Asia/Tokyo',
  China: 'Asia/Shanghai', India: 'Asia/Kolkata', Thailand: 'Asia/Bangkok', Singapore: 'Asia/Singapore',
  'South Korea': 'Asia/Seoul', Australia: 'Australia/Sydney', 'New Zealand': 'Pacific/Auckland',
  UAE: 'Asia/Dubai', Qatar: 'Asia/Qatar', Israel: 'Asia/Jerusalem', Morocco: 'Africa/Casablanca',
  'South Africa': 'Africa/Johannesburg', Turkey: 'Europe/Istanbul', Russia: 'Europe/Moscow',
};

function normalizeAirportIata(raw, airports) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  const head = s.split(/\s*[—–-]\s*/)[0].trim().toUpperCase();
  if (airports && airports[head]) return head;
  const m = s.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (airports && m && airports[m[1]]) return m[1];
  if (head.length === 3 && /^[A-Z]{3}$/.test(head)) return head;
  return (m && m[1]) ? m[1] : head.slice(0, 3).toUpperCase();
}

function getIanaTimeZoneForAirport(code, airports) {
  const c = normalizeAirportIata(code, airports);
  if (!c || !airports || !airports[c]) return null;
  if (TRIP_AIRPORT_IANA_OVERRIDES[c]) return TRIP_AIRPORT_IANA_OVERRIDES[c];
  const ap = airports[c];
  const country = ap.country;
  const lon = ap.lon;
  if (country === 'Canada') {
    if (lon < -115) return 'America/Vancouver';
    if (lon < -102) return 'America/Edmonton';
    if (lon < -95) return 'America/Winnipeg';
    if (lon < -75) return 'America/Toronto';
    if (lon < -60) return 'America/Halifax';
    return 'America/St_Johns';
  }
  if (country === 'USA') {
    if (lon < -118) return 'America/Los_Angeles';
    if (lon < -102) return 'America/Denver';
    if (lon < -87) return 'America/Chicago';
    return 'America/New_York';
  }
  if (country === 'Australia') {
    if (lon < 118) return 'Australia/Perth';
    if (lon < 132) return 'Australia/Adelaide';
    return 'Australia/Sydney';
  }
  return TRIP_COUNTRY_DEFAULT_IANA[country] || null;
}

function wallClockToUtcMs(dateStr, timeStr, timeZone) {
  if (!dateStr || !timeStr || !timeZone) return NaN;
  let hm = String(timeStr).trim();
  if (/^\d{1,2}:\d{2}$/.test(hm)) hm += ':00';
  const normDate = String(dateStr).replace(/\//g, '-');
  const [Y, M, D] = normDate.split('-').map(Number);
  const tp = hm.split(':').map(Number);
  const h = tp[0], mi = tp[1] || 0, se = tp[2] || 0;
  if ([Y, M, D, h, mi, se].some(x => Number.isNaN(x))) return NaN;

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const readWall = (utcMs) => {
    const parts = dtf.formatToParts(new Date(utcMs));
    const o = {};
    for (const p of parts) {
      if (p.type !== 'literal') o[p.type] = p.value;
    }
    let H = parseInt(o.hour, 10);
    if (H === 24) H = 0;
    return {
      y: parseInt(o.year, 10),
      m: parseInt(o.month, 10),
      d: parseInt(o.day, 10),
      H,
      Mi: parseInt(o.minute, 10),
      S: parseInt(o.second, 10)
    };
  };
  const matches = (utcMs) => {
    const w = readWall(utcMs);
    return w.y === Y && w.m === M && w.d === D && w.H === h && w.Mi === mi && w.S === se;
  };
  const anchor = Date.UTC(Y, M - 1, D, h, mi, se);
  for (let u = anchor - 48 * 3600000; u <= anchor + 48 * 3600000; u += 60000) {
    if (matches(u)) return u;
  }
  return NaN;
}

function addCalendarDaysISO(isoDate, deltaDays) {
  const s = String(isoDate).replace(/\//g, '-');
  const [y, mo, d] = s.split('-').map(Number);
  if ([y, mo, d].some(n => Number.isNaN(n))) return isoDate;
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function getSegmentDepArrUtcPair(seg, airports) {
  if (!seg || !seg.date || !seg.depTime) return null;
  const o = normalizeAirportIata(seg.origin, airports);
  const d = normalizeAirportIata(seg.destination, airports);
  if (!o || !airports[o]) return null;
  const tzO = getIanaTimeZoneForAirport(o, airports);
  if (!tzO) return null;
  const depMs = wallClockToUtcMs(seg.date, seg.depTime, tzO);
  if (Number.isNaN(depMs)) return null;
  if (!seg.arrTime || !d || !airports[d]) return { depMs, arrMs: null, tzO, tzD: null };
  const tzD = getIanaTimeZoneForAirport(d, airports);
  if (!tzD) return { depMs, arrMs: null, tzO, tzD: null };
  let arrMs = wallClockToUtcMs(seg.date, seg.arrTime, tzD);
  if (Number.isNaN(arrMs)) return { depMs, arrMs: null, tzO, tzD };
  if (arrMs <= depMs) {
    arrMs = wallClockToUtcMs(addCalendarDaysISO(seg.date, 1), seg.arrTime, tzD);
  }
  if (Number.isNaN(arrMs) || arrMs <= depMs) {
    for (let day = 2; day <= 3; day++) {
      arrMs = wallClockToUtcMs(addCalendarDaysISO(seg.date, day), seg.arrTime, tzD);
      if (!Number.isNaN(arrMs) && arrMs > depMs) break;
    }
  }
  if (Number.isNaN(arrMs) || arrMs <= depMs) return { depMs, arrMs: null, tzO, tzD };
  return { depMs, arrMs, tzO, tzD };
}

/** Layover in minutes using real UTC: arrival may fall on the day after departure (destination local). */
function tripConnectionMinutesBetweenSegments(prevSeg, nextSeg, airports) {
  if (!prevSeg || !nextSeg || !prevSeg.arrTime || !nextSeg.depTime || !prevSeg.date || !nextSeg.date) return null;
  const prevPair = getSegmentDepArrUtcPair(prevSeg, airports);
  const nextPair = getSegmentDepArrUtcPair(nextSeg, airports);
  if (prevPair && prevPair.arrMs != null && nextPair && !Number.isNaN(nextPair.depMs)) {
    return Math.round((nextPair.depMs - prevPair.arrMs) / 60000);
  }
  const prev = new Date(`${prevSeg.date}T${prevSeg.arrTime}`);
  const next = new Date(`${nextSeg.date}T${nextSeg.depTime}`);
  if (Number.isNaN(prev.getTime()) || Number.isNaN(next.getTime())) return null;
  return Math.round((next - prev) / 60000);
}

function minutesSinceAnchorMidnight(utcMs, rowDate, anchorTz) {
  if (utcMs == null || Number.isNaN(utcMs) || rowDate === '__nodate__' || !anchorTz) return null;
  const start = wallClockToUtcMs(rowDate, '00:00', anchorTz);
  if (Number.isNaN(start)) return null;
  return (utcMs - start) / 60000;
}

function utcMsToHHMM(utcMs, timeZone) {
  if (utcMs == null || Number.isNaN(utcMs) || !timeZone) return null;
  const dtf = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = dtf.formatToParts(new Date(utcMs));
  let h = ''; let m = '';
  for (const p of parts) {
    if (p.type === 'hour') h = p.value.padStart(2, '0');
    if (p.type === 'minute') m = p.value.padStart(2, '0');
  }
  if (h === '24') h = '00';
  return h && m ? `${h}:${m}` : null;
}

function utcMsToDateISOInZone(utcMs, timeZone) {
  if (utcMs == null || Number.isNaN(utcMs) || !timeZone) return null;
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = dtf.formatToParts(new Date(utcMs));
  const o = {};
  for (const p of parts) {
    if (p.type !== 'literal') o[p.type] = p.value;
  }
  return `${o.year}-${o.month}-${o.day}`;
}

/** Gate-to-gate minutes: dep = local at origin, arr = local at destination (same segment date + next day if needed). */
function segmentZonedDurationMinutes(seg, airports) {
  const p = getSegmentDepArrUtcPair(seg, airports);
  if (!p || p.arrMs == null) return null;
  const mins = Math.round((p.arrMs - p.depMs) / 60000);
  if (mins <= 0 || mins > 48 * 60) return null;
  return mins;
}
  g.MTTripTZ = {
    getLocalCalendarDateISO,
    normalizeAirportIata,
    getIanaTimeZoneForAirport,
    wallClockToUtcMs,
    tripConnectionMinutesBetweenSegments,
    addCalendarDaysISO,
    getSegmentDepArrUtcPair,
    minutesSinceAnchorMidnight,
    utcMsToHHMM,
    utcMsToDateISOInZone,
    segmentZonedDurationMinutes,
  };
})(typeof window !== "undefined" ? window : globalThis);
