const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs').promises;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'travel-log-data.json');
const ADMIN_DATA_FILE = path.join(__dirname, 'admin-site-data.json');
/** Min length 16. If unset, GET/PUT /api/admin/site-data return 503. */
const ADMIN_API_TOKEN = (process.env.ADMIN_API_TOKEN || '').trim();
/** Optional: same value as client admin password; enables HttpOnly session cookie via POST /api/admin/login (no token in browser for pull/push). */
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
const viteDist = path.join(__dirname, 'vite-scaffold', 'dist');
const useViteDist =
  process.env.USE_VITE_DIST !== '0' &&
  fsSync.existsSync(path.join(viteDist, 'index.html'));

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const ADMIN_SESSION_COOKIE = 'porter_admin';
const ADMIN_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const adminCookieSecure = process.env.ADMIN_COOKIE_SECURE === '1';

function viteContentSecurityPolicy() {
  return {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://server.arcgisonline.com',
        'https://a.basemaps.cartocdn.com',
        'https://b.basemaps.cartocdn.com',
        'https://c.basemaps.cartocdn.com',
      ],
      connectSrc: [
        "'self'",
        'https://server.arcgisonline.com',
        'https://a.basemaps.cartocdn.com',
        'https://b.basemaps.cartocdn.com',
        'https://c.basemaps.cartocdn.com',
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
      ],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  };
}

if (useViteDist && process.env.CSP_STRICT !== '0') {
  app.use(helmet({
    contentSecurityPolicy: viteContentSecurityPolicy(),
    crossOriginEmbedderPolicy: false,
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
}

app.use((req, res, next) => {
  if (req.method === 'PUT' && req.path === '/api/admin/site-data') {
    return express.json({ limit: '12mb' })(req, res, next);
  }
  next();
});
app.use(express.json({ limit: '512kb' }));

const apiReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const apiWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

/** Block prototype pollution and oversized keys */
const EMPLOYEE_ID_RE = /^[A-Za-z0-9._@-]{1,128}$/;
const MAX_STRING_LIST_LEN = 5000;
const MAX_ITEM_LEN = 256;

function validateEmployeeId(employeeId) {
  if (employeeId == null || typeof employeeId !== 'string') return { ok: false, error: 'employeeId is required' };
  const trimmed = employeeId.trim();
  if (!trimmed || trimmed.length > 128) return { ok: false, error: 'employeeId is invalid' };
  if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
    return { ok: false, error: 'employeeId is invalid' };
  }
  if (!EMPLOYEE_ID_RE.test(trimmed)) return { ok: false, error: 'employeeId is invalid' };
  return { ok: true, value: trimmed };
}

function sanitizeStringList(arr, label) {
  if (!Array.isArray(arr)) return { ok: false, error: `${label} must be an array` };
  if (arr.length > MAX_STRING_LIST_LEN) return { ok: false, error: `${label} is too large` };
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, MAX_ITEM_LEN);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return { ok: true, value: out };
}

function logLine(level, msg, extra) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}${extra != null ? ` ${JSON.stringify(extra)}` : ''}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Serialize all reads/writes to the JSON file (same-process safety). */
let dataFileQueue = Promise.resolve();

function enqueueDataFile(task) {
  dataFileQueue = dataFileQueue.then(task, task);
  return dataFileQueue;
}

async function readDataFile() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeDataFileAtomic(data) {
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

async function writeJsonFileAtomic(filePath, obj) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(obj, null, 2);
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, filePath);
}

function adminApiReady() {
  return ADMIN_API_TOKEN.length >= 16;
}

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    out[k] = v;
  });
  return out;
}

function createAdminSessionValue() {
  const exp = Date.now() + ADMIN_SESSION_MAX_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', ADMIN_API_TOKEN).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyAdminSessionValue(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const expected = crypto.createHmac('sha256', ADMIN_API_TOKEN).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

function requireAdminAuth(req, res, next) {
  if (!adminApiReady()) return res.status(503).json({ error: 'Admin API not configured' });
  const auth = req.headers.authorization || '';
  const m = typeof auth === 'string' && auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1] === ADMIN_API_TOKEN) return next();
  const cookies = parseCookies(req.headers.cookie);
  const sess = cookies[ADMIN_SESSION_COOKIE];
  if (sess && verifyAdminSessionValue(sess)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

/** Accepts same shape as admin backup JSON (version 2.x). */
function normalizeAdminSitePayload(body) {
  const b = body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  if (!Array.isArray(b.airlines) || !Array.isArray(b.jumpseat)) return null;
  if (!Array.isArray(b.faq) || !Array.isArray(b.notifications)) return null;
  if (b.staff != null && !Array.isArray(b.staff)) return null;
  if (b.zedFareTables != null && (typeof b.zedFareTables !== 'object' || Array.isArray(b.zedFareTables))) return null;
  if (b.airlines.length > 12000 || b.jumpseat.length > 60000 || b.faq.length > 5000 || b.notifications.length > 2000) return null;
  const staff = Array.isArray(b.staff) ? b.staff : [];
  if (staff.length > 5000) return null;
  return {
    version: typeof b.version === 'string' ? b.version.slice(0, 48) : '2.3',
    exportDate: typeof b.exportDate === 'string' ? b.exportDate.slice(0, 80) : new Date().toISOString(),
    label: typeof b.label === 'string' ? b.label.slice(0, 240) : 'Server',
    airlines: b.airlines,
    jumpseat: b.jumpseat,
    faq: b.faq,
    notifications: b.notifications,
    staff,
    zedFareTables: b.zedFareTables && typeof b.zedFareTables === 'object' ? b.zedFareTables : {},
  };
}


/** Deny serving sensitive repo files as static assets (legacy mode serves `__dirname`). */
function denySensitiveStatic(req, res, next) {
  const base = path.basename(req.path || '');
  const blocked = new Set([
    'travel-log-data.json',
    'admin-site-data.json',
    'package.json',
    'package-lock.json',
    '.env',
    'server.js',
  ]);
  if (blocked.has(base)) {
    logLine('warn', 'blocked static request', { path: req.path });
    return res.status(404).end();
  }
  next();
}

function staticSetHeaders(res, filePath) {
  const base = path.basename(filePath || '');
  if (base === 'precache-manifest.json') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
}

/** ECB-based daily rates via Frankfurter; cached 24h in memory with last-good fallback. */
const FX_USD_CAD_DEFAULT = { rate: 1.36, date: '2026-03-01' };
const FX_CACHE_MS = 24 * 60 * 60 * 1000;
let fxUsdCadMem = { ...FX_USD_CAD_DEFAULT, fetchedAt: 0 };

async function fetchUsdCadFromFrankfurter() {
  const url = 'https://api.frankfurter.app/latest?from=USD&to=CAD';
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const cad = j.rates && j.rates.CAD;
    if (typeof cad !== 'number' || !Number.isFinite(cad) || cad < 0.5 || cad > 3) {
      throw new Error('invalid rate');
    }
    const date = typeof j.date === 'string' ? j.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return { rate: cad, date };
  } finally {
    clearTimeout(tid);
  }
}

async function resolveUsdCadFx() {
  const now = Date.now();
  if (fxUsdCadMem.fetchedAt && now - fxUsdCadMem.fetchedAt < FX_CACHE_MS) {
    return { rate: fxUsdCadMem.rate, date: fxUsdCadMem.date, stale: false };
  }
  try {
    const fresh = await fetchUsdCadFromFrankfurter();
    fxUsdCadMem = { ...fresh, fetchedAt: now };
    return { ...fresh, stale: false };
  } catch (err) {
    logLine('warn', 'FX USD/CAD fetch failed', { message: err && err.message });
    return { rate: fxUsdCadMem.rate, date: fxUsdCadMem.date, stale: true };
  }
}

app.get('/api/fx/usd-cad', apiReadLimiter, async (req, res) => {
  try {
    const out = await resolveUsdCadFx();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'FX unavailable' });
  }
});

app.get('/api/travel-log', apiReadLimiter, async (req, res) => {
  const q = validateEmployeeId(req.query.employeeId);
  if (!q.ok) return res.status(400).json({ error: q.error });
  const started = Date.now();
  try {
    const all = await enqueueDataFile(() => readDataFile());
    const log = all[q.value] || { airlines: [], airports: [], lastUpdated: null };
    res.json(log);
    logLine('info', 'GET /api/travel-log', { ms: Date.now() - started, employeeId: q.value });
  } catch (err) {
    logLine('error', 'GET /api/travel-log failed', { message: err && err.message });
    res.status(500).json({ error: 'Failed to read travel log' });
  }
});

app.put('/api/travel-log', apiWriteLimiter, async (req, res) => {
  const body = req.body || {};
  const q = validateEmployeeId(body.employeeId);
  if (!q.ok) return res.status(400).json({ error: q.error });

  const airlinesR = sanitizeStringList(body.airlines, 'airlines');
  if (!airlinesR.ok) return res.status(400).json({ error: airlinesR.error });
  const airportsR = sanitizeStringList(body.airports, 'airports');
  if (!airportsR.ok) return res.status(400).json({ error: airportsR.error });

  const lastUpdated = typeof body.lastUpdated === 'number' && Number.isFinite(body.lastUpdated) ? body.lastUpdated : Date.now();

  const started = Date.now();
  try {
    await enqueueDataFile(async () => {
      const all = await readDataFile();
      all[q.value] = {
        airlines: airlinesR.value,
        airports: airportsR.value,
        lastUpdated,
      };
      await writeDataFileAtomic(all);
    });
    res.json({ ok: true });
    logLine('info', 'PUT /api/travel-log', { ms: Date.now() - started, employeeId: q.value });
  } catch (err) {
    logLine('error', 'PUT /api/travel-log failed', { message: err && err.message });
    res.status(500).json({ error: 'Failed to save travel log' });
  }
});

app.post('/api/admin/login', apiWriteLimiter, (req, res) => {
  if (!adminApiReady()) return res.status(503).json({ error: 'Admin API not configured' });
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin password login not configured (set ADMIN_PASSWORD on the server)' });
  }
  const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const token = createAdminSessionValue();
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: adminCookieSecure,
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_MAX_MS,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/site-data', apiReadLimiter, requireAdminAuth, async (req, res) => {
  const started = Date.now();
  try {
    const raw = await fs.readFile(ADMIN_DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
    logLine('info', 'GET /api/admin/site-data', { ms: Date.now() - started });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json({
        version: '2.3',
        exportDate: null,
        label: 'Empty',
        airlines: [],
        jumpseat: [],
        faq: [],
        notifications: [],
        staff: [],
        zedFareTables: {},
      });
      logLine('info', 'GET /api/admin/site-data (empty)', { ms: Date.now() - started });
      return;
    }
    logLine('error', 'GET /api/admin/site-data failed', { message: err && err.message });
    res.status(500).json({ error: 'Failed to read admin data' });
  }
});

app.put('/api/admin/site-data', apiWriteLimiter, requireAdminAuth, async (req, res) => {
  const norm = normalizeAdminSitePayload(req.body);
  if (!norm) return res.status(400).json({ error: 'Invalid admin payload' });
  const started = Date.now();
  try {
    await writeJsonFileAtomic(ADMIN_DATA_FILE, norm);
    res.json({ ok: true });
    logLine('info', 'PUT /api/admin/site-data', { ms: Date.now() - started });
  } catch (err) {
    logLine('error', 'PUT /api/admin/site-data failed', { message: err && err.message });
    res.status(500).json({ error: 'Failed to save admin data' });
  }
});

if (useViteDist) {
  app.use(denySensitiveStatic);
  app.use(express.static(viteDist, { setHeaders: staticSetHeaders }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(viteDist, 'index.html'));
  });
} else {
  app.use(denySensitiveStatic);
  app.use(express.static(__dirname, { setHeaders: staticSetHeaders }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'indexTEST.html'));
  });
}

app.listen(PORT, () => {
  const mode = useViteDist ? 'Vite build (vite-scaffold/dist)' : 'Legacy (indexTEST.html)';
  console.log(`Server listening on http://localhost:${PORT} — ${mode}`);
  if (fsSync.existsSync(path.join(viteDist, 'index.html'))) {
    console.log('  Tip: set USE_VITE_DIST=0 to force legacy indexTEST.html');
    console.log('  PWA: manifest start_url is ./ (app shell). Admin modal: set VITE_ADMIN_PASSWORD before Vite build for production.');
    console.log('  Admin API: ADMIN_API_TOKEN (16+ chars). Optional ADMIN_PASSWORD (match portal password) for HttpOnly session + cookie pull/push.');
    console.log('  CSP: strict for Vite dist (set CSP_STRICT=0 to disable). Legacy indexTEST.html keeps CSP off.');
  }
});
